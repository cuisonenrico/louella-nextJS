import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { CacheNamespaceService } from '../common/cache/cache-namespace.service';
import { buildInvalidationExtension, withPostCommitBump } from './prisma-cache-invalidation';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger(PrismaService.name);

  constructor(cache: CacheNamespaceService) {
    super();

    // $extends returns a NEW client and does not mutate `this`. Wrap `this` in
    // a Proxy that delegates model/query access to the extended client so every
    // existing `this.prisma.<model>` call site is invalidation-covered unchanged,
    // while custom members (logger, onModuleInit) still resolve off the base.
    const extended = this.$extends(buildInvalidationExtension(cache));

    // The Proxy get-trap delegates dynamically to the extended client, which
    // cannot be expressed in the static type system — the unsafe-* rules are
    // suppressed for exactly this trap, not the file.
     
    // Transactions are wrapped so the cache is invalidated again after commit.
    const transaction = (...args: unknown[]) =>
      withPostCommitBump(cache, () =>
        (extended.$transaction as (...a: unknown[]) => Promise<unknown>)(...args),
      );

    return new Proxy<PrismaService>(this, {
      get(target, prop, receiver) {
        if (prop === '$transaction') return transaction;
        if (prop in (extended as object)) {
          const value = (extended as Record<string | symbol, unknown>)[prop];
          return typeof value === 'function' ? value.bind(extended) : value;
        }
        const own = Reflect.get(target, prop, receiver);
        return typeof own === 'function' ? own.bind(target) : own;
      },
    });
     
  }

  async onModuleInit() {
    try {
      await this.$connect();
    } catch (err) {
      // Log but don't crash — Prisma reconnects lazily on first query.
      // A hard throw here prevents the container from binding to its port.
      this.logger.error('Database connection failed at startup', err);
    }
  }
}
