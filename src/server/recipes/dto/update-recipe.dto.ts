import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { CreateRecipeItemDto } from './create-recipe-item.dto';

export class UpdateRecipeDto {
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  recipeYield?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  /**
   * When provided, all existing recipe items are replaced with this list.
   * Omit this field to leave existing items unchanged.
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateRecipeItemDto)
  items?: CreateRecipeItemDto[];
}
