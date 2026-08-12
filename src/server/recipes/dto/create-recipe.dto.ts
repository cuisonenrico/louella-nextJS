import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateRecipeItemDto } from './create-recipe-item.dto';

export class CreateRecipeDto {
  @ApiProperty({ example: 1, description: 'Product ID this recipe belongs to' })
  @IsInt()
  @Min(1)
  productId: number;

  @ApiPropertyOptional({
    example: 12,
    description: 'Number of product units produced per batch',
  })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  recipeYield?: number;

  @ApiPropertyOptional({ example: 'Standard overnight bake' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({
    type: [CreateRecipeItemDto],
    description: 'Ingredients for this recipe',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateRecipeItemDto)
  items: CreateRecipeItemDto[];
}
