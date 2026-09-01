import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FEATURE_KEY } from '../decorators/require-feature.decorator';
import { FEATURE_BY_KEY } from '@/lib/rbac/features';

/**
 * Enforces `@RequireFeature()` against the permissions resolved by JwtStrategy.
 *
 * Registered globally, after JwtAuthGuard has populated `req.user`. A handler
 * with no `@RequireFeature()` is allowed through, which preserves the existing
 * read-open default and means adding this guard cannot lock anyone out of an
 * endpoint that was not deliberately annotated.
 */
@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: { permissions?: string[] } }>();

    const held = user?.permissions ?? [];
    if (required.some((key) => held.includes(key))) return true;

    const labels = required
      .map((key) => FEATURE_BY_KEY.get(key)?.label ?? key)
      .join(' or ');
    throw new ForbiddenException(`Requires the ${labels} permission`);
  }
}
