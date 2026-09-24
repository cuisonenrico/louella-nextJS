import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { MAX_MONEY } from '../../common/validators/payroll.validators';

export class CreateRecurringDeductionDto {
  /** SSS, PhilHealth, Pag-IBIG, or anything else the admin names. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name: string;

  /** Monthly amount taken from the employee on the 1–15 cutoff. */
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(MAX_MONEY)
  employeeShare: number;

  /** Monthly amount the bakery pays on top. Recorded, never deducted. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(MAX_MONEY)
  employerShare?: number;
}

export class UpdateRecurringDeductionDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(MAX_MONEY)
  employeeShare?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(MAX_MONEY)
  employerShare?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
