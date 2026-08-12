import { IsEnum, IsNumber, IsPositive } from 'class-validator';
import { MeasurementUnit } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

export class ConvertQuantityDto {
  @ApiProperty({ example: 2.5, description: 'Quantity to convert' })
  @IsNumber()
  @IsPositive()
  quantity: number;

  @ApiProperty({ enum: MeasurementUnit, example: 'KG' })
  @IsEnum(MeasurementUnit)
  fromUnit: MeasurementUnit;

  @ApiProperty({ enum: MeasurementUnit, example: 'G' })
  @IsEnum(MeasurementUnit)
  toUnit: MeasurementUnit;
}
