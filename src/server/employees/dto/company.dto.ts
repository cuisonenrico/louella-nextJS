import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCompanyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;

  /** Printed after the name on the payroll sheet. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string | null;

  /** "In-charge" signatory at the foot of the payroll sheet. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  paymasterName?: string | null;

  /** "Approved for payment" signatory. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  approverName?: string | null;
}

export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  paymasterName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  approverName?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
