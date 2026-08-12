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
