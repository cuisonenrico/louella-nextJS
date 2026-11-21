import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { manilaToday } from '@/lib/manilaDate';
import { DashboardService } from './dashboard.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { BranchGuard } from '../common/guards/branch.guard';
import { RequireFeature } from '../common/decorators/require-feature.decorator';
import { CurrentUser } from '../common/decorators/user.decorator';

@Controller('dashboard')
@RequireFeature('dashboard')
@Roles(UserRole.VIEWER)
// RolesGuard is not listed here: it is registered globally as an APP_GUARD in
// app.module. Re-declaring it made the guard list read as though everything on
// it were controller-local, which is very likely how inventory-import ended up
// without the BranchGuard it needed — BranchGuard *is* controller-local, and it
// is the only thing this list has to say.
@UseGuards(BranchGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  getSummary(
    @CurrentUser() user: { permissions: string[] },
    @Query() query: DashboardQueryDto,
    @Query('branchId') branchIdStr?: string,
  ) {
    // Manila's day: Vercel runs in UTC, which is yesterday until 08:00 Manila.
    const date = query.date ?? manilaToday();
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
