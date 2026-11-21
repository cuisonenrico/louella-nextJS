import { PartialType, OmitType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
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

export class CreateEmployeeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  firstName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  lastName: string;

  @IsInt()
  @IsPositive()
  jobRoleId: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  branchId?: number | null;

  /** The business that pays them; null = not assigned. */
  @IsOptional()
  @IsInt()
  @IsPositive()
  companyId?: number | null;

  /** Weekdays off, 0 = Sunday. At most six: someone must have a working day. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6, { message: 'restDays must leave at least one working day' })
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  restDays?: number[];

  @IsCalendarDate()
  hiredOn: string;

  /** The starting rate, effective on the hire date. */
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0.01)
  @Max(MAX_MONEY)
  dailyRate: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string | null;

  /** Government ids, stored as entered: formats vary and are not validated. */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  sssNumber?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  philhealthNumber?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  pagibigNumber?: string | null;
}

export class UpdateEmployeeDto extends PartialType(OmitType(CreateEmployeeDto, ['dailyRate'] as const)) {}

export class SetSeparationDto {
  /** A date separates the employee; null reactivates them. */
  @ValidateIf((o: SetSeparationDto) => o.separatedOn !== null)
  @IsCalendarDate()
  separatedOn: string | null;
}

export class ListEmployeesQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  branchId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  jobRoleId?: number;

  @IsOptional()
  @IsIn(['active', 'separated', 'all'])
  status?: 'active' | 'separated' | 'all';
}

export class CreateRateDto {
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0.01)
  @Max(MAX_MONEY)
  dailyRate: number;

  @IsCalendarDate()
  effectiveOn: string;
}

/** Assign (or clear, with null) the company of several employees at once. */
export class AssignCompanyDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsInt({ each: true })
  @IsPositive({ each: true })
  employeeIds: number[];

  @ValidateIf((o: AssignCompanyDto) => o.companyId !== null)
  @IsInt()
  @IsPositive()
  companyId: number | null;
}
