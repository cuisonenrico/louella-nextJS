import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { MeasurementUnit } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMaterialDto {
  @ApiProperty({ example: 'Flour', description: 'Material name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    enum: MeasurementUnit,
    example: 'KG',
    description: 'Base measurement unit',
  })
  @IsEnum(MeasurementUnit)
  unit: MeasurementUnit;

  @ApiPropertyOptional({ example: 45.0, description: 'Price per base unit' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  pricePerUnit?: number;

  @ApiPropertyOptional({
    example: 10.0,
    description: 'Reorder alert threshold',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  reorderLevel?: number;
}
