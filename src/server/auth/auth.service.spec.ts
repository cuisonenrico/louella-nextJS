import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { BCRYPT_COST_FACTOR } from '../common/constants/security.constants';

function makeService(user: any) {
  const usersService = {
    findByEmail: jest.fn().mockResolvedValue(user),
  } as any;
  const prisma = {
    user: { update: jest.fn().mockResolvedValue(undefined) },
  } as any;
  const jwtService = {} as any;
  const config = { get: () => 'test-secret' } as any;
  const service = new AuthService(usersService, prisma, jwtService, config);
  return { service, prisma };
}

async function hash(password: string) {
  // Matches the current cost factor so tests don't incidentally trigger the
  // opportunistic-rehash path exercised separately below.
  return bcrypt.hash(password, BCRYPT_COST_FACTOR);
}

describe('AuthService.validateUser (login lockout)', () => {
  it('rejects a wrong password and increments the failed-attempt counter', async () => {
    const passwordHash = await hash('correct-password');
    const { service, prisma } = makeService({
      id: 1,
      email: 'a@b.com',
      passwordHash,
      isActive: true,
      failedLoginAttempts: 2,
      lockedUntil: null,
    });

    await expect(
      service.validateUser('a@b.com', 'wrong-password'),
    ).rejects.toThrow(UnauthorizedException);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { failedLoginAttempts: 3, lockedUntil: null },
    });
  });

  it('locks the account once failed attempts reach the threshold', async () => {
    const passwordHash = await hash('correct-password');
    const { service, prisma } = makeService({
      id: 1,
      email: 'a@b.com',
      passwordHash,
      isActive: true,
      failedLoginAttempts: 4,
      lockedUntil: null,
    });

    await expect(
      service.validateUser('a@b.com', 'wrong-password'),
    ).rejects.toThrow(UnauthorizedException);

    const call = prisma.user.update.mock.calls[0][0];
    expect(call.data.failedLoginAttempts).toBe(0);
    expect(call.data.lockedUntil).toBeInstanceOf(Date);
    expect(call.data.lockedUntil.getTime()).toBeGreaterThan(Date.now());
  });

  it('rejects a correct password while the account is locked, without re-checking the password', async () => {
    const passwordHash = await hash('correct-password');
    const { service, prisma } = makeService({
      id: 1,
      email: 'a@b.com',
      passwordHash,
      isActive: true,
      failedLoginAttempts: 0,
      lockedUntil: new Date(Date.now() + 60_000),
    });

    await expect(
      service.validateUser('a@b.com', 'correct-password'),
    ).rejects.toThrow('temporarily locked');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('allows login and clears a stale/expired lock once the correct password is supplied', async () => {
    const passwordHash = await hash('correct-password');
    const { service, prisma } = makeService({
      id: 1,
      email: 'a@b.com',
      passwordHash,
      isActive: true,
      failedLoginAttempts: 3,
      lockedUntil: new Date(Date.now() - 60_000), // expired
    });

    const result = await service.validateUser('a@b.com', 'correct-password');

    expect(result.id).toBe(1);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
  });

  it('does not touch failedLoginAttempts on a clean successful login', async () => {
    const passwordHash = await hash('correct-password');
    const { service, prisma } = makeService({
      id: 1,
      email: 'a@b.com',
      passwordHash,
      isActive: true,
      failedLoginAttempts: 0,
      lockedUntil: null,
    });

    await service.validateUser('a@b.com', 'correct-password');

    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('opportunistically re-hashes a password stored under an older, weaker cost factor', async () => {
    const passwordHash = await bcrypt.hash('correct-password', 4);
    const { service, prisma } = makeService({
      id: 1,
      email: 'a@b.com',
      passwordHash,
      isActive: true,
      failedLoginAttempts: 0,
      lockedUntil: null,
    });

    await service.validateUser('a@b.com', 'correct-password');

    expect(prisma.user.update).toHaveBeenCalledTimes(1);
    const call = prisma.user.update.mock.calls[0][0];
    expect(call.where).toEqual({ id: 1 });
    expect(bcrypt.getRounds(call.data.passwordHash)).toBe(BCRYPT_COST_FACTOR);
  });
});

/**
 * Harness for rotation. The stored row is returned by `findUnique` and the
 * `update` call is captured so the test can assert how the predecessor was
 * retired.
 */
function makeRotationService(stored: any, user: any = { id: 1, isActive: true }) {
  const usersService = { findById: jest.fn().mockResolvedValue(user) } as any;
  const prisma = {
    refreshToken: {
      findUnique: jest.fn().mockResolvedValue(stored),
      update: jest.fn().mockResolvedValue(undefined),
      create: jest.fn().mockResolvedValue({ id: 99 }),
    },
  } as any;
  const jwtService = {
    verifyAsync: jest.fn().mockResolvedValue({ sub: '1', jti: stored?.jti }),
    sign: jest.fn().mockReturnValue('new-token'),
  } as any;
  const config = { get: () => 'test-secret' } as any;
  return {
    service: new AuthService(usersService, prisma, jwtService, config),
    prisma,
  };
}

describe('AuthService.refresh (rotation grace window)', () => {
  const YEAR_OUT = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

  async function storedFor(token: string, overrides: any = {}) {
    return {
      id: 7,
      userId: 1,
      jti: 'jti-1',
      tokenHash: await bcrypt.hash(token, 10),
      expiresAt: YEAR_OUT,
      revoked: false,
      ...overrides,
    };
  }

  it('retires the predecessor by expiry, not by revoking it outright', async () => {
    // The replacement only reaches the client if the response arrives. Revoking
    // immediately stranded any client whose refresh was aborted mid-flight.
    const token = 'refresh-token';
    const { service, prisma } = makeRotationService(await storedFor(token));

    await service.refresh(token);

    const update = prisma.refreshToken.update.mock.calls[0][0];
    expect(update.where).toEqual({ id: 7 });
    expect(update.data.revoked).toBeUndefined();
    expect(update.data.expiresAt).toBeInstanceOf(Date);
  });

  it('leaves the predecessor usable for a short grace window', async () => {
    const token = 'refresh-token';
    const { service, prisma } = makeRotationService(await storedFor(token));

    await service.refresh(token);

    const graceUntil: Date = prisma.refreshToken.update.mock.calls[0][0].data.expiresAt;
    const remainingMs = graceUntil.getTime() - Date.now();
    expect(remainingMs).toBeGreaterThan(0);
    expect(remainingMs).toBeLessThanOrEqual(60_000);
  });

  it('never extends a token past its own expiry', async () => {
    // A token 10s from the end of its 30 days must not gain a minute of life.
    const token = 'refresh-token';
    const nearlyDone = new Date(Date.now() + 10_000);
    const { service, prisma } = makeRotationService(
      await storedFor(token, { expiresAt: nearlyDone }),
    );

    await service.refresh(token);

    expect(prisma.refreshToken.update.mock.calls[0][0].data.expiresAt).toEqual(nearlyDone);
  });

  it('still rejects a token revoked by logout', async () => {
    const token = 'refresh-token';
    const { service } = makeRotationService(await storedFor(token, { revoked: true }));

    await expect(service.refresh(token)).rejects.toThrow(UnauthorizedException);
  });

  it('still rejects a token past its expiry', async () => {
    const token = 'refresh-token';
    const { service } = makeRotationService(
      await storedFor(token, { expiresAt: new Date(Date.now() - 1000) }),
    );

    await expect(service.refresh(token)).rejects.toThrow(UnauthorizedException);
  });
});
