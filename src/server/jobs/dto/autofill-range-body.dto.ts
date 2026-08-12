import { IsDateString, IsOptional } from 'class-validator';

export class AutofillRangeBodyDto {
  /** Start date of the range to back-fill (YYYY-MM-DD). */
  @IsDateString()
  startDate: string;

  /** End date of the range (YYYY-MM-DD). Defaults to yesterday if omitted. */
  @IsDateString()
  @IsOptional()
  endDate?: string;
}
