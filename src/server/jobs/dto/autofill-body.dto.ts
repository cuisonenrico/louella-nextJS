import { IsDateString, IsOptional } from 'class-validator';

export class AutofillBodyDto {
  /** Specific date to auto-fill (YYYY-MM-DD). Defaults to today if omitted. */
  @IsDateString()
  @IsOptional()
  targetDate?: string;
}
