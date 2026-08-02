import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';

@Injectable()
export class BranchesService {
  constructor(private readonly prisma: PrismaService) {}

  create(body: CreateBranchDto) {
    return this.prisma.branch.create({
      data: {
        name: body.name,
        address: body.address,
        phone: body.phone,
        isActive: body.isActive,
      },
    });
  }

  findAll() {
    return this.prisma.branch.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: { manager: { select: { id: true, email: true } } },
    });
  }

  search(q: string) {
    return this.prisma.branch.findMany({
      where: {
        deletedAt: null,
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { address: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q, mode: 'insensitive' } },
        ],
      },
      orderBy: { name: 'asc' },
      include: { manager: { select: { id: true, email: true } } },
    });
  }

  async findOne(id: number) {
    const branch = await this.prisma.branch.findFirst({
      where: { id, deletedAt: null },
      include: { manager: { select: { id: true, email: true } } },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }
    return branch;
  }

  async update(id: number, body: UpdateBranchDto) {
    try {
      return await this.prisma.branch.update({
        where: { id },
        data: {
          name: body.name,
          address: body.address,
          phone: body.phone,
          isActive: body.isActive,
        },
      });
    } catch {
      throw new NotFoundException('Branch not found');
    }
  }

  async remove(id: number) {
    const branch = await this.prisma.branch.findFirst({
      where: { id, deletedAt: null },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }
    return this.prisma.branch.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
