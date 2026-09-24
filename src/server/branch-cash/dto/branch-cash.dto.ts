import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { IsCalendarDate, MAX_MONEY } from '../../common/validators/payroll.validators';

const MONEY = { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false } as const;

class BranchDayDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  branchId: number;

  @IsCalendarDate()
  date: string;
}

export class CashDayRefDto extends BranchDayDto {}
export class DayQueryDto extends BranchDayDto {}

export class CreateExpenseDto extends BranchDayDto {
  @IsInt()
  @IsPositive()
  categoryId: number;

  @IsNumber(MONEY)
  @Min(0.01)
  @Max(MAX_MONEY)
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string | null;
}

/**
 * An edit. The date and branch of a line never change — void and re-add
 * instead. `branchId` is accepted only because BranchGuard stamps it into every
 * scoped user's body, and forbidNonWhitelisted would otherwise refuse the edit.
 */
export class UpdateExpenseDto {
  @IsOptional()
  @IsInt()
  @IsPositive()
  branchId?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  categoryId?: number;

  @IsOptional()
  @IsNumber(MONEY)
  @Min(0.01)
  @Max(MAX_MONEY)
  amount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string | null;
}

export class CreateValeDto extends BranchDayDto {
  @IsInt()
  @IsPositive()
  employeeId: number;

  @IsNumber(MONEY)
  @Min(0.01)
  @Max(MAX_MONEY)
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string | null;
}

/** See UpdateExpenseDto for why `branchId` is here. */
export class UpdateValeDto {
  @IsOptional()
  @IsInt()
  @IsPositive()
  branchId?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  employeeId?: number;

  @IsOptional()
  @IsNumber(MONEY)
  @Min(0.01)
  @Max(MAX_MONEY)
  amount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string | null;
}

export class SetActualCashDto extends BranchDayDto {
  /** The counted cash, or null to clear it. Zero is a real count. */
  @ValidateIf((o: SetActualCashDto) => o.actualCash !== null)
  @IsNumber(MONEY)
  @Min(0)
  @Max(MAX_MONEY)
  actualCash: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string | null;
}

export class SummaryQueryDto {
  @IsCalendarDate()
  from: string;

  @IsCalendarDate()
  to: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  branchId?: number;

  @IsOptional()
  @IsIn(['true', 'false'])
  unverified?: string;
}

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name: string;

  @IsOptional()
  @IsBoolean()
  requiresNote?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  sortOrder?: number;
}

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
