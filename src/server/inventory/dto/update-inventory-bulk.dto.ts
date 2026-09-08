import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

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
  quantity?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @IsInt()
  @Min(0)
  delivery?: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsInt()
  @Min(0)
  leftover?: number;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  @Min(0)
  reject?: number;

  @ApiPropertyOptional({ example: 'Short delivery today' })
  @IsOptional()
  @IsString()
  notes?: string;
}
