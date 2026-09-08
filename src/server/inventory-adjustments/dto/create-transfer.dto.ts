import {
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

export class CreateTransferDto {
  @ApiProperty({
    example: 1,
    description: 'Source inventory record ID (branch being pulled from)',
  })
  @IsInt()
  @Min(1)
  fromInventoryId: number;

  @ApiProperty({
    example: 2,
    description: 'Destination inventory record ID (branch receiving stock)',
  })
  @IsInt()
  @Min(1)
  toInventoryId: number;

  @ApiProperty({
    example: 50,
    description: 'Number of units to transfer (positive integer)',
  })
  @IsInt()
  @IsPositive()
  @Max(MAX_UNITS)
  value: number;

  @ApiPropertyOptional({
    example: 'Midday pull-out to cover Cubao branch shortage',
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_NOTES_LENGTH)
  notes?: string;
}
