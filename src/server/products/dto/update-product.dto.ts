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

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsIn(['BREAD', 'CAKE', 'SPECIAL', 'MISCELLANEOUS'])
  type?: 'BREAD' | 'CAKE' | 'SPECIAL' | 'MISCELLANEOUS';

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sortOrder?: number;

  /** Backdate the price history entry. Defaults to now when omitted. */
  @IsOptional()
  @IsDateString()
  priceEffectiveAt?: string;
}
