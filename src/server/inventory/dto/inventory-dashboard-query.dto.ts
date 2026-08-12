import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNumberString,
  IsOptional,
} from 'class-validator';
import { ProductType } from '@prisma/client';

export class InventoryDashboardQueryDto {
  @ApiPropertyOptional({
    example: '2026-03-01',
    description: 'Start date (YYYY-MM-DD). Defaults to today.',
  })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({
    example: '2026-03-21',
    description: 'End date (YYYY-MM-DD). Defaults to startDate.',
  })
  @IsDateString()
  @IsOptional()
  endDate?: string;

  @ApiPropertyOptional({
    example: '1',
    description: 'Branch ID. Omit for all branches.',
  })
  @IsNumberString()
  @IsOptional()
  branchId?: string;
}

export class RejectionQueryDto extends InventoryDashboardQueryDto {
  @ApiPropertyOptional({
    enum: ProductType,
    example: 'BREAD',
    description: 'Filter by product type.',
  })
  @IsEnum(ProductType)
  @IsOptional()
  type?: ProductType;
}
