import { IsNumberString, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class JobRunsQueryDto {
  @ApiPropertyOptional({ example: 'inventory-autofill' })
  @IsOptional()
  @IsString()
  jobName?: string;

  @ApiPropertyOptional({ example: '20' })
  @IsOptional()
  @IsNumberString()
  limit?: string;
}
