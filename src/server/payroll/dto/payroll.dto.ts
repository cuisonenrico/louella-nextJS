import { PayrollAdjustmentCategory, PayrollAdjustmentKind } from '@prisma/client';
import { IsEnum, IsInt, IsNotEmpty, IsNumber, IsPositive, IsString, Max, MaxLength, Min } from 'class-validator';
import { IsPeriodStart, MAX_MONEY } from '../../common/validators/payroll.validators';

export class CreateAdjustmentDto {
  @IsInt()
  @IsPositive()
  employeeId: number;

  @IsPeriodStart()
  periodStart: string;

  @IsEnum(PayrollAdjustmentKind)
  kind: PayrollAdjustmentKind;

  @IsEnum(PayrollAdjustmentCategory)
  category: PayrollAdjustmentCategory;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  description: string;

  /** Always positive; the sign comes from `kind`. */
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0.01)
  @Max(MAX_MONEY)
  amount: number;
}

export class CreateSkipDto {
  @IsInt()
  @IsPositive()
  employeeId: number;

  @IsInt()
  @IsPositive()
  recurringDeductionId: number;
}

export class VoidRunDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  reason: string;
}
