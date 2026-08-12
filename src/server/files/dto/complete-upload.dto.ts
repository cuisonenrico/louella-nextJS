import { IsString } from 'class-validator';

export class CompleteUploadDto {
  @IsString()
  key: string;

  @IsString()
  filename: string;
}
