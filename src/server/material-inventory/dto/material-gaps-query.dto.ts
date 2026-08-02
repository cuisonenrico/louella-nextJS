import { IsDateString } from 'class-validator';

export class MaterialGapsQueryDto {
  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;
}
