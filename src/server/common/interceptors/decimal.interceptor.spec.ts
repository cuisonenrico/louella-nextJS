import { Prisma } from '@prisma/client';
import { lastValueFrom, of } from 'rxjs';
import { DecimalInterceptor, plainDecimals } from './decimal.interceptor';

describe('plainDecimals', () => {
  it('turns every Decimal, however deep, into a number', () => {
    const at = new Date('2026-09-24T00:00:00Z');
    expect(
      plainDecimals({
        price: new Prisma.Decimal('12.50'),
        items: [{ quantity: new Prisma.Decimal('0.3333'), at }],
        meta: { total: 3, note: null },
      }),
    ).toEqual({
      price: 12.5,
      items: [{ quantity: 0.3333, at }],
      meta: { total: 3, note: null },
    });
  });

  it('leaves Dates and other class instances alone, and returns untouched values as-is', () => {
    const at = new Date(0);
    const body = { a: 1, list: [1, 2], at };
    expect(plainDecimals(body)).toBe(body);
    expect(plainDecimals(at)).toBe(at);
  });
});

describe('DecimalInterceptor', () => {
  it('converts the handler result', async () => {
    const out = await lastValueFrom(
      new DecimalInterceptor().intercept({} as never, {
        handle: () => of([{ factor: new Prisma.Decimal('0.001') }]),
      }),
    );
    expect(out).toEqual([{ factor: 0.001 }]);
  });
});
