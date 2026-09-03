import { IsEnum, IsInt, IsOptional, IsPositive, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { AdjustmentType } from '@prisma/client';

export class UpdateInventoryAdjustmentDto {
  @ApiPropertyOptional({ enum: AdjustmentType })
  @IsOptional()
  @IsEnum(AdjustmentType)
  type?: AdjustmentType;

  @ApiPropertyOptional({
    example: 5,
    description:
      'Adjusted magnitude, always a positive integer — direction comes from `type`.',
  })
  @IsOptional()
  @IsInt()
  @IsPositive()
  value?: number;

  @ApiPropertyOptional({ example: 'Revised count' })
  @IsOptional()
  @IsString()
  notes?: string;
}
