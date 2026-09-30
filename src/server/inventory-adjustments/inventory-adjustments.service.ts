import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertBranchAccess,
  hasAllBranches,
  resolveBranchScope,
} from '../common/utils/branch-access';
import {
  lockInventoryChains,
  reconcileInventoryChains,
} from '../common/utils/stock-chain';
import { recordChanges } from '../common/utils/audit.util';
import { computeAdjSum } from '../common/utils/inventory-metrics.util';
import { CreateInventoryAdjustmentDto } from './dto/create-inventory-adjustment.dto';
import { UpdateInventoryAdjustmentDto } from './dto/update-inventory-adjustment.dto';
import { CreateTransferDto } from './dto/create-transfer.dto';

/**
 * The authenticated caller, as JwtStrategy puts it on the request. Re-exported
 * so the controller keeps importing it from here alongside the service.
 */
export type { RequestUser } from '../common/utils/branch-access';
import type { RequestUser } from '../common/utils/branch-access';

/** Adjustment writes and the carry-forward they trigger commit together. */
const WRITE_TX_OPTIONS = { timeout: 30_000, maxWait: 10_000 };

@Injectable()
export class InventoryAdjustmentsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lock the chains of the given rows before reading the stock that a cap
   * check decides on. Without it, two pull-outs of the last unit each saw one
   * unit available and both went through.
   */
  private async lockRows(
    tx: Prisma.TransactionClient,
    inventoryIds: number[],
  ): Promise<void> {
    const rows = await tx.inventory.findMany({
      where: { id: { in: inventoryIds } },
      select: { branchId: true, productId: true },
    });
    await lockInventoryChains(tx, rows);
  }

  /**
   * An adjustment changes its day's stock on hand. On a placeholder day that
   * moves the close; either way the following days must open on it. Carry
   * forward from each touched row's day, inside the writer's transaction.
   */
  private async carryForward(
    tx: Prisma.TransactionClient,
    inventoryIds: number[],
    userId?: number | null,
  ): Promise<void> {
    const rows = await tx.inventory.findMany({
      where: { id: { in: inventoryIds } },
      select: { branchId: true, productId: true, date: true },
    });
    await reconcileInventoryChains(
      tx,
      rows.map((r) => ({ branchId: r.branchId, productId: r.productId, fromDate: r.date })),
      { userId },
    );
  }

  /**
   * One movement is recorded as two legs once the receiver accepts, and the
   * receiving branch's stock, sales and cash then depend on it. Neither side
   * may change it alone: a correction is a new transfer the other way, which
   * the other branch accepts in turn. Legacy transfers (linked, no status)
   * are treated the same.
   */
  private assertNotAcceptedTransfer(adjustment: {
    transferStatus: string | null;
    linkedAdjustmentId: number | null;
  }): void {
    if (adjustment.transferStatus === 'ACCEPTED' || adjustment.linkedAdjustmentId !== null) {
      throw new ConflictException(
        'An accepted transfer cannot be changed or deleted. To correct it, send a transfer back.',
      );
    }
  }

  /**
   * Branch isolation for a domain BranchGuard cannot reach.
   *
   * Every endpoint here addresses rows by `inventoryId` or adjustment `id`, and
   * never carries a `branchId` in the body, path or query — the only places the
   * guard looks. So a branch-scoped user was free to adjust any branch's rows,
   * and adjustments feed `sold`, which makes that write access to another
   * branch's revenue. The branch has to be resolved from the row instead, which
   * only the service can do.
   *
   * The rule itself lives in common/utils/branch-access.ts, shared with the
   * XLSX import, which is outside the guard's reach for a different reason.
   */
  private assertBranchAccess(
    user: RequestUser | undefined,
    branchId: number,
  ): void {
    assertBranchAccess(user, branchId);
  }

  /** Resolve the branch an adjustment belongs to, via its inventory row. */
  private async branchOfAdjustment(id: number) {
    const adjustment = await this.prisma.inventoryAdjustment.findFirst({
      where: { id, deletedAt: null },
      include: { inventory: { select: { branchId: true } } },
    });
    if (!adjustment)
      throw new NotFoundException('Inventory adjustment not found');
    return adjustment;
  }

  /**
   * Stock on hand for the day: opening + delivery, plus whatever adjustments
   * have already moved. Sales are not deducted — `leftover` is entered at close
   * of day, so mid-day this is the only figure that exists.
   *
   * Only pull-outs are capped by it. An ANOMALY records a discrepancy that has
   * already happened, and refusing to write one down because the numbers don't
   * add up would suppress exactly the entry worth keeping.
   */
  private async assertStockAvailable(
    tx: Prisma.TransactionClient,
    inventoryId: number,
    value: number,
    excludeAdjustmentId?: number,
  ): Promise<void> {
    const row = await tx.inventory.findFirst({
      where: { id: inventoryId, deletedAt: null },
      select: {
        quantity: true,
        delivery: true,
        leftover: true,
        reject: true,
        leftoverCountedAt: true,
        adjustments: {
          where: { deletedAt: null },
          select: { id: true, type: true, value: true },
        },
      },
    });
    if (!row) throw new NotFoundException('Inventory record not found');

    // On an edit the row under revision must not be counted against itself: a
    // pull-out that already claims the whole day's stock would otherwise leave
    // nothing available and refuse even a reduction.
    const others =
      excludeAdjustmentId == null
        ? row.adjustments
        : row.adjustments.filter((a) => a.id !== excludeAdjustmentId);

    // Rejects are gone, and on a counted day the leftover is already spoken
    // for: pulling out past them made sold (and revenue) negative. A pull-out
    // of counted leftover needs the leftover lowered first.
    const onHand = row.quantity + row.delivery + computeAdjSum(others);
    const heldBack = row.reject + (row.leftoverCountedAt !== null ? row.leftover : 0);
    const available = onHand - heldBack;
    if (value > available) {
      const why =
        row.leftoverCountedAt !== null
          ? ` (${onHand} on hand, less ${row.leftover} counted leftover and ${row.reject} rejected). If the leftover is being moved, lower the counted leftover first.`
          : row.reject > 0
            ? ` (${onHand} on hand, less ${row.reject} rejected).`
            : '.';
      throw new BadRequestException(
        `Cannot pull out ${value} units — only ${Math.max(0, available)} are available for this product and day${why}`,
      );
    }
  }

  async create(dto: CreateInventoryAdjustmentDto, user?: RequestUser) {
    const exists = await this.prisma.inventory.findFirst({
      where: { id: dto.inventoryId, deletedAt: null },
    });
    if (!exists) {
      throw new NotFoundException('Inventory record not found');
    }
    this.assertBranchAccess(user, exists.branchId);

    return this.prisma.$transaction(async (tx) => {
      await this.lockRows(tx, [dto.inventoryId]);
      if (dto.type === 'PULL_OUT') {
        await this.assertStockAvailable(tx, dto.inventoryId, dto.value);
      }
      const created = await tx.inventoryAdjustment.create({
        data: { ...dto, createdById: user?.id ?? null },
      });
      await recordChanges(
        tx,
        [{ entity: 'InventoryAdjustment', entityId: created.id, before: null, after: created }],
        user?.id,
      );
      await this.carryForward(tx, [dto.inventoryId], user?.id);
      return created;
    }, WRITE_TX_OPTIONS);
  }

  async findByInventory(inventoryId: number, user?: RequestUser) {
    const inventory = await this.prisma.inventory.findFirst({
      where: { id: inventoryId, deletedAt: null },
      select: { branchId: true },
    });
    if (!inventory) throw new NotFoundException('Inventory record not found');
    this.assertBranchAccess(user, inventory.branchId);

    return this.prisma.inventoryAdjustment.findMany({
      where: { inventoryId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  }

  async update(
    id: number,
    dto: UpdateInventoryAdjustmentDto,
    user?: RequestUser,
  ) {
    const existing = await this.branchOfAdjustment(id);
    this.assertBranchAccess(user, existing.inventory.branchId);

    this.assertNotAcceptedTransfer(existing);

    // A pending transfer is still a transfer: its type is fixed, though the
    // sender may correct the quantity until the receiver answers.
    if (
      existing.transferStatus === 'PENDING' &&
      dto.type !== undefined &&
      dto.type !== existing.type
    ) {
      throw new BadRequestException(
        'Cannot change the type of a pending transfer. Cancel it and create a new one.',
      );
    }

    // Standalone adjustment: cap it exactly as create() does, so the cap cannot
    // be sidestepped by creating a small pull-out and then raising it.
    const nextType = dto.type ?? existing.type;
    const changesAmount = dto.value !== undefined || dto.type !== undefined;

    return this.prisma.$transaction(async (tx) => {
      await this.lockRows(tx, [existing.inventoryId]);
      if (nextType === 'PULL_OUT' && changesAmount) {
        await this.assertStockAvailable(
          tx,
          existing.inventoryId,
          dto.value ?? existing.value,
          id,
        );
      }
      const updated = await tx.inventoryAdjustment.update({
        where: { id },
        data: { ...dto, updatedById: user?.id ?? null },
      });
      await recordChanges(
        tx,
        [{ entity: 'InventoryAdjustment', entityId: id, before: existing, after: updated }],
        user?.id,
      );
      await this.carryForward(tx, [existing.inventoryId], user?.id);
      return updated;
    }, WRITE_TX_OPTIONS);
  }

  async remove(id: number, user?: RequestUser) {
    const existing = await this.branchOfAdjustment(id);
    this.assertBranchAccess(user, existing.inventory.branchId);
    // A pending transfer may be cancelled by its sender; an accepted one is
    // the receiver's stock too.
    this.assertNotAcceptedTransfer(existing);

    return this.prisma.$transaction(async (tx) => {
      await this.lockRows(tx, [existing.inventoryId]);
      const before = await tx.inventoryAdjustment.findFirst({ where: { id, deletedAt: null } });
      if (!before) throw new NotFoundException('Inventory adjustment not found');
      // Re-checked under the lock: the receiver may have accepted meanwhile.
      this.assertNotAcceptedTransfer(before);
      const updated = await tx.inventoryAdjustment.update({
        where: { id },
        data: { deletedAt: new Date(), updatedById: user?.id ?? null },
      });
      await recordChanges(
        tx,
        [{ entity: 'InventoryAdjustment', entityId: id, before, after: updated, action: 'delete' }],
        user?.id,
      );
      await this.carryForward(tx, [existing.inventoryId], user?.id);
      return updated;
    }, WRITE_TX_OPTIONS);
  }

  /**
   * Send stock to another branch. The receiving branch must accept it.
   *
   * The stock leaves the sender now — it is physically on its way — so the
   * sender's PULL_OUT is booked immediately and marked PENDING. Nothing is
   * added to the receiver until someone there accepts (decision 2026-09-19):
   * a transfer used to credit the destination the moment the sender typed
   * it, raising that branch's computed sales with no one there confirming the
   * stock arrived.
   */
  async transfer(dto: CreateTransferDto, user?: RequestUser) {
    // The destination is named by its row OR by its branch — never both, never neither.
    const toBranchId = dto.toBranchId ?? null;
    const viaBranch = toBranchId !== null;
    if (viaBranch === (dto.toInventoryId != null)) {
      throw new BadRequestException(
        'Give either the destination row (toInventoryId) or the destination branch (toBranchId), not both and not neither.',
      );
    }

    const [from, to] = await Promise.all([
      this.prisma.inventory.findFirst({
        where: { id: dto.fromInventoryId, deletedAt: null },
      }),
      viaBranch
        ? null
        : this.prisma.inventory.findFirst({
            where: { id: dto.toInventoryId, deletedAt: null },
          }),
    ]);

    if (!from)
      throw new NotFoundException(
        `Source inventory record ${dto.fromInventoryId} not found`,
      );

    if (viaBranch) {
      if (from.branchId === toBranchId) {
        throw new BadRequestException(
          'Source and destination must be different branches.',
        );
      }
      const branch = await this.prisma.branch.findFirst({
        where: { id: toBranchId, deletedAt: null },
        select: { id: true, isActive: true },
      });
      if (!branch) throw new NotFoundException(`Destination branch ${toBranchId} not found`);
      if (!branch.isActive) throw new BadRequestException('The destination branch is not active.');
    } else {
      if (!to)
        throw new NotFoundException(
          `Destination inventory record ${dto.toInventoryId} not found`,
        );

      if (from.productId !== to.productId) {
        throw new BadRequestException(
          `Source (productId=${from.productId}) and destination (productId=${to.productId}) must track the same product.`,
        );
      }

      if (from.branchId === to.branchId) {
        throw new BadRequestException(
          'Source and destination must be different branches.',
        );
      }

      if (from.date.getTime() !== to.date.getTime()) {
        throw new BadRequestException(
          'Source and destination must be the same day. Stock cannot move between dates.',
        );
      }
    }

    // Scoped on the source: a branch manager pushes their own stock out. The
    // destination is protected by acceptance, which is scoped to it.
    this.assertBranchAccess(user, from.branchId);

    const pullOut = await this.prisma.$transaction(async (tx) => {
      if (viaBranch) {
        // Both chains in ONE call: the helper acquires in sorted order, so two
        // transfers going opposite ways between the same branches cannot deadlock.
        await lockInventoryChains(tx, [
          { branchId: from.branchId, productId: from.productId },
          { branchId: toBranchId, productId: from.productId },
        ]);
      }
      await this.lockRows(tx, [dto.fromInventoryId]);
      await this.assertStockAvailable(tx, dto.fromInventoryId, dto.value);
      // Resolved only after the cap check passes, and in the same transaction: a refused
      // transfer leaves no placeholder behind in the other branch.
      const toInventoryId = viaBranch
        ? await this.ensureDestinationRow(
            tx,
            { branchId: toBranchId, productId: from.productId, date: from.date },
            user?.id,
          )
        : to!.id;
      const out = await tx.inventoryAdjustment.create({
        data: {
          inventoryId: dto.fromInventoryId,
          type: 'PULL_OUT',
          value: dto.value,
          notes: dto.notes ?? null,
          createdById: user?.id ?? null,
          transferStatus: 'PENDING',
          transferToInventoryId: toInventoryId,
        },
      });
      await recordChanges(
        tx,
        [{ entity: 'InventoryAdjustment', entityId: out.id, before: null, after: out }],
        user?.id,
      );
      await this.carryForward(tx, [dto.fromInventoryId], user?.id);
      return out;
    }, WRITE_TX_OPTIONS);

    return { pullOut, pullIn: null, status: 'PENDING' as const };
  }

  /**
   * The receiving branch's row for the product and day, made ready to be the target of a transfer.
   *
   * A branch manager sends by naming the destination BRANCH, because they cannot read another
   * branch's sheet to find its row. So the server finds it here — and, when the receiver has not
   * opened that day yet, creates the same empty placeholder autofill or the sheet's Initialize would
   * (uncounted, so it sells nothing; it opens on the previous close through the stock chain). A
   * soft-deleted row is restored empty rather than resurrecting what was typed before.
   *
   * Runs inside the caller's transaction, after the chain locks are held.
   */
  private async ensureDestinationRow(
    tx: Prisma.TransactionClient,
    key: { branchId: number; productId: number; date: Date },
    userId?: number,
  ): Promise<number> {
    const where = {
      branchId_productId_date: { branchId: key.branchId, productId: key.productId, date: key.date },
    };
    const before = await tx.inventory.findUnique({ where });
    if (before && before.deletedAt === null) return before.id;

    const empty = {
      quantity: 0,
      delivery: 0,
      reject: 0,
      leftover: 0,
      leftoverCountedAt: null,
      isAutoGenerated: true,
      notes: 'Opened by an incoming transfer',
    };
    const after = await tx.inventory.upsert({
      where,
      update: { ...empty, deletedAt: null, updatedById: userId ?? null },
      create: { ...key, ...empty, createdById: userId ?? null },
    });
    await recordChanges(
      tx,
      [{ entity: 'Inventory', entityId: after.id, before, after, action: before ? 'restore' : 'create' }],
      userId,
    );
    await reconcileInventoryChains(tx, [{ ...key, fromDate: key.date }], { userId });
    return after.id;
  }

  /** Load a pending transfer and check the caller may answer for its destination. */
  private async pendingTransfer(id: number, user?: RequestUser) {
    const out = await this.prisma.inventoryAdjustment.findFirst({
      where: { id, deletedAt: null },
      include: {
        transferTo: { select: { id: true, branchId: true, deletedAt: true } },
      },
    });
    if (!out || out.transferStatus === null) {
      throw new NotFoundException('Transfer not found');
    }
    if (out.transferStatus !== 'PENDING') {
      throw new ConflictException(
        `This transfer was already ${out.transferStatus.toLowerCase()}.`,
      );
    }
    if (!out.transferTo || out.transferTo.deletedAt !== null) {
      throw new NotFoundException(
        'The destination day no longer exists. Reject the transfer, or cancel it from the sending branch.',
      );
    }
    // Only the receiving branch answers (or someone who sees every branch).
    this.assertBranchAccess(user, out.transferTo.branchId);
    return out as typeof out & { transferTo: { id: number; branchId: number } };
  }

  /**
   * The receiving branch confirms the stock arrived: its PULL_IN is booked
   * now, linked to the sender's PULL_OUT, and both legs read ACCEPTED.
   */
  async acceptTransfer(id: number, user?: RequestUser) {
    const out = await this.pendingTransfer(id, user);
    const destinationId = out.transferTo.id;

    return this.prisma.$transaction(async (tx) => {
      await this.lockRows(tx, [out.inventoryId, destinationId]);
      // Claim the answer: of two clicks, or an accept racing a reject, only
      // one moves the transfer off PENDING.
      const claimed = await tx.inventoryAdjustment.updateMany({
        where: { id, transferStatus: 'PENDING', deletedAt: null },
        data: {
          transferStatus: 'ACCEPTED',
          respondedById: user?.id ?? null,
          respondedAt: new Date(),
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException('This transfer was already answered or cancelled.');
      }
      // The value as it stands now: the sender may have corrected it.
      const current = await tx.inventoryAdjustment.findUniqueOrThrow({ where: { id } });
      const pullIn = await tx.inventoryAdjustment.create({
        data: {
          inventoryId: destinationId,
          type: 'PULL_IN',
          value: current.value,
          notes: current.notes,
          linkedAdjustmentId: id,
          transferStatus: 'ACCEPTED',
          createdById: user?.id ?? null,
        },
      });
      const pullOut = await tx.inventoryAdjustment.update({
        where: { id },
        data: { linkedAdjustmentId: pullIn.id },
      });
      const { transferTo: _transferTo, ...answered } = out;
      await recordChanges(
        tx,
        [
          { entity: 'InventoryAdjustment', entityId: id, before: answered, after: pullOut },
          { entity: 'InventoryAdjustment', entityId: pullIn.id, before: null, after: pullIn },
        ],
        user?.id,
      );
      await this.carryForward(tx, [destinationId], user?.id);
      return { pullOut, pullIn, status: 'ACCEPTED' as const };
    }, WRITE_TX_OPTIONS);
  }

  /**
   * The receiving branch says the stock did not arrive: the sender's
   * PULL_OUT is reversed (soft-deleted, so the record remains), and the
   * transfer reads REJECTED.
   */
  async rejectTransfer(id: number, user?: RequestUser) {
    const out = await this.pendingTransfer(id, user);

    return this.prisma.$transaction(async (tx) => {
      await this.lockRows(tx, [out.inventoryId]);
      const claimed = await tx.inventoryAdjustment.updateMany({
        where: { id, transferStatus: 'PENDING', deletedAt: null },
        data: {
          transferStatus: 'REJECTED',
          respondedById: user?.id ?? null,
          respondedAt: new Date(),
          deletedAt: new Date(),
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException('This transfer was already answered or cancelled.');
      }
      const after = await tx.inventoryAdjustment.findUniqueOrThrow({ where: { id } });
      const { transferTo: _transferTo, ...answered } = out;
      await recordChanges(
        tx,
        [{ entity: 'InventoryAdjustment', entityId: id, before: answered, after, action: 'delete' }],
        user?.id,
      );
      await this.carryForward(tx, [out.inventoryId], user?.id);
      return { status: 'REJECTED' as const };
    }, WRITE_TX_OPTIONS);
  }

  /**
   * Transfers awaiting an answer, for the sheets and dashboard to flag.
   *
   * A branch-scoped caller sees what is coming in to their branch (which they
   * can accept or reject) and what they sent that is still unanswered.
   */
  async listPending(user?: RequestUser, branchId?: number) {
    const scope = resolveBranchScope(user, branchId);
    const rows = await this.prisma.inventoryAdjustment.findMany({
      where: {
        transferStatus: 'PENDING',
        deletedAt: null,
        ...(scope != null
          ? {
              OR: [
                { inventory: { branchId: scope } },
                { transferTo: { branchId: scope } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'asc' },
      include: {
        inventory: {
          select: {
            id: true,
            date: true,
            branch: { select: { id: true, name: true } },
            product: { select: { id: true, name: true } },
          },
        },
        transferTo: {
          select: { id: true, branch: { select: { id: true, name: true } } },
        },
      },
    });

    return rows.map((r) => {
      const toBranchId = r.transferTo?.branch.id ?? null;
      return {
        id: r.id,
        value: r.value,
        notes: r.notes,
        createdAt: r.createdAt,
        date: r.inventory.date,
        product: r.inventory.product,
        fromBranch: r.inventory.branch,
        toBranch: r.transferTo?.branch ?? null,
        direction:
          scope == null ? null : toBranchId === scope ? 'incoming' : 'outgoing',
        // Only the receiving branch answers, or someone who sees every branch.
        canRespond:
          toBranchId != null &&
          (hasAllBranches(user) || user?.branchId === toBranchId),
      };
    });
  }
}

