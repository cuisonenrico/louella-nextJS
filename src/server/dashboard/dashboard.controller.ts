import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { DashboardService } from './dashboard.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { BranchGuard } from '../common/guards/branch.guard';

@Controller('dashboard')
@Roles(UserRole.VIEWER)
@UseGuards(RolesGuard, BranchGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  getSummary(
    @Query() query: DashboardQueryDto,
    @Query('branchId') branchIdStr?: string,
  ) {
    const date = query.date ?? new Date().toISOString().slice(0, 10);
    // BranchGuard injects the manager's own branchId; admins/head-office may
    // pass one explicitly. Production figures are scoped to it when present.
    const branchId =
      branchIdStr != null && branchIdStr !== ''
        ? parseInt(branchIdStr, 10)
        : undefined;
    return this.dashboardService.getSummary(
      date,
      Number.isFinite(branchId as number) ? branchId : undefined,
    );
  }
}
