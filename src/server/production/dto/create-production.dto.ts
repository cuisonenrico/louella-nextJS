import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProductionDto {
  @ApiProperty({ example: 1, description: 'Branch ID' })
  @IsInt()
  @Min(1)
  branchId: number;

  @ApiProperty({ example: 1, description: 'Product ID' })
  @IsInt()
  @Min(1)
  productId: number;

  @ApiProperty({
    example: '2026-03-22',
    description: 'Date in YYYY-MM-DD format',
  })
  @IsDateString()
  @IsNotEmpty()
  date: string;

  @ApiProperty({ example: 120, description: 'Actual pieces produced that day' })
  @IsInt()
  @Min(0)
  yield: number;

  @ApiPropertyOptional({
    example: 'Extra batch for weekend',
    description: 'Notes',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
