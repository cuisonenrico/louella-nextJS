import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ProductionOrderItemDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsInt()
  productId: number;

  @ApiProperty({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  yield?: number;
}

export class CreateProductionOrderDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  branchId: number;

  @ApiProperty({ example: '2026-04-20' })
  @IsDateString()
  date: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: [ProductionOrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductionOrderItemDto)
  items: ProductionOrderItemDto[];
}
