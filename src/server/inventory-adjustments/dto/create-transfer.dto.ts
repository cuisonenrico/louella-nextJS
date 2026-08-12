import { IsInt, IsOptional, IsPositive, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTransferDto {
  @ApiProperty({
    example: 1,
    description: 'Source inventory record ID (branch being pulled from)',
  })
  @IsInt()
  fromInventoryId: number;

  @ApiProperty({
    example: 2,
    description: 'Destination inventory record ID (branch receiving stock)',
  })
  @IsInt()
  toInventoryId: number;

  @ApiProperty({
    example: 50,
    description: 'Number of units to transfer (positive integer)',
  })
  @IsInt()
  @IsPositive()
  value: number;

  @ApiPropertyOptional({
    example: 'Midday pull-out to cover Cubao branch shortage',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
