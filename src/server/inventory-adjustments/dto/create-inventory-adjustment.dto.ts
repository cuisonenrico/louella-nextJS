import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
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
      'Adjustment value — positive adds stock (PULL_IN), negative removes stock (PULL_OUT/ANOMALY)',
  })
  @IsInt()
  value: number;

  @ApiPropertyOptional({
    example: 'Extra batch from morning run',
    description: 'Reason for adjustment',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
