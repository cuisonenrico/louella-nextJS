import {
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
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

  @ApiPropertyOptional({
    example: 2,
    description:
      'Destination inventory record ID (branch receiving stock). Give this OR toBranchId, not both.',
  })
  @ValidateIf((o: CreateTransferDto) => o.toBranchId === undefined)
  @IsInt()
  @Min(1)
  toInventoryId?: number;

  @ApiPropertyOptional({
    example: 2,
    description:
      'Destination branch ID. The server finds that branch\'s row for the same product and day, creating an ' +
      'empty placeholder if it has none. This is what a branch manager sends: they cannot read another ' +
      'branch\'s sheet to look the row up. Give this OR toInventoryId, not both.',
  })
  @ValidateIf((o: CreateTransferDto) => o.toInventoryId === undefined)
  @IsInt()
  @Min(1)
  toBranchId?: number;

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
