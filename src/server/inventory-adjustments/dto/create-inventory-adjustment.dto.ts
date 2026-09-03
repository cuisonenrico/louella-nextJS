import { IsEnum, IsInt, IsOptional, IsPositive, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AdjustmentType } from '@prisma/client';

export class CreateInventoryAdjustmentDto {
  @ApiProperty({ example: 1, description: 'Inventory record ID' })
  @IsInt()
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
  value: number;

  @ApiPropertyOptional({
    example: 'Extra batch from morning run',
    description: 'Reason for adjustment',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
