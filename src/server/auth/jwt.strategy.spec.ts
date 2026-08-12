import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';

function makeStrategy(user: unknown) {
  const config = { get: () => 'test-secret' } as unknown as ConfigService;
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(user) },
  } as any;
  return { strategy: new JwtStrategy(config, prisma), prisma };
}

const payload = { sub: '5', email: 'a@b.com', role: 'USER', branchId: null };

describe('JwtStrategy.validate', () => {
  it('returns the user with role/branch sourced from the database', async () => {
    const { strategy } = makeStrategy({
      id: 5,
      email: 'a@b.com',
      role: 'MANAGER',
      branchId: 3,
      isActive: true,
    });

    const result = await strategy.validate(payload);

    // DB is authoritative — a stale token role must not win
    expect(result).toEqual({
      id: 5,
      email: 'a@b.com',
      role: 'MANAGER',
      branchId: 3,
    });
  });

  it('rejects when the user no longer exists', async () => {
    const { strategy } = makeStrategy(null);
    await expect(strategy.validate(payload)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects when the user has been deactivated', async () => {
    const { strategy } = makeStrategy({
      id: 5,
      email: 'a@b.com',
      role: 'USER',
      branchId: null,
      isActive: false,
    });
    await expect(strategy.validate(payload)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
