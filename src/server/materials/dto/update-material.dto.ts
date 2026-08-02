import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { MeasurementUnit } from '@prisma/client';

export class UpdateMaterialDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(MeasurementUnit)
  unit?: MeasurementUnit;

  @IsOptional()
  @IsNumber()
  @Min(0)
  pricePerUnit?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  reorderLevel?: number;

  /** Backdate the price history entry. Defaults to now when omitted. */
  @IsOptional()
  @IsDateString()
  priceEffectiveAt?: string;
}
