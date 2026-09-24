import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';
import { IsCalendarDate } from '../../common/validators/payroll.validators';

export class CreateAbsenceDto {
  @IsInt()
  @IsPositive()
  employeeId: number;

  @IsCalendarDate()
  date: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

export class ListAbsencesQuery {
  @IsCalendarDate()
  from: string;

  @IsCalendarDate()
  to: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  employeeId?: number;
}
