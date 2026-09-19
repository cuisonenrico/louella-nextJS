import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { computeAdjSum } from '../common/utils/inventory-metrics.util';
import {
  lockMaterialChains,
  reconcileMaterialChains,
} from '../common/utils/stock-chain';
import { CreateMaterialAdjustmentDto } from './dto/create-material-adjustment.dto';

@Injectable()
export class MaterialAdjustmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(body: CreateMaterialAdjustmentDto, userId?: number) {
    const target = await this.prisma.materialInventory.findFirst({
      where: { id: body.materialInventoryId, deletedAt: null },
      select: { materialId: true },
    });
    if (!target)
      throw new NotFoundException('Material inventory record not found');

    return this.prisma.$transaction(async (tx) => {
      // Read what the card holds under the material chain's lock, so two
      // pull-outs cannot both be approved against the same stock.
      await lockMaterialChains(tx, [target.materialId]);
      const inv = await tx.materialInventory.findFirst({
        where: { id: body.materialInventoryId, deletedAt: null },
        include: { adjustments: { where: { deletedAt: null } } },
      });
      if (!inv)
        throw new NotFoundException('Material inventory record not found');

      // Same rule as InventoryAdjustmentsService: a pull-out cannot exceed
      // what the card holds, an ANOMALY is never capped. Material stock needs
      // this more than finished goods do — there is no counted leftover to
      // correct a bad balance, so a negative card is carried forward.
      if (body.type === 'PULL_OUT') {
        const available =
          inv.quantity + inv.delivery - inv.used + computeAdjSum(inv.adjustments);
        if (body.value > available) {
          throw new BadRequestException(
            `Cannot pull out ${body.value} — only ${available} is on hand for this material and day.`,
          );
        }
      }

      const created = await tx.materialAdjustment.create({
        data: {
          materialInventoryId: body.materialInventoryId,
          type: body.type,
          value: body.value,
          notes: body.notes,
          createdById: userId ?? null,
        },
      });
      // Spoilage or a restock moves this card's close; the next days follow.
      await reconcileMaterialChains(tx, [
        { materialId: inv.materialId, fromDate: inv.date },
      ]);
      return created;
    });
  }

  async listByMaterialInventory(materialInventoryId: number) {
    return this.prisma.materialAdjustment.findMany({
      // The card's own deletedAt has to be checked too: this query addresses
      // adjustments directly, so without it a deleted card's history stayed
      // readable by id even though the card itself is hidden everywhere.
      where: {
        materialInventoryId,
        deletedAt: null,
        materialInventory: { deletedAt: null },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async remove(id: number) {
    const existing = await this.prisma.materialAdjustment.findFirst({
      where: { id, deletedAt: null },
      include: { materialInventory: { select: { materialId: true, date: true } } },
    });
    if (!existing) throw new NotFoundException('Adjustment not found');
    return this.prisma.$transaction(async (tx) => {
      await lockMaterialChains(tx, [existing.materialInventory.materialId]);
      const removed = await tx.materialAdjustment.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
      await reconcileMaterialChains(tx, [
        {
          materialId: existing.materialInventory.materialId,
          fromDate: existing.materialInventory.date,
        },
      ]);
      return removed;
    });
  }
}
