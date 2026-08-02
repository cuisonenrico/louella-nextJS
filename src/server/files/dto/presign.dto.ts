import { IsIn, IsInt, IsString, Max, Min } from 'class-validator';
import {
  ALLOWED_UPLOAD_CONTENT_TYPES,
  MAX_UPLOAD_BYTES,
} from '../files.constants';

export class PresignDto {
  @IsString()
  filename: string;

  @IsIn(ALLOWED_UPLOAD_CONTENT_TYPES)
  contentType: string;

  @IsInt()
  @Min(1)
  @Max(MAX_UPLOAD_BYTES)
  size: number;
}
