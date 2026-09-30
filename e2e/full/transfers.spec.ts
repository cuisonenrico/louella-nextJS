import { test, expect } from '../fixtures/test';
import { Api } from '../fixtures/api';
import { today } from '../fixtures/dates';
import { buildWorld, managerPage, type World } from '../fixtures/world';
import { InventorySheet } from '../pages/inventory-sheet.page';
import { PendingTransfers } from '../pages/pending-transfers.page';

/**
 * Branch-to-branch transfers (AGENTS.md, "Transfers need the receiving branch to accept"):
 *  - sending books the sender's PULL_OUT at once, pending;
 *  - the receiver's PULL_IN exists only after it accepts; a reject reverses the sender's PULL_OUT;
 *  - an accepted transfer is immutable on both sides — a correction is a transfer back;
 *  - a pull-out is capped by on-hand stock less rejects and any counted leftover.
 *
 * The SENDING side is driven as admin and the RECEIVING side as the branch's real manager. A branch
 * manager cannot send from the UI today — see the `test.fail` at the bottom.
 */

interface Adjustment {
  id: number;
  type: 'PULL_IN' | 'PULL_OUT' | 'ANOMALY';
  value: number;
  transferStatus: 'PENDING' | 'ACCEPTED' | 'REJECTED' | null;
  linkedAdjustmentId: number | null;
}

const adjustmentsOf = (api: Api, inventoryId: number) =>
  api.get<Adjustment[]>(`/inventory-adjustments/inventory/${inventoryId}`);

/** Two branches that track the same product today. The sender starts with `stock` delivered. */
async function twoBranches(api: Api, opts: { stock: number; counted?: number }) {
  const sender = await buildWorld(api, { products: 1 });
  const receiver = await buildWorld(api, { products: 0 }); // just a branch and its manager
  const product = sender.products[0]; // products are global; the receiver's branch gets a row for it too
  const date = today();
  const senderRow = await api.post<{ id: number }>('/inventory', {
    branchId: sender.branch.id,
    productId: product.id,
    date,
    quantity: 0,
    delivery: opts.stock,
    ...(opts.counted !== undefined && { leftover: opts.counted }),
  });
  const receiverRow = await api.post<{ id: number }>('/inventory', {
    branchId: receiver.branch.id,
    productId: product.id,
    date,
    quantity: 0,
    delivery: 0,
  });
  return { sender, receiver, product, date, senderRowId: senderRow.id, receiverRowId: receiverRow.id };
}

const managerApi = (request: Parameters<typeof Api.login>[0], w: World) =>
  Api.login(request, { email: w.manager.email, password: w.manager.password });

