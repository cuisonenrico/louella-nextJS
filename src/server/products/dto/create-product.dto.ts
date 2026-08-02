import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProductDto {
  @ApiProperty({ example: 'Pan de Sal', description: 'Product name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    enum: ['BREAD', 'CAKE', 'SPECIAL', 'MISCELLANEOUS'],
    example: 'BREAD',
  })
  @IsOptional()
  @IsIn(['BREAD', 'CAKE', 'SPECIAL', 'MISCELLANEOUS'])
  type?: 'BREAD' | 'CAKE' | 'SPECIAL' | 'MISCELLANEOUS';

  @ApiPropertyOptional({ example: 5.5, description: 'Selling price per unit' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({
    example: '2026-01-01',
    description: 'Product launch date',
  })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Whether the product is active',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    example: 10,
    description: 'Display order within the product type (lower comes first)',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  sortOrder?: number;
}
