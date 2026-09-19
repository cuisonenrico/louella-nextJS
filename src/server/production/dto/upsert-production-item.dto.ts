import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, Max, Min } from 'class-validator';
import { MAX_UNITS } from '../../common/constants/inventory.constants';

/**
 * One row of the production sheet's save (`POST /production/upsert-bulk`).
 *
 * The endpoint used to take an inline-typed array. ValidationPipe cannot see
 * through a plain `Array` metatype, so nothing was checked: a negative yield
 * went straight into the material-consumption delta and *returned* stock.
 */
export class UpsertProductionItemDto {
  @ApiProperty({ example: 12 })
  @IsInt()
  @Min(1)
  productId: number;

  @ApiProperty({ example: '2026-09-19', description: 'YYYY-MM-DD' })
  @IsDateString()
  date: string;

  @ApiProperty({ example: 120, description: 'Pieces produced' })
  @IsInt()
  @Min(0)
  @Max(MAX_UNITS)
  yield: number;

  /** Defaults to PRODUCTION_BRANCH_ID. BranchGuard stamps it for scoped users. */
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  branchId?: number;
}
