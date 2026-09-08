import {
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  MAX_NOTES_LENGTH,
  MAX_UNITS,
} from '../../common/constants/inventory.constants';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AdjustmentType } from '@prisma/client';

export class CreateInventoryAdjustmentDto {
  @ApiProperty({ example: 1, description: 'Inventory record ID' })
  @IsInt()
  @Min(1)
  inventoryId: number;

  @ApiProperty({ enum: AdjustmentType, description: 'Type of adjustment' })
  @IsEnum(AdjustmentType)
  type: AdjustmentType;

  @ApiProperty({
    example: 5,
    description:
      'Magnitude of the adjustment, always a positive integer. Direction comes from `type` (PULL_IN adds, PULL_OUT/ANOMALY subtract) and is applied by the sold formula, never stored in the sign.',
  })
  @IsInt()
  @IsPositive()
  @Max(MAX_UNITS)
  value: number;

  @ApiPropertyOptional({
    example: 'Extra batch from morning run',
    description: 'Reason for adjustment',
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_NOTES_LENGTH)
  notes?: string;
}
