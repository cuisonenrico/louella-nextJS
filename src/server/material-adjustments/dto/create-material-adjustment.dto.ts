import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  MAX_NOTES_LENGTH,
  MAX_UNITS,
} from '../../common/constants/inventory.constants';
import { AdjustmentType } from '@prisma/client';

export class CreateMaterialAdjustmentDto {
  @IsNumber()
  @Min(1)
  materialInventoryId: number;

  @IsEnum(AdjustmentType)
  type: AdjustmentType;

  /**
   * Always positive — direction is conveyed by type. Zero is rejected too: a
   * zero-magnitude adjustment records nothing and only adds noise to the card.
   */
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  @Max(MAX_UNITS)
  value: number;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_NOTES_LENGTH)
  notes?: string;
}
