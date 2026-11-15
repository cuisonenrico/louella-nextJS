import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, Min } from 'class-validator';

export class InventoryWorkbookQueryDto {
  @ApiProperty({ example: 3, description: 'The branch to export (one branch per file)' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  branchId!: number;

  @ApiProperty({ example: '2026-10-30', description: 'First day (YYYY-MM-DD)' })
  @IsDateString()
  from!: string;

  @ApiProperty({ example: '2026-11-13', description: 'Last day (YYYY-MM-DD), at most 90 days after from' })
  @IsDateString()
  to!: string;
}
