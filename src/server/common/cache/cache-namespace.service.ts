import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { ConfigService } from '@nestjs/config';

/**
 * Namespaced get-or-compute cache with version-token invalidation.
 *
 * The in-memory store cannot enumerate or wildcard-delete keys, so each
 * namespace holds a monotonic version embedded in every key. bump() increments
 * the version, instantly orphaning all prior keys (which then expire via TTL).
 * Versions live in-process; cross-instance freshness is bounded by the TTL.
 */
@Injectable()
export class CacheNamespaceService {
  private readonly logger = new Logger(CacheNamespaceService.name);
  private readonly versions = new Map<string, number>();
  private readonly enabled: boolean;
  private readonly defaultTtlMs: number;

  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    config: ConfigService,
  ) {
    this.enabled = config.get<string>('CACHE_ENABLED', 'true') !== 'false';
    const parsed = Number(config.get<string>('CACHE_TTL_MS', '45000'));
    this.defaultTtlMs = Number.isFinite(parsed) && parsed > 0 ? parsed : 45000;
  }

  bump(namespace: string): void {
    this.versions.set(namespace, (this.versions.get(namespace) ?? 0) + 1);
  }

  async wrap<T>(
    namespace: string,
    keyParts: (string | number)[],
    computeFn: () => Promise<T>,
    ttlMs?: number,
  ): Promise<T> {
    if (!this.enabled) return computeFn();

    const version = this.versions.get(namespace) ?? 0;
    const key = `${namespace}:v${version}:${keyParts.join(':')}`;

    try {
      const hit = await this.cache.get<T>(key);
      if (hit !== undefined && hit !== null) return hit;
    } catch (err) {
      this.logger.warn(
        `cache get failed for ${key}; computing from source`,
        err as Error,
      );
    }

    const fresh = await computeFn();

    try {
      await this.cache.set(key, fresh, ttlMs ?? this.defaultTtlMs);
    } catch (err) {
      this.logger.warn(`cache set failed for ${key}`, err as Error);
    }

    return fresh;
  }
}
