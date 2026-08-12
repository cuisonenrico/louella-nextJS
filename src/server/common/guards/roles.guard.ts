import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';

// Ordered low → high; indexOf comparison enforces hierarchy.
const ROLE_RANK: UserRole[] = [
  UserRole.USER,
  UserRole.VIEWER,
  UserRole.INVENTORY,
  UserRole.MANAGER,
  UserRole.ADMIN,
];

export function meetsMinRole(userRole: string, minRole: UserRole): boolean {
  return ROLE_RANK.indexOf(userRole as UserRole) >= ROLE_RANK.indexOf(minRole);
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: { role?: string } }>();

    // @Roles(X) means "X or higher in the hierarchy"
    const minRole = required[0];
    if (!user?.role || !meetsMinRole(user.role, minRole)) {
      throw new ForbiddenException(`Requires ${minRole} role or higher`);
    }
    return true;
  }
}
