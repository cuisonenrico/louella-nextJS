import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { BCRYPT_COST_FACTOR } from '../common/constants/security.constants';
type UserEntity = {
  id: number;
  email: string;
  passwordHash: string;
  role: string;
  isActive: boolean;
  mustChangePassword: boolean;
  branchId: number | null;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const ACCESS_TOKEN_EXPIRES_IN = '15m';
const REFRESH_TOKEN_EXPIRES_IN_DAYS = 30;
// Per-account lockout: independent of the IP-based throttle, so an attacker
// spreading guesses across many IPs against one account still gets stopped.
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async validateUser(email: string, password: string): Promise<UserEntity> {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException(
        'Account temporarily locked due to too many failed login attempts. Try again later.',
      );
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      await this.registerFailedLoginAttempt(user);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is disabled');
    }

    // Opportunistically re-hash passwords still on an older (weaker) bcrypt
    // cost factor, now that we know the plaintext password is correct.
    const needsRehash = bcrypt.getRounds(user.passwordHash) < BCRYPT_COST_FACTOR;
    const needsAttemptReset = user.failedLoginAttempts > 0 || !!user.lockedUntil;
    if (needsRehash || needsAttemptReset) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          ...(needsAttemptReset
            ? { failedLoginAttempts: 0, lockedUntil: null }
            : {}),
          ...(needsRehash
            ? { passwordHash: await bcrypt.hash(password, BCRYPT_COST_FACTOR) }
            : {}),
        },
      });
    }

    return user;
  }

  private async registerFailedLoginAttempt(user: UserEntity) {
    const attempts = user.failedLoginAttempts + 1;
    const shouldLock = attempts >= MAX_FAILED_LOGIN_ATTEMPTS;
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: shouldLock ? 0 : attempts,
        lockedUntil: shouldLock
          ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000)
          : null,
      },
    });
  }

  async login(email: string, password: string) {
    const user = await this.validateUser(email, password);
    const accessToken = this.createAccessToken(user);
    const { refreshToken, refreshTokenId } =
      await this.createRefreshToken(user);

    return {
      accessToken,
      refreshToken,
      refreshTokenId,
      user: this.sanitizeUser(user),
    };
  }

  async register(email: string, password: string) {
    const existing = await this.usersService.findByEmail(email);
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST_FACTOR);
    const user = await this.usersService.createUser(email, passwordHash);

    const accessToken = this.createAccessToken(user);
    const { refreshToken, refreshTokenId } =
      await this.createRefreshToken(user);

    return {
      accessToken,
      refreshToken,
      refreshTokenId,
      user: this.sanitizeUser(user),
    };
  }

  async refresh(refreshToken: string) {
    const payload = await this.verifyRefreshToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { jti: payload.jti as string },
    });

    if (!stored || stored.revoked || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token invalid');
    }

    const matches = await bcrypt.compare(refreshToken, stored.tokenHash);
    if (!matches) {
      throw new UnauthorizedException('Refresh token invalid');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revoked: true },
    });

    const user = await this.usersService.findById(Number(payload.sub));
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('Account is disabled');
    }

    const accessToken = this.createAccessToken(user);
    const { refreshToken: newRefresh, refreshTokenId } =
      await this.createRefreshToken(user);

    return {
      accessToken,
      refreshToken: newRefresh,
      refreshTokenId,
      user: this.sanitizeUser(user),
    };
  }

  async logout(refreshToken?: string) {
    if (!refreshToken) {
      return { success: true };
    }

    try {
      const payload = await this.verifyRefreshToken(refreshToken);
      await this.prisma.refreshToken.updateMany({
        where: { jti: payload.jti as string },
        data: { revoked: true },
      });
    } catch {
      return { success: true };
    }

    return { success: true };
  }

  async me(userId: number) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return this.sanitizeUser(user);
  }

  private createAccessToken(user: UserEntity) {
    return this.jwtService.sign(
      { email: user.email, role: user.role, branchId: user.branchId },
      {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
        subject: String(user.id),
        expiresIn: ACCESS_TOKEN_EXPIRES_IN,
      },
    );
  }

  private async createRefreshToken(user: UserEntity) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRES_IN_DAYS);

    const jti = randomUUID();

    const refreshToken = this.jwtService.sign(
      { type: 'refresh' },
      {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
        subject: String(user.id),
        jwtid: jti,
        expiresIn: `${REFRESH_TOKEN_EXPIRES_IN_DAYS}d`,
      },
    );

    const tokenHash = await bcrypt.hash(refreshToken, 10);

    const record = await this.prisma.refreshToken.create({
      data: { userId: user.id, jti, tokenHash, expiresAt },
    });

    return { refreshToken, refreshTokenId: record.id };
  }

  private async verifyRefreshToken(token: string) {
    try {
      return await this.jwtService.verifyAsync(token, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Refresh token invalid');
    }
  }

  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new UnauthorizedException('User not found');
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid)
      throw new UnauthorizedException('Current password is incorrect');
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST_FACTOR);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: false },
    });
    return { success: true };
  }

  private sanitizeUser(user: UserEntity) {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      mustChangePassword: user.mustChangePassword,
      branchId: user.branchId,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
