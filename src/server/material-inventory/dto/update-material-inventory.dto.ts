import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class UpdateMaterialInventoryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  materialId?: number;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  supplierId?: number;

  @IsOptional()
  @IsString()
  batchNumber?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  quantity?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  delivery?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  used?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
