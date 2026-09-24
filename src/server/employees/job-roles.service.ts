import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateJobRoleDto } from './dto/job-role.dto';

const JOB_ROLE_SELECT = { id: true, name: true, isActive: true } as const;

@Injectable()
export class JobRolesService {
  constructor(private readonly prisma: PrismaService) {}

  list(includeInactive: boolean) {
    return this.prisma.jobRole.findMany({
      where: includeInactive ? {} : { isActive: true },
      select: JOB_ROLE_SELECT,
      orderBy: { name: 'asc' },
    });
  }

  create(name: string) {
    return this.prisma.jobRole.create({ data: { name: name.trim() }, select: JOB_ROLE_SELECT });
  }

  async update(id: number, dto: UpdateJobRoleDto) {
    const existing = await this.prisma.jobRole.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Job role not found');
    return this.prisma.jobRole.update({
      where: { id },
      data: { name: dto.name?.trim(), isActive: dto.isActive },
      select: JOB_ROLE_SELECT,
    });
  }
}
