import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNumber,
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
 * One row of a material sheet save. Addressed by `id`, so unlike
 * CreateMaterialInventoryDto it cannot move a card to a different material or
 * day.
 */
export class UpdateMaterialInventoryItemDto {
  @ApiProperty({ example: 12, description: 'Material stock card ID' })
  @IsInt()
  @Min(1)
  id: number;

  @ApiPropertyOptional({ example: 50.0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(MAX_UNITS)
  quantity?: number;

  @ApiPropertyOptional({ example: 25.0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(MAX_UNITS)
  delivery?: number;

  @ApiPropertyOptional({ example: 12.5 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(MAX_UNITS)
  used?: number;

  @ApiPropertyOptional({ example: 'Reserved for first batch' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_NOTES_LENGTH)
  notes?: string;
}
