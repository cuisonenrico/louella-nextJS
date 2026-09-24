import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateExpenseDto,
  CreateValeDto,
  DayQueryDto,
  SetActualCashDto,
  SummaryQueryDto,
  UpdateExpenseDto,
} from './branch-cash.dto';

async function errors<T extends object>(cls: new () => T, body: object): Promise<string[]> {
  const found = await validate(plainToInstance(cls, body), { whitelist: true, forbidNonWhitelisted: true });
  return found.map((e) => e.property);
}

const expense = { branchId: 3, date: '2026-10-01', categoryId: 2, amount: 850, note: 'LPG refill' };

describe('branch cash DTOs', () => {
  it('accepts a valid expense', async () => {
    expect(await errors(CreateExpenseDto, expense)).toEqual([]);
  });

  it.each([0, -5, 12.345, 10_000_000_000])('rejects amount %p', async (amount) => {
    expect(await errors(CreateExpenseDto, { ...expense, amount })).toEqual(['amount']);
  });

  it.each(['2026-02-30', '2026-9-1', 'yesterday'])('rejects date %p', async (date) => {
    expect(await errors(CreateExpenseDto, { ...expense, date })).toEqual(['date']);
  });

  it('lets an edit carry the branchId BranchGuard stamps, and nothing else unknown', async () => {
    expect(await errors(UpdateExpenseDto, { branchId: 3, amount: 900 })).toEqual([]);
    expect(await errors(UpdateExpenseDto, { amount: 900, date: '2026-10-02' })).toEqual(['date']);
  });

  it('requires an employee on a vale', async () => {
    const { categoryId: _c, ...base } = expense;
    expect(await errors(CreateValeDto, base)).toEqual(['employeeId']);
  });

  it('accepts null to clear the counted cash, and zero', async () => {
    const ref = { branchId: 3, date: '2026-10-01' };
    expect(await errors(SetActualCashDto, { ...ref, actualCash: null })).toEqual([]);
    expect(await errors(SetActualCashDto, { ...ref, actualCash: 0 })).toEqual([]);
    expect(await errors(SetActualCashDto, ref)).toEqual(['actualCash']);
    expect(await errors(SetActualCashDto, { ...ref, actualCash: -1 })).toEqual(['actualCash']);
  });

  it('turns query strings into numbers', async () => {
    const q = plainToInstance(DayQueryDto, { branchId: '3', date: '2026-10-01' });
    expect(q.branchId).toBe(3);
    expect(await errors(SummaryQueryDto, { from: '2026-09-01', to: '2026-09-30', unverified: 'yes' })).toEqual([
      'unverified',
    ]);
  });
});
