import { IsEnum, IsNumber, IsPositive } from 'class-validator';
import { MeasurementUnit } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

export class CreateUnitConversionDto {
  @ApiProperty({ enum: MeasurementUnit, example: 'KG' })
  @IsEnum(MeasurementUnit)
  fromUnit: MeasurementUnit;

  @ApiProperty({ enum: MeasurementUnit, example: 'G' })
  @IsEnum(MeasurementUnit)
  toUnit: MeasurementUnit;

  /**
   * Multiply a quantity in `fromUnit` by this factor to get the equivalent
   * quantity in `toUnit`.
   * Example: fromUnit=KG, toUnit=G → factor=1000
   * The inverse (G→KG, factor=0.001) is created automatically.
   */
  @ApiProperty({
    example: 1000,
    description: 'Conversion factor (fromUnit → toUnit)',
  })
  @IsNumber()
  @IsPositive()
  factor: number;
}
