import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { DashboardService } from './dashboard.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { BranchGuard } from '../common/guards/branch.guard';
import { RequireFeature } from '../common/decorators/require-feature.decorator';
import { CurrentUser } from '../common/decorators/user.decorator';

@Controller('dashboard')
@RequireFeature('dashboard')
@Roles(UserRole.VIEWER)
@UseGuards(RolesGuard, BranchGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  getSummary(
    @CurrentUser() user: { permissions: string[] },
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
    // Panels are resolved inside the service so a denied panel's data is never
    // assembled, rather than assembled and then filtered on the way out.
    return this.dashboardService.getSummary(
      date,
      Number.isFinite(branchId as number) ? branchId : undefined,
      user.permissions,
    );
  }
}
