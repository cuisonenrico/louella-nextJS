import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { BCRYPT_COST_FACTOR } from '../common/constants/security.constants';

const USER_SAFE_SELECT = {
  id: true,
  email: true,
  role: true,
  isActive: true,
  mustChangePassword: true,
  branchId: true,
  createdAt: true,
  updatedAt: true,
  managedBranch: { select: { id: true, name: true } },
  createdBy: { select: { id: true, email: true } },
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: number) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findByIdSafe(id: number) {
    return this.prisma.user.findUnique({
      where: { id },
      select: USER_SAFE_SELECT,
    });
  }

  async createUser(email: string, passwordHash: string) {
    return this.prisma.user.create({ data: { email, passwordHash } });
  }

  async findAll(page: number, limit: number, search?: string) {
    const where: Prisma.UserWhereInput = search
      ? { email: { contains: search, mode: 'insensitive' } }
      : {};
    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: USER_SAFE_SELECT,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async createByAdmin(dto: CreateUserDto, createdById: number) {
    const existing = await this.findByEmail(dto.email);
    if (existing) throw new ConflictException('Email already in use');

    if (dto.branchId != null && dto.role !== UserRole.MANAGER) {
      throw new BadRequestException(
        'branchId can only be set for MANAGER role',
      );
    }
    if (dto.branchId != null) {
      await this.assertBranchUnassigned(dto.branchId);
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_COST_FACTOR);
    return this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        role: dto.role,
        branchId: dto.role === UserRole.MANAGER ? (dto.branchId ?? null) : null,
        mustChangePassword: dto.mustChangePassword ?? true,
        createdById,
      },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        mustChangePassword: true,
        branchId: true,
        createdAt: true,
      },
    });
  }

  async updateRole(id: number, role: UserRole) {
    await this.assertNotLastAdmin(id);
    const data: Prisma.UserUpdateInput = { role: { set: role } };
    if (role !== UserRole.MANAGER) {
      data.managedBranch = { disconnect: true };
    }
    return this.prisma.user.update({
      where: { id },
      data,
      select: { id: true, email: true, role: true, branchId: true },
    });
  }

  async updateBranch(id: number, branchId: number | null) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id } });
    if (user.role !== UserRole.MANAGER) {
      throw new BadRequestException(
        'Only MANAGER role users can be assigned a branch',
      );
    }
    if (branchId != null) {
      await this.assertBranchUnassigned(branchId, id);
    }
    return this.prisma.user.update({
      where: { id },
      data: { branchId },
      select: { id: true, email: true, branchId: true },
    });
  }

  async setActive(id: number, isActive: boolean, currentUserId: number) {
    if (id === currentUserId && !isActive) {
      throw new BadRequestException('Cannot deactivate your own account');
    }
    if (!isActive) {
      await this.assertNotLastAdmin(id);
      await this.prisma.refreshToken.updateMany({
        where: { userId: id, revoked: false },
        data: { revoked: true },
      });
    }
    return this.prisma.user.update({
      where: { id },
      data: { isActive },
      select: { id: true, email: true, isActive: true },
    });
  }

  async resetPassword(id: number, newPassword: string) {
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST_FACTOR);
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash, mustChangePassword: true },
    });
    await this.prisma.refreshToken.updateMany({
      where: { userId: id, revoked: false },
      data: { revoked: true },
    });
    return { success: true };
  }

  private async assertNotLastAdmin(excludingUserId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: excludingUserId },
    });
    if (user?.role !== UserRole.ADMIN) return;
    const remaining = await this.prisma.user.count({
      where: {
        role: UserRole.ADMIN,
        isActive: true,
        id: { not: excludingUserId },
      },
    });
    if (remaining === 0) {
      throw new BadRequestException('Cannot remove the last active admin');
    }
  }

  private async assertBranchUnassigned(
    branchId: number,
    excludingUserId?: number,
  ) {
    const existing = await this.prisma.user.findUnique({ where: { branchId } });
    if (existing && existing.id !== excludingUserId) {
      throw new ConflictException(
        `Branch ${branchId} already has a manager assigned`,
      );
    }
  }
}
