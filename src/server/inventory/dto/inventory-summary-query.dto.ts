import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNumberString, IsOptional } from 'class-validator';

export class InventorySummaryQueryDto {
  @ApiPropertyOptional({
    example: '2026-03-01',
    description: 'Start date (YYYY-MM-DD)',
  })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({
    example: '2026-03-21',
    description: 'End date (YYYY-MM-DD). Defaults to startDate.',
  })
  @IsDateString()
  @IsOptional()
  endDate?: string;

  @ApiPropertyOptional({
    example: '1',
    description: 'Branch ID filter. Omit for all branches.',
  })
  @IsNumberString()
  @IsOptional()
  branchId?: string;
}
