import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  MAX_NOTES_LENGTH,
  MAX_UNITS,
} from '../../common/constants/inventory.constants';

/**
 * One row of a sheet save. Addressed by `id` — the row already exists, so
 * unlike CreateInventoryDto this carries no branch/product/date and cannot
 * re-key a row onto a different day.
 */
export class UpdateInventoryItemDto {
  @ApiProperty({ example: 12, description: 'Inventory row ID' })
  @IsInt()
  @Min(1)
  id: number;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_UNITS)
  quantity?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_UNITS)
  delivery?: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_UNITS)
  leftover?: number;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_UNITS)
  reject?: number;

  @ApiPropertyOptional({ example: 'Short delivery today' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_NOTES_LENGTH)
  notes?: string;
}
