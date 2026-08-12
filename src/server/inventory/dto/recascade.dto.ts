import { IsDateString, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class RecascadeDto {
  @IsInt()
  @Min(1)
  @Type(() => Number)
  branchId: number;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  productId: number;

  @IsDateString()
  fromDate: string;
}
