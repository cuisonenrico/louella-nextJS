import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { AdjustmentType } from '@prisma/client';

export class CreateMaterialAdjustmentDto {
  @IsNumber()
  @Min(1)
  materialInventoryId: number;

  @IsEnum(AdjustmentType)
  type: AdjustmentType;

  /** Always positive — direction is conveyed by type. */
  @IsNumber()
  @Min(0)
  value: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
