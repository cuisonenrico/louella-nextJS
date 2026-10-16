/**
 * An order being typed on a phone, kept until it reaches the server.
 *
 * A reload, a phone call or a dropped signal must not throw away a morning
 * order. Saved as the person types; cleared once Save draft or Finalize
 * succeeds. Per user, branch, day and order, so two orders never mix.
 */
export interface OrderDraft {
  items: [productId: number, qty: number][];
  notes: string;
  savedAt: string;
}

export function orderDraftKey(p: { userId: number; branchId: number; date: string; orderId: number | null }): string {
  return `louella:order-draft:v1:${p.userId}:${p.branchId}:${p.date}:${p.orderId ?? 'new'}`;
}

function browserStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export function saveOrderDraft(key: string, draft: OrderDraft, storage: Storage | undefined = browserStorage()) {
  try {
    storage?.setItem(key, JSON.stringify(draft));
  } catch {
    /* The draft simply will not survive a reload. */
  }
}

export function loadOrderDraft(key: string, storage: Storage | undefined = browserStorage()): OrderDraft | null {
  try {
    const raw = storage?.getItem(key);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<OrderDraft>;
    if (!Array.isArray(d.items) || typeof d.savedAt !== 'string') return null;
    return { items: d.items, notes: typeof d.notes === 'string' ? d.notes : '', savedAt: d.savedAt };
  } catch {
    return null;
  }
}

export function clearOrderDraft(key: string, storage: Storage | undefined = browserStorage()) {
  try {
    storage?.removeItem(key);
  } catch {
    /* Nothing to clear. */
  }
}
