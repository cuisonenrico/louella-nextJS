import {
  BadRequestException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { Subject, lastValueFrom, of, throwError } from 'rxjs';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { Idempotent } from '../decorators/idempotent.decorator';

class Handlers {
  @Idempotent()
  marked() {}
  unmarked() {}
}

const uniqueViolation = () =>
  new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test' });

describe('IdempotencyInterceptor', () => {
  let store: Map<string, Record<string, unknown>>;
  let prisma: Record<string, any>;
  let interceptor: IdempotencyInterceptor;

  beforeEach(() => {
    store = new Map();
    const id = (w: any) => `${w.userId_key.userId}:${w.userId_key.key}`;
    prisma = {
      idempotencyKey: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn(async ({ data }) => {
          const k = `${data.userId}:${data.key}`;
          if (store.has(k)) throw uniqueViolation();
          store.set(k, { statusCode: null, responseBody: null, ...data });
          return data;
        }),
        findUnique: jest.fn(async ({ where }) => store.get(id(where)) ?? null),
        update: jest.fn(async ({ where, data }) => Object.assign(store.get(id(where))!, data)),
        delete: jest.fn(async ({ where }) => store.delete(id(where))),
      },
    };
    interceptor = new IdempotencyInterceptor(new Reflector(), prisma as never);
  });

  const ctx = (opts: { key?: string; body?: unknown; handler?: keyof Handlers; user?: number } = {}) => {
    const req = {
      method: 'POST',
      route: { path: '/inventory-adjustments/transfer' },
      path: '/inventory-adjustments/transfer',
      params: {},
      body: opts.body ?? { fromInventoryId: 1, toInventoryId: 2, value: 10 },
      headers: opts.key === undefined ? {} : { 'idempotency-key': opts.key },
      user: { id: opts.user ?? 7 },
    };
    return {
      getHandler: () => Handlers.prototype[opts.handler ?? 'marked'],
      getClass: () => Handlers,
      switchToHttp: () => ({ getRequest: () => req }),
    } as never;
  };

  /** Run a request through the interceptor; `handler` counts how often it books. */
  const send = async (context: never, handler = jest.fn(() => of({ pullOut: { id: 11 } }))) => {
    const out = await interceptor.intercept(context, { handle: handler } as never);
    return { result: await lastValueFrom(out), handler };
  };

  const KEY = '3f2a9c1e-7b4d-4e8f-9a01-2c3d4e5f6a7b';

  it('replays the stored response to a resend, booking once', async () => {
    const first = await send(ctx({ key: KEY }));
    const second = await send(ctx({ key: KEY }));

    expect(first.handler).toHaveBeenCalledTimes(1);
    expect(second.handler).not.toHaveBeenCalled();
    expect(second.result).toEqual({ pullOut: { id: 11 } });
  });

  it('refuses a resend while the first attempt is still running', async () => {
    // The first request has reserved the key and is still booking.
    const slow = new Subject<unknown>();
    const first = lastValueFrom(
      await interceptor.intercept(ctx({ key: KEY }), { handle: () => slow } as never),
    );

    await expect(send(ctx({ key: KEY }))).rejects.toThrow(ConflictException);

    slow.next({ pullOut: { id: 11 } });
    slow.complete();
    await expect(first).resolves.toEqual({ pullOut: { id: 11 } });
  });

  it('refuses the same key reused for a different request', async () => {
    await send(ctx({ key: KEY }));

    await expect(
      send(ctx({ key: KEY, body: { fromInventoryId: 1, toInventoryId: 2, value: 99 } })),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('releases the key when the handler fails, so a retry can go through', async () => {
    const failing = jest.fn(() => throwError(() => new Error('only 3 on hand')));

    await expect(send(ctx({ key: KEY }), failing)).rejects.toThrow('only 3 on hand');
    expect(store.has(`7:${KEY}`)).toBe(false);

    const retry = await send(ctx({ key: KEY }));
    expect(retry.handler).toHaveBeenCalledTimes(1);
  });

  it('keeps keys per user', async () => {
    await send(ctx({ key: KEY, user: 7 }));
    const other = await send(ctx({ key: KEY, user: 8 }));

    expect(other.handler).toHaveBeenCalledTimes(1);
  });

  it('rejects a malformed key', async () => {
    await expect(send(ctx({ key: 'x y' }))).rejects.toThrow(BadRequestException);
  });

  it('passes through a request without the header', async () => {
    const { handler } = await send(ctx());
    expect(handler).toHaveBeenCalledTimes(1);
    expect(prisma.idempotencyKey.create).not.toHaveBeenCalled();
  });

  it('ignores the header on handlers not marked @Idempotent()', async () => {
    const { handler } = await send(ctx({ key: KEY, handler: 'unmarked' }));
    expect(handler).toHaveBeenCalledTimes(1);
    expect(prisma.idempotencyKey.create).not.toHaveBeenCalled();
  });

  it('purges keys older than a day as new ones arrive', async () => {
    await send(ctx({ key: KEY }));

    const cutoff = prisma.idempotencyKey.deleteMany.mock.calls[0][0].where.createdAt.lt;
    expect(Date.now() - cutoff.getTime()).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000 - 1000);
  });
});
