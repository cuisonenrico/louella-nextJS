import { IsNumber, IsOptional, IsPositive } from 'class-validator';

export class UpdateUnitConversionDto {
  /**
   * Update the conversion factor. The inverse record's factor is updated
   * automatically (1 / newFactor).
   */
  @IsOptional()
  @IsNumber()
  @IsPositive()
  factor?: number;
}
