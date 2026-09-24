import { IsEmail, IsIn, IsInt, IsOptional, IsPositive, MinLength } from 'class-validator';
import type { UserRole } from '@prisma/client';

/** ADMIN is deliberately absent: granting it stays a Users-screen decision. */
export const EMPLOYEE_LOGIN_ROLES = ['USER', 'VIEWER', 'INVENTORY', 'MANAGER'] as const;
export type EmployeeLoginRole = Exclude<UserRole, 'ADMIN'>;

export class CreateEmployeeAccountDto {
  @IsEmail()
  email: string;

  /** Temporary; the employee must change it at first login. */
  @MinLength(8)
  password: string;

  @IsIn(EMPLOYEE_LOGIN_ROLES, { message: 'role must be USER, VIEWER, INVENTORY or MANAGER' })
  role: EmployeeLoginRole;

  @IsOptional()
  @IsInt()
  @IsPositive()
  branchId?: number;
}

export class LinkEmployeeAccountDto {
  @IsInt()
  @IsPositive()
  userId: number;
}
