import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty } from 'class-validator';

export class SalesRangeQueryDto {
  @ApiProperty({
    example: '2026-01-01',
    description: 'Start date in YYYY-MM-DD format',
  })
  @IsDateString()
  @IsNotEmpty()
  startDate: string;

  @ApiProperty({
    example: '2026-03-01',
    description: 'End date in YYYY-MM-DD format',
  })
  @IsDateString()
  @IsNotEmpty()
  endDate: string;
}
