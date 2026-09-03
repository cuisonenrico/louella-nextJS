import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';
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
  @IsNumber()
  @IsPositive()
  value: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
