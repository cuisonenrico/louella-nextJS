import {
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
} from 'class-validator';
import {
  MAX_NOTES_LENGTH,
  MAX_UNITS,
} from '../../common/constants/inventory.constants';
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
  @Max(MAX_UNITS)
  value?: number;

  @ApiPropertyOptional({ example: 'Revised count' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_NOTES_LENGTH)
  notes?: string;
}
