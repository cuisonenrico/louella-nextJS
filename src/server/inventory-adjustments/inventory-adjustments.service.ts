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
  ): Promise<void> {
    const rows = await tx.inventory.findMany({
      where: { id: { in: inventoryIds } },
      select: { branchId: true, productId: true, date: true },
    });
    await reconcileInventoryChains(
      tx,
      rows.map((r) => ({ branchId: r.branchId, productId: r.productId, fromDate: r.date })),
    );
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

    const available = row.quantity + row.delivery + computeAdjSum(others);
    if (value > available) {
      throw new BadRequestException(
        `Cannot pull out ${value} units — only ${available} are on hand for this product and day.`,
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
      await this.carryForward(tx, [dto.inventoryId]);
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

    // A transfer is one movement recorded as two opposite, equal legs. Letting
    // one leg drift breaks that invariant: a re-typed leg would have both
    // branches pulling the same direction, and a re-valued leg would move more
    // units out of the source than arrive at the destination. So the type is
    // frozen and the value is mirrored onto the counterpart.
    if (existing.linkedAdjustmentId) {
      if (dto.type !== undefined && dto.type !== existing.type) {
        throw new BadRequestException(
          'Cannot change the type of a transfer adjustment. Delete the transfer and create a new one.',
        );
      }
      if (dto.value !== undefined && dto.value !== existing.value) {
        const linkedId = existing.linkedAdjustmentId;
        const newValue = dto.value;
        return this.prisma.$transaction(async (tx) => {
          const counterpart = await tx.inventoryAdjustment.findFirst({
            where: { id: linkedId, deletedAt: null },
            select: { inventoryId: true },
          });
          await this.lockRows(tx, [
            existing.inventoryId,
            ...(counterpart ? [counterpart.inventoryId] : []),
          ]);
          // The new value lands on both legs, so the *source* branch is what
          // has to be able to cover it, whichever leg is being edited.
          await this.assertTransferStock(tx, existing, newValue);

          const updated = await tx.inventoryAdjustment.update({
            where: { id },
            data: { ...dto, updatedById: user?.id ?? null },
          });
          await recordChanges(
            tx,
            [{ entity: 'InventoryAdjustment', entityId: id, before: existing, after: updated }],
            user?.id,
          );
          await tx.inventoryAdjustment.updateMany({
            where: { id: linkedId, deletedAt: null },
            data: { value: dto.value },
          });
          await this.carryForward(tx, [
            existing.inventoryId,
            ...(counterpart ? [counterpart.inventoryId] : []),
          ]);
          return updated;
        }, WRITE_TX_OPTIONS);
      }
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
      await this.carryForward(tx, [existing.inventoryId]);
      return updated;
    }, WRITE_TX_OPTIONS);
  }

  /**
   * Cap the pull-out side of a transfer whose value is being revised.
   *
   * If the edited leg is itself the PULL_OUT, that is the row and the branch to
   * check. If it is the PULL_IN, the mirrored write moves the units out of the
   * counterpart's branch, so the counterpart is what must have the stock.
   */
  private async assertTransferStock(
    tx: Prisma.TransactionClient,
    existing: {
      id: number;
      type: string;
      inventoryId: number;
      linkedAdjustmentId: number | null;
    },
    value: number,
  ): Promise<void> {
    if (existing.type === 'PULL_OUT') {
      await this.assertStockAvailable(tx, existing.inventoryId, value, existing.id);
      return;
    }

    const counterpart = await tx.inventoryAdjustment.findFirst({
      where: { id: existing.linkedAdjustmentId ?? -1, deletedAt: null },
      select: { id: true, inventoryId: true, type: true },
    });
    if (counterpart?.type === 'PULL_OUT') {
      await this.assertStockAvailable(
        tx,
        counterpart.inventoryId,
        value,
        counterpart.id,
      );
    }
  }

  async remove(id: number, user?: RequestUser) {
    const existing = await this.branchOfAdjustment(id);
    this.assertBranchAccess(user, existing.inventory.branchId);

    const deletedAt = new Date();

    // Both legs of a transfer go together. Soft-deleting only the row the user
    // clicked would leave its counterpart live, inventing stock at one branch
    // that never left the other.
    return this.prisma.$transaction(async (tx) => {
      const counterpartRow = existing.linkedAdjustmentId
        ? await tx.inventoryAdjustment.findFirst({
            where: { id: existing.linkedAdjustmentId },
            select: { inventoryId: true },
          })
        : null;
      await this.lockRows(tx, [
        existing.inventoryId,
        ...(counterpartRow ? [counterpartRow.inventoryId] : []),
      ]);
      const updated = await tx.inventoryAdjustment.update({
        where: { id },
        data: { deletedAt },
      });
      const touched = [existing.inventoryId];
      if (existing.linkedAdjustmentId) {
        const counterpart = await tx.inventoryAdjustment.findFirst({
          where: { id: existing.linkedAdjustmentId, deletedAt: null },
          select: { inventoryId: true },
        });
        await tx.inventoryAdjustment.updateMany({
          where: { id: existing.linkedAdjustmentId, deletedAt: null },
          data: { deletedAt },
        });
        if (counterpart) touched.push(counterpart.inventoryId);
      }
      await this.carryForward(tx, touched);
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
    const [from, to] = await Promise.all([
      this.prisma.inventory.findFirst({
        where: { id: dto.fromInventoryId, deletedAt: null },
      }),
      this.prisma.inventory.findFirst({
        where: { id: dto.toInventoryId, deletedAt: null },
      }),
    ]);

    if (!from)
      throw new NotFoundException(
        `Source inventory record ${dto.fromInventoryId} not found`,
      );
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

    // Scoped on the source: a branch manager pushes their own stock out. The
    // destination is protected by acceptance, which is scoped to it.
    this.assertBranchAccess(user, from.branchId);

    const pullOut = await this.prisma.$transaction(async (tx) => {
      await this.lockRows(tx, [dto.fromInventoryId]);
      await this.assertStockAvailable(tx, dto.fromInventoryId, dto.value);
      const out = await tx.inventoryAdjustment.create({
        data: {
          inventoryId: dto.fromInventoryId,
          type: 'PULL_OUT',
          value: dto.value,
          notes: dto.notes ?? null,
          createdById: user?.id ?? null,
          transferStatus: 'PENDING',
          transferToInventoryId: dto.toInventoryId,
        },
      });
      await this.carryForward(tx, [dto.fromInventoryId]);
      return out;
    }, WRITE_TX_OPTIONS);

    return { pullOut, pullIn: null, status: 'PENDING' as const };
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
      await this.carryForward(tx, [destinationId]);
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
      await this.carryForward(tx, [out.inventoryId]);
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

