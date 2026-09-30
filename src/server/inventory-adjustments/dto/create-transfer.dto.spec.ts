import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateTransferDto } from './create-transfer.dto';

const check = (body: Record<string, unknown>) =>
  validate(plainToInstance(CreateTransferDto, body), { whitelist: true, forbidNonWhitelisted: true });

describe('CreateTransferDto — naming the destination', () => {
  it('accepts a destination branch alone', async () => {
    expect(await check({ fromInventoryId: 1, toBranchId: 2, value: 5 })).toHaveLength(0);
  });

  it('accepts a destination row alone (existing callers)', async () => {
    expect(await check({ fromInventoryId: 1, toInventoryId: 9, value: 5 })).toHaveLength(0);
  });

  it('rejects naming neither', async () => {
    const errors = await check({ fromInventoryId: 1, value: 5 });
    expect(errors.map((e) => e.property).sort()).toEqual(['toBranchId', 'toInventoryId']);
  });

  it('rejects a branch id that is not a positive integer', async () => {
    expect(await check({ fromInventoryId: 1, toBranchId: 0, value: 5 })).not.toHaveLength(0);
    expect(await check({ fromInventoryId: 1, toBranchId: 'x', value: 5 })).not.toHaveLength(0);
  });

  it('lets a request naming both through, for the service to refuse with a clear message', async () => {
    expect(await check({ fromInventoryId: 1, toInventoryId: 9, toBranchId: 2, value: 5 })).toHaveLength(0);
  });
});
