import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ALL_BRANCHES_KEY } from '@/lib/rbac/features';
import { PrismaService } from '../prisma/prisma.service';
import { computeAdjSum } from '../common/utils/inventory-metrics.util';
import { CreateInventoryAdjustmentDto } from './dto/create-inventory-adjustment.dto';
import { UpdateInventoryAdjustmentDto } from './dto/update-inventory-adjustment.dto';
import { CreateTransferDto } from './dto/create-transfer.dto';

/** The authenticated caller, as JwtStrategy puts it on the request. */
export interface RequestUser {
  id?: number;
  branchId?: number | null;
  permissions?: string[];
}

@Injectable()
export class InventoryAdjustmentsService {
  constructor(private readonly prisma: PrismaService) {}

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
   * Scope is driven by the `all-branches` permission, matching BranchGuard.
   */
  private assertBranchAccess(
    user: RequestUser | undefined,
    branchId: number,
  ): void {
    // No user means a @Public route: JwtAuthGuard runs globally and ahead of
    // this, so there is nothing to scope.
    if (!user) return;
    if (user.permissions?.includes(ALL_BRANCHES_KEY)) return;

    if (user.branchId == null) {
      throw new ForbiddenException(
        'This account is limited to a single branch but has no branch assigned. Ask an administrator to assign one.',
      );
    }
    if (user.branchId !== branchId) {
      throw new ForbiddenException('Access to this branch is not permitted');
    }
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
    inventoryId: number,
    value: number,
  ): Promise<void> {
    const row = await this.prisma.inventory.findFirst({
      where: { id: inventoryId, deletedAt: null },
      select: {
        quantity: true,
        delivery: true,
        adjustments: {
          where: { deletedAt: null },
          select: { type: true, value: true },
        },
      },
    });
    if (!row) throw new NotFoundException('Inventory record not found');

    const available =
      row.quantity + row.delivery + computeAdjSum(row.adjustments);
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

    if (dto.type === 'PULL_OUT') {
      await this.assertStockAvailable(dto.inventoryId, dto.value);
    }

    return this.prisma.inventoryAdjustment.create({
      data: { ...dto, createdById: user?.id ?? null },
    });
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
        const [updated] = await this.prisma.$transaction([
          this.prisma.inventoryAdjustment.update({ where: { id }, data: dto }),
          this.prisma.inventoryAdjustment.updateMany({
            where: { id: existing.linkedAdjustmentId, deletedAt: null },
            data: { value: dto.value },
          }),
        ]);
        return updated;
      }
    }

    return this.prisma.inventoryAdjustment.update({ where: { id }, data: dto });
  }

  async remove(id: number, user?: RequestUser) {
    const existing = await this.branchOfAdjustment(id);
    this.assertBranchAccess(user, existing.inventory.branchId);

    const deletedAt = new Date();

    // Both legs of a transfer go together. Soft-deleting only the row the user
    // clicked would leave its counterpart live, inventing stock at one branch
    // that never left the other.
    if (existing.linkedAdjustmentId) {
      const [updated] = await this.prisma.$transaction([
        this.prisma.inventoryAdjustment.update({
          where: { id },
          data: { deletedAt },
        }),
        this.prisma.inventoryAdjustment.updateMany({
          where: { id: existing.linkedAdjustmentId, deletedAt: null },
          data: { deletedAt },
        }),
      ]);
      return updated;
    }

    return this.prisma.inventoryAdjustment.update({
      where: { id },
      data: { deletedAt },
    });
  }

  /**
   * Atomically transfers stock between two inventory records (same product required).
   * Creates a PULL_OUT on the source and a matching PULL_IN on the destination,
   * linked via linkedAdjustmentId so the relationship is visible in both directions.
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

    // Scoped on the source only. A transfer is by definition cross-branch, so
    // requiring both ends would deny it outright to a branch manager — who
    // holds `inventory-adjustments:transfer` by default and is meant to push
    // their own stock out. Owning the source is the real boundary: it stops a
    // scoped user pulling stock *from* a branch that is not theirs.
    this.assertBranchAccess(user, from.branchId);

    await this.assertStockAvailable(dto.fromInventoryId, dto.value);

    // Create both adjustments and link them in one interactive transaction.
    const { pullOut, pullIn } = await this.prisma.$transaction(async (tx) => {
      const out = await tx.inventoryAdjustment.create({
        data: {
          inventoryId: dto.fromInventoryId,
          type: 'PULL_OUT',
          value: dto.value,
          notes: dto.notes ?? null,
          createdById: user?.id ?? null,
        },
      });
      const inn = await tx.inventoryAdjustment.create({
        data: {
          inventoryId: dto.toInventoryId,
          type: 'PULL_IN',
          value: dto.value,
          notes: dto.notes ?? null,
          linkedAdjustmentId: out.id,
          createdById: user?.id ?? null,
        },
      });
      const linked = await tx.inventoryAdjustment.update({
        where: { id: out.id },
        data: { linkedAdjustmentId: inn.id },
      });
      return { pullOut: linked, pullIn: inn };
    });

    return { pullOut, pullIn };
  }
}
