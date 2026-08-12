import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateInventoryDto {
  @ApiProperty({ example: 1, description: 'Branch ID' })
  @IsInt()
  @Min(1)
  branchId: number;

  @ApiProperty({ example: 1, description: 'Product ID' })
  @IsInt()
  @Min(1)
  productId: number;

  @ApiProperty({
    example: '2026-03-01',
    description: 'Date in YYYY-MM-DD format',
  })
  @IsDateString()
  @IsNotEmpty()
  date: string;

  @ApiProperty({ example: 100, description: 'Total pieces produced/available' })
  @IsInt()
  @Min(0)
  quantity: number;

  @ApiPropertyOptional({
    example: 20,
    description: 'Pieces delivered to this branch',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  delivery?: number;

  @ApiPropertyOptional({
    example: 5,
    description: 'Unsold pieces at end of day',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  leftover?: number;

  @ApiPropertyOptional({ example: 2, description: 'Damaged/rejected pieces' })
  @IsOptional()
  @IsInt()
  @Min(0)
  reject?: number;

  @ApiPropertyOptional({
    example: 'Short delivery today',
    description: 'Notes',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
