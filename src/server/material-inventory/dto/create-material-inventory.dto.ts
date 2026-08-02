import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMaterialInventoryDto {
  @ApiPropertyOptional({ example: 1, description: 'Material ID' })
  @IsInt()
  @Min(1)
  materialId: number;

  @ApiPropertyOptional({
    example: '2026-03-30',
    description: 'Date of this stock entry',
  })
  @IsDateString()
  date: string;

  @ApiPropertyOptional({ example: 1, description: 'Supplier ID' })
  @IsOptional()
  @IsInt()
  @Min(1)
  supplierId?: number;

  @ApiPropertyOptional({
    example: 'LOT-2026-001',
    description: 'Batch/lot number',
  })
  @IsOptional()
  @IsString()
  batchNumber?: string;

  @ApiPropertyOptional({
    example: '2026-06-01',
    description: 'Expiry date of this batch',
  })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional({ example: 50.0, description: 'Current stock on hand' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  quantity?: number;

  @ApiPropertyOptional({ example: 25.0, description: 'Cumulative deliveries' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  delivery?: number;

  @ApiPropertyOptional({ example: 'Reserved for first batch' })
  @IsOptional()
  @IsString()
  notes?: string;
}
