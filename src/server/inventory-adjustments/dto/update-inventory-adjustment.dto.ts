import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { AdjustmentType } from '@prisma/client';

export class UpdateInventoryAdjustmentDto {
  @ApiPropertyOptional({ enum: AdjustmentType })
  @IsOptional()
  @IsEnum(AdjustmentType)
  type?: AdjustmentType;

  @ApiPropertyOptional({
    example: 5,
    description: 'Adjusted value (positive or negative integer)',
  })
  @IsOptional()
  @IsInt()
  value?: number;

  @ApiPropertyOptional({ example: 'Revised count' })
  @IsOptional()
  @IsString()
  notes?: string;
}
