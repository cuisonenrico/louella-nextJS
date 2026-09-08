import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class MaterialInitRangeQueryDto {
  @ApiProperty({
    example: '2026-03-01',
    description: 'First date to initialise (YYYY-MM-DD)',
  })
  @IsDateString()
  startDate: string;

  @ApiPropertyOptional({
    example: '2026-03-21',
    description: 'Last date to initialise. Defaults to startDate.',
  })
  @IsDateString()
  @IsOptional()
  endDate?: string;
}
