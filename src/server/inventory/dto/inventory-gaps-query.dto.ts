import { IsDateString, IsNumberString, IsOptional } from 'class-validator';

export class InventoryGapsQueryDto {
  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsNumberString()
  @IsOptional()
  branchId?: string;
}
