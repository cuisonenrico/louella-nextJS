import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

/**
 * One row of a material sheet save. Addressed by `id`, so unlike
 * CreateMaterialInventoryDto it cannot move a card to a different material or
 * day.
 */
export class UpdateMaterialInventoryItemDto {
  @ApiProperty({ example: 12, description: 'Material stock card ID' })
  @IsInt()
  @Min(1)
  id: number;

  @ApiPropertyOptional({ example: 50.0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  quantity?: number;

  @ApiPropertyOptional({ example: 25.0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  delivery?: number;

  @ApiPropertyOptional({ example: 12.5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  used?: number;

  @ApiPropertyOptional({ example: 'Reserved for first batch' })
  @IsOptional()
  @IsString()
  notes?: string;
}
