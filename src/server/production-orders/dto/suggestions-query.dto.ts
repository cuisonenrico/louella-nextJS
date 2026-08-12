import {
  IsDateString,
  IsIn,
  IsNumberString,
  IsOptional,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SuggestionsQueryDto {
  @ApiProperty({ example: '2', description: 'Branch ID' })
  @IsNumberString()
  branchId: string;

  @ApiPropertyOptional({ enum: ['prev-day', '7d', '30d'], default: '7d' })
  @IsOptional()
  @IsIn(['prev-day', '7d', '30d'])
  period?: 'prev-day' | '7d' | '30d';

  @ApiPropertyOptional({
    example: '2026-06-13',
    description:
      'Reference date (window ends the day before). Defaults to today (Manila).',
  })
  @IsOptional()
  @IsDateString()
  date?: string;
}
