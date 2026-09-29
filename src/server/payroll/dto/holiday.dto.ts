import { HolidayType } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Max, MaxLength, Min } from 'class-validator';
import { IsCalendarDate } from '../../common/validators/payroll.validators';

export class CreateHolidayDto {
  @IsCalendarDate()
  date: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;

  @IsEnum(HolidayType)
  type: HolidayType;

  @IsOptional()
  @IsBoolean()
  isClosed?: boolean;
}

/** No `date`: a holiday is moved by deleting and recreating it. */
export class UpdateHolidayDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsEnum(HolidayType)
  type?: HolidayType;

  @IsOptional()
  @IsBoolean()
  isClosed?: boolean;
}

export class CreateRestDayWorkDto {
  @IsInt()
  @IsPositive()
  employeeId: number;
}

export class UpdatePayrollSettingsDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(1)
  @Max(5)
  regularHolidayMultiplier?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(1)
  @Max(5)
  specialHolidayMultiplier?: number;
}
