import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInventoryAdjustmentDto } from './dto/create-inventory-adjustment.dto';
import { UpdateInventoryAdjustmentDto } from './dto/update-inventory-adjustment.dto';
import { CreateTransferDto } from './dto/create-transfer.dto';

@Injectable()
export class InventoryAdjustmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateInventoryAdjustmentDto) {
    const exists = await this.prisma.inventory.findFirst({
      where: { id: dto.inventoryId, deletedAt: null },
    });
    if (!exists) {
      throw new NotFoundException('Inventory record not found');
    }
    return this.prisma.inventoryAdjustment.create({ data: dto });
  }

  findByInventory(inventoryId: number) {
    return this.prisma.inventoryAdjustment.findMany({
      where: { inventoryId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  }

  async update(id: number, dto: UpdateInventoryAdjustmentDto) {
    const existing = await this.prisma.inventoryAdjustment.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing)
      throw new NotFoundException('Inventory adjustment not found');
    return this.prisma.inventoryAdjustment.update({ where: { id }, data: dto });
  }

  async remove(id: number) {
    const existing = await this.prisma.inventoryAdjustment.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing)
      throw new NotFoundException('Inventory adjustment not found');
    return this.prisma.inventoryAdjustment.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Atomically transfers stock between two inventory records (same product required).
   * Creates a PULL_OUT on the source and a matching PULL_IN on the destination,
   * linked via linkedAdjustmentId so the relationship is visible in both directions.
   */
  async transfer(dto: CreateTransferDto) {
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

    // Create both adjustments and link them in one interactive transaction.
    const { pullOut, pullIn } = await this.prisma.$transaction(async (tx) => {
      const out = await tx.inventoryAdjustment.create({
        data: {
          inventoryId: dto.fromInventoryId,
          type: 'PULL_OUT',
          value: dto.value,
          notes: dto.notes ?? null,
        },
      });
      const inn = await tx.inventoryAdjustment.create({
        data: {
          inventoryId: dto.toInventoryId,
          type: 'PULL_IN',
          value: dto.value,
          notes: dto.notes ?? null,
          linkedAdjustmentId: out.id,
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
