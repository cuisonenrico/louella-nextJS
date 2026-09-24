import { ConflictException } from '@nestjs/common';
import { assertValeWithinEmployment } from './vale-window.util';

const at = (d: string) => new Date(`${d}T00:00:00.000Z`);

function fakeTx(found: { date: Date } | null) {
  return { branchVale: { findFirst: jest.fn().mockResolvedValue(found) } };
}

describe('assertValeWithinEmployment', () => {
  it('passes when every vale is inside the new window', async () => {
    const tx = fakeTx(null);
    await expect(assertValeWithinEmployment(tx as never, 5, '2026-01-05', '2026-09-30')).resolves.toBeUndefined();
    expect(tx.branchVale.findFirst).toHaveBeenCalledWith({
      where: {
        employeeId: 5,
        deletedAt: null,
        OR: [{ date: { lt: at('2026-01-05') } }, { date: { gt: at('2026-09-30') } }],
      },
      select: { date: true },
      orderBy: { date: 'asc' },
    });
  });

  it('does not bound the end while the employee is still employed', async () => {
    const tx = fakeTx(null);
    await assertValeWithinEmployment(tx as never, 5, '2026-01-05', null);
    expect(tx.branchVale.findFirst.mock.calls[0][0].where.OR).toEqual([{ date: { lt: at('2026-01-05') } }]);
  });

  it('refuses a change that would strand a vale outside employment', async () => {
    const tx = fakeTx({ date: at('2026-10-02') });
    await expect(assertValeWithinEmployment(tx as never, 5, '2026-01-05', '2026-09-30')).rejects.toThrow(
      new ConflictException(
        'This employee has a vale dated 2026-10-02, outside the new employment dates. Void or reassign it first.',
      ),
    );
  });
});
