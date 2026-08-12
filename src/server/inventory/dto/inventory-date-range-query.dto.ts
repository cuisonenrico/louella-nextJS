import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class InventoryDateRangeQueryDto {
  @ApiPropertyOptional({
    example: '2026-03-01',
    description: 'Exact date or range start (YYYY-MM-DD)',
  })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({
    example: '2026-03-21',
    description: 'Range end (YYYY-MM-DD). If omitted, defaults to startDate.',
  })
  @IsDateString()
  @IsOptional()
  endDate?: string;
}
