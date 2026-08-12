import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMaterialAdjustmentDto } from './dto/create-material-adjustment.dto';

@Injectable()
export class MaterialAdjustmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(body: CreateMaterialAdjustmentDto) {
    const inv = await this.prisma.materialInventory.findUnique({
      where: { id: body.materialInventoryId },
    });
    if (!inv)
      throw new NotFoundException('Material inventory record not found');

    return this.prisma.materialAdjustment.create({
      data: {
        materialInventoryId: body.materialInventoryId,
        type: body.type,
        value: body.value,
        notes: body.notes,
      },
    });
  }

  async listByMaterialInventory(materialInventoryId: number) {
    return this.prisma.materialAdjustment.findMany({
      where: { materialInventoryId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async remove(id: number) {
    const existing = await this.prisma.materialAdjustment.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Adjustment not found');
    return this.prisma.materialAdjustment.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