test.describe('transfers @stress', () => {
  test.describe.configure({ timeout: 120_000 });

  test('stock leaves the sender at once and reaches the receiver only on accept', async ({
    api,
    browser,
    page: senderPage,
  }) => {
    const stock = 20;
    const send = 8;
    const t = await twoBranches(api, { stock });
    const name = t.product.name;

    // The sender sends it.
    const senderSheet = new InventorySheet(senderPage);
    await senderSheet.open(t.sender.branch.name, t.date, [name]);
    await senderSheet.sendTransfer(name, t.receiver.branch.name, send);

    // It has left the sender already, and the sender's card shows it as sent…
    await senderSheet.expectNumber(name, 'Total Stock', stock - send);
    await expect(new PendingTransfers(senderPage).sentBadge).toBeVisible();
    // …but the receiver has NOT been credited: no PULL_IN exists yet.
    expect(await adjustmentsOf(api, t.receiverRowId)).toEqual([]);

    // The receiver's manager sees it incoming, with nothing added to their stock.
    const receiverPage = await managerPage(browser, t.receiver);
    const receiverSheet = new InventorySheet(receiverPage);
    await receiverSheet.open(t.receiver.branch.name, t.date, [name]);
    const incoming = new PendingTransfers(receiverPage);
    await expect(incoming.line(send, name)).toBeVisible();
    await expect(incoming.incomingBadge).toBeVisible();
    await receiverSheet.expectNumber(name, 'Total Stock', 0);

    // Accepting books the receiver's PULL_IN.
    await incoming.accept();
    await receiverSheet.expectNumber(name, 'Total Stock', send);

    // Both legs read ACCEPTED, are linked to each other, and carry the same quantity.
    const [out] = await adjustmentsOf(api, t.senderRowId);
    const [inn] = await adjustmentsOf(api, t.receiverRowId);
    expect(out).toMatchObject({ type: 'PULL_OUT', value: send, transferStatus: 'ACCEPTED' });
    expect(inn).toMatchObject({ type: 'PULL_IN', value: send, transferStatus: 'ACCEPTED' });
    expect(out.linkedAdjustmentId).toBe(inn.id);
    expect(inn.linkedAdjustmentId).toBe(out.id);

    await receiverPage.context().close();
  });

  test('a rejected transfer returns the stock to the sender and never credits the receiver', async ({
    api,
    browser,
    page: senderPage,
  }) => {
    const stock = 20;
    const send = 6;
    const t = await twoBranches(api, { stock });
    const name = t.product.name;

    const senderSheet = new InventorySheet(senderPage);
    await senderSheet.open(t.sender.branch.name, t.date, [name]);
    await senderSheet.sendTransfer(name, t.receiver.branch.name, send);
    await senderSheet.expectNumber(name, 'Total Stock', stock - send);

    const receiverPage = await managerPage(browser, t.receiver);
    const receiverSheet = new InventorySheet(receiverPage);
    await receiverSheet.open(t.receiver.branch.name, t.date, [name]);
    await new PendingTransfers(receiverPage).reject();
    await receiverSheet.expectNumber(name, 'Total Stock', 0);

    // The sender's pull-out is reversed (kept on record, soft-deleted), so it no longer counts.
    await senderSheet.open(t.sender.branch.name, t.date, [name]);
    await senderSheet.expectNumber(name, 'Total Stock', stock);
    await expect(new PendingTransfers(senderPage).panel).toHaveCount(0);
    expect(await adjustmentsOf(api, t.senderRowId)).toEqual([]);
    expect(await adjustmentsOf(api, t.receiverRowId)).toEqual([]);

    await receiverPage.context().close();
  });

  test('a pull-out is capped by on-hand stock less any counted leftover', async ({ api, page: senderPage }) => {
    const stock = 20;
    const counted = 15; // leftover already counted: that stock is spoken for
    const available = stock - counted; // no rejects here
    const t = await twoBranches(api, { stock, counted });
    const name = t.product.name;

    const sheet = new InventorySheet(senderPage);
    await sheet.open(t.sender.branch.name, t.date, [name]);

    // One over the limit is refused, says how much is available, and books nothing.
    const over = await sheet.attemptTransfer(name, t.receiver.branch.name, available + 1);
    expect(over.response.status()).toBe(400);
    await expect(over.dialog.getByText(new RegExp(`only ${available} are available`))).toBeVisible();
    expect(await adjustmentsOf(api, t.senderRowId)).toEqual([]);
    await senderPage.keyboard.press('Escape');

    // Exactly the limit goes through.
    await sheet.sendTransfer(name, t.receiver.branch.name, available);
    const booked = await adjustmentsOf(api, t.senderRowId);
    expect(booked).toHaveLength(1);
    expect(booked[0]).toMatchObject({ type: 'PULL_OUT', value: available, transferStatus: 'PENDING' });
  });

  test('only the receiver answers; an accepted transfer is immutable, and a correction is a transfer back', async ({
    api,
    browser,
    request,
  }) => {
    const stock = 20;
    const send = 8;
    const back = 3;
    const t = await twoBranches(api, { stock });
    const name = t.product.name;
    const senderApi = await managerApi(request, t.sender);
    const receiverApi = await managerApi(request, t.receiver);

    const sent = await senderApi.post<{ pullOut: { id: number } }>('/inventory-adjustments/transfer', {
      fromInventoryId: t.senderRowId,
      toInventoryId: t.receiverRowId,
      value: send,
    });
    const outId = sent.pullOut.id;

    // Only the receiving branch may answer — not the sender.
    expect((await senderApi.raw('POST', `/inventory-adjustments/${outId}/accept`)).status()).toBe(403);
    expect((await senderApi.raw('POST', `/inventory-adjustments/${outId}/reject`)).status()).toBe(403);

    await receiverApi.post(`/inventory-adjustments/${outId}/accept`);
    const [inn] = await adjustmentsOf(api, t.receiverRowId);

    // Accepted: neither leg can be edited or deleted — checked as admin, who holds the delete/edit
    // features, so it is the transfer rule that refuses and not a missing permission.
    const frozen = /accepted transfer cannot be changed or deleted/;
    for (const [leg, id] of [
      ['sender leg', outId],
      ['receiver leg', inn.id],
    ] as const) {
      const del = await api.raw('DELETE', `/inventory-adjustments/${id}`);
      expect(del.status(), `${leg} delete`).toBe(409);
      expect(await del.text()).toMatch(frozen);
      const edit = await api.raw('PATCH', `/inventory-adjustments/${id}`, { value: 1 });
      expect(edit.status(), `${leg} edit`).toBe(409);
      expect(await edit.text()).toMatch(frozen);
    }
    // Nothing moved.
    expect((await adjustmentsOf(api, t.senderRowId)).map((a) => a.value)).toEqual([send]);

    // The correction is a transfer back, which the original sender then accepts.
    const returned = await receiverApi.post<{ pullOut: { id: number } }>('/inventory-adjustments/transfer', {
      fromInventoryId: t.receiverRowId,
      toInventoryId: t.senderRowId,
      value: back,
    });
    await senderApi.post(`/inventory-adjustments/${returned.pullOut.id}/accept`);

    // Balances follow the rule: on-hand = quantity + delivery + Σ(PULL_IN) − Σ(PULL_OUT).
    const senderPage = await managerPage(browser, t.sender);
    const receiverPage = await managerPage(browser, t.receiver);
    const senderSheet = new InventorySheet(senderPage);
    const receiverSheet = new InventorySheet(receiverPage);
    await senderSheet.open(t.sender.branch.name, t.date, [name]);
    await receiverSheet.open(t.receiver.branch.name, t.date, [name]);
    await senderSheet.expectNumber(name, 'Total Stock', stock - send + back);
    await receiverSheet.expectNumber(name, 'Total Stock', send - back);

    await senderPage.context().close();
    await receiverPage.context().close();
  });

  // KNOWN PRODUCTION BUG, expected to fail (`test.fail` = passes while it still fails, and turns red the
  // moment it is fixed, so it cannot be forgotten). The server intends a branch manager to send stock
  // out ("scoped on the source: a branch manager pushes their own stock out"), but the adjustments
  // dialog finds the destination row by reading the OTHER branch's daily sheet —
  // GET /inventory/branch/<receiver>/date — which BranchGuard answers 403 for a branch-confined manager.
  // The dialog then wrongly says "Destination branch has no inventory record". Remove `test.fail` once
  // the destination lookup works for a manager.
  test('a branch manager can send a transfer from their own sheet', async ({ api, browser, request }) => {
    test.fail(true, "BranchGuard 403s the dialog's lookup of the destination branch for a scoped manager");
    const t = await twoBranches(api, { stock: 20 });
    const name = t.product.name;

    // The precise cause: the dialog needs the destination's row, found by reading that branch's day.
    const lookup = await (await managerApi(request, t.sender)).raw(
      'GET',
      `/inventory/branch/${t.receiver.branch.id}/date`,
      undefined,
      { date: t.date },
    );
    expect(lookup.status(), 'a manager looking up the destination branch\'s day').toBe(200);

    const senderPage = await managerPage(browser, t.sender);
    const forbidden: string[] = [];
    senderPage.on('response', (r) => {
      if (r.status() === 403) forbidden.push(r.url());
    });

    const sheet = new InventorySheet(senderPage);
    await sheet.open(t.sender.branch.name, t.date, [name]);
    await sheet.sendTransfer(name, t.receiver.branch.name, 5);

    expect(forbidden).toEqual([]);
    await senderPage.context().close();
  });
});
