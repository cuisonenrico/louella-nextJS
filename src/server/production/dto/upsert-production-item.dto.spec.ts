import { BadRequestException, ParseArrayPipe } from '@nestjs/common';
import { UpsertProductionItemDto } from './upsert-production-item.dto';

/** The exact pipe the controller applies to POST /production/upsert-bulk. */
const pipe = new ParseArrayPipe({ items: UpsertProductionItemDto });
const run = (body: unknown) =>
  pipe.transform(body, { type: 'body', metatype: Array });

describe('POST /production/upsert-bulk validation', () => {
  const row = { productId: 12, date: '2026-09-19', yield: 120 };

  it('accepts the payload the production sheet sends', async () => {
    const out = (await run([row])) as UpsertProductionItemDto[];
    expect(out[0]).toBeInstanceOf(UpsertProductionItemDto);
    expect(out[0].yield).toBe(120);
  });

  it('accepts a branchId (BranchGuard stamps one for scoped users)', async () => {
    await expect(run([{ ...row, branchId: 2 }])).resolves.toBeDefined();
  });

  // Previously unchecked: a negative yield produced a negative consumption
  // delta and put materials back into stock.
  it.each([
    ['negative yield', { ...row, yield: -5 }],
    ['fractional yield', { ...row, yield: 1.5 }],
    ['absurd yield', { ...row, yield: 1e12 }],
    ['string yield', { ...row, yield: '120' }],
    ['missing productId', { date: row.date, yield: 1 }],
    ['bad date', { ...row, date: 'yesterday' }],
  ])('rejects a %s', async (_label, bad) => {
    await expect(run([row, bad])).rejects.toThrow(BadRequestException);
  });

  it('rejects a non-array body', async () => {
    await expect(run(row)).rejects.toThrow(BadRequestException);
  });
});
