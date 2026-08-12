import { IsBoolean, IsString, MinLength } from 'class-validator';

export class SetPermissionDto {
  @IsString()
  @MinLength(1)
  featureKey: string;

  @IsBoolean()
  enabled: boolean;
}
