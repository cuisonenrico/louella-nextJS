import { BadRequestException, ConflictException } from '@nestjs/common';
import { assertDayOpen, assertNotFuture } from './branch-cash-lock.util';

function fakeTx(status: 'OPEN' | 'VERIFIED' | null = null) {
  return {
    $executeRaw: jest.fn().mockResolvedValue(1),
    branchCashDay: { findUnique: jest.fn().mockResolvedValue(status ? { status } : null) },
  };
}

describe('branch cash day lock', () => {
  it('takes the advisory lock before reading the day', async () => {
    const tx = fakeTx();
    await assertDayOpen(tx as never, 3, '2026-10-01');
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.branchCashDay.findUnique.mock.invocationCallOrder[0],
    );
    expect(tx.branchCashDay.findUnique).toHaveBeenCalledWith({
      where: { branchId_date: { branchId: 3, date: new Date('2026-10-01T00:00:00.000Z') } },
      select: { status: true },
    });
  });

  it('passes an open day and a day with no record', async () => {
    await expect(assertDayOpen(fakeTx('OPEN') as never, 3, '2026-10-01')).resolves.toBeUndefined();
    await expect(assertDayOpen(fakeTx(null) as never, 3, '2026-10-01')).resolves.toBeUndefined();
  });

  it('refuses a verified day', async () => {
    await expect(assertDayOpen(fakeTx('VERIFIED') as never, 3, '2026-10-01')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

describe('assertNotFuture', () => {
  // 2026-09-30 16:30 UTC is 00:30 on Oct 1 in Manila — the early baking shift.
  const justAfterMidnightManila = new Date('2026-09-30T16:30:00.000Z');

  it('accepts the Manila today even while UTC is still on yesterday', () => {
    expect(() => assertNotFuture('2026-10-01', justAfterMidnightManila)).not.toThrow();
  });

  it('accepts past days and refuses tomorrow', () => {
    expect(() => assertNotFuture('2026-09-15', justAfterMidnightManila)).not.toThrow();
    expect(() => assertNotFuture('2026-10-02', justAfterMidnightManila)).toThrow(BadRequestException);
  });
});
