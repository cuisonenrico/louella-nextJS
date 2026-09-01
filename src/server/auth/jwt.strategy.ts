import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { resolvePermissions } from '../permissions/resolve-permissions';
import type { RoleName } from '@/lib/rbac/features';

type Override = { k: string; e: boolean };

type AuthRow = {
  id: number;
  email: string;
  role: string;
  branchId: number | null;
  isActive: boolean;
  role_overrides: Override[];
  user_overrides: Override[];
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const secret = config.get<string>('JWT_ACCESS_SECRET');
    // validateEnv already rejects a missing secret at boot, so this is
    // unreachable in practice — but passport-jwt silently accepts every token
    // when handed undefined, and that failure mode is far too dangerous to
    // leave to a type assertion.
    if (!secret) {
      throw new Error('JWT_ACCESS_SECRET is not set');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: {
    sub: string;
    email: string;
    role: string;
    branchId?: number | null;
  }) {
    // Re-resolve the user from the database on every request so that
    // deactivations, role changes, branch reassignments and permission changes
    // take effect immediately instead of lingering for the lifetime of the
    // access token.
    //
    // The two override sets come back as aggregated JSON rather than joined
    // rows: joining both tables directly would produce their cartesian product
    // (10 role overrides x 5 user overrides = 50 rows for one user). Both
    // subqueries are served by the existing indexes on RoleFeaturePermission.role
    // and UserFeaturePermission.userId, so this remains a single round trip —
    // which matters, since the database is cross-region and every statement
    // costs real latency.
    const rows = await this.prisma.$queryRaw<AuthRow[]>`
      SELECT u.id, u.email, u.role, u."branchId", u."isActive",
        COALESCE((
          SELECT json_agg(json_build_object('k', r."featureKey", 'e', r.enabled))
          FROM "RoleFeaturePermission" r WHERE r.role = u.role
        ), '[]'::json) AS role_overrides,
        COALESCE((
          SELECT json_agg(json_build_object('k', p."featureKey", 'e', p.enabled))
          FROM "UserFeaturePermission" p WHERE p."userId" = u.id
        ), '[]'::json) AS user_overrides
      FROM "User" u
      WHERE u.id = ${Number(payload.sub)}
    `;

    const user = rows[0];

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Account is no longer active');
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      branchId: user.branchId ?? null,
      permissions: resolvePermissions(
        user.role as RoleName,
        user.role_overrides,
        user.user_overrides,
      ),
    };
  }
}
