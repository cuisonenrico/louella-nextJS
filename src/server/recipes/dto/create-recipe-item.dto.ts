import { IsEnum, IsInt, IsNumber, Min } from 'class-validator';
import { MeasurementUnit } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

export class CreateRecipeItemDto {
  @ApiProperty({ example: 1, description: 'Material ID' })
  @IsInt()
  @Min(1)
  materialId: number;

  @ApiProperty({
    example: 2.5,
    description: 'Amount of material required per batch',
  })
  @IsNumber()
  @Min(0)
  quantity: number;

  @ApiProperty({ enum: MeasurementUnit, example: 'KG' })
  @IsEnum(MeasurementUnit)
  unit: MeasurementUnit;
}
