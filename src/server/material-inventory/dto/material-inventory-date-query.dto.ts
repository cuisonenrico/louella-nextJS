import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty } from 'class-validator';

export class MaterialInventoryDateQueryDto {
  @ApiProperty({
    example: '2026-03-01',
    description: 'Date in YYYY-MM-DD format',
  })
  @IsDateString()
  @IsNotEmpty()
  date: string;
}
