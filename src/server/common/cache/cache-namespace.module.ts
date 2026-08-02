import { Global, Module } from '@nestjs/common';
import { CacheNamespaceService } from './cache-namespace.service';

/**
 * Global so PrismaService (invalidation) and the aggregation services can all
 * inject the same CacheNamespaceService instance. Relies on the app-level
 * CacheModule.register({ isGlobal: true }) for the CACHE_MANAGER token.
 */
@Global()
@Module({
  providers: [CacheNamespaceService],
  exports: [CacheNamespaceService],
})
export class CacheNamespaceModule {}
