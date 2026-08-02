import { IsDateString, IsNumberString, IsOptional } from 'class-validator';

export class DashboardQueryDto {
  @IsOptional()
  @IsDateString()
  date?: string;

  // Accepted so the global forbidNonWhitelisted pipe does not reject the
  // BranchGuard-injected (or admin-supplied) branch scope. Parsed in the controller.
  @IsOptional()
  @IsNumberString()
  branchId?: string;
}
