import { Test } from '@nestjs/testing';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule } from '@nestjs/config';
import { CacheNamespaceModule } from './cache-namespace.module';
import { CacheNamespaceService } from './cache-namespace.service';

describe('cache wiring', () => {
  it('resolves CacheNamespaceService against the real memory store', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        CacheModule.register({ isGlobal: true, ttl: 45_000, max: 500 }),
        CacheNamespaceModule,
      ],
    }).compile();

    const service = moduleRef.get(CacheNamespaceService);
    const compute = jest.fn().mockResolvedValue('ok');

    const first = await service.wrap('inventory-agg', ['probe'], compute);
    const second = await service.wrap('inventory-agg', ['probe'], compute);

    expect(first).toBe('ok');
    expect(second).toBe('ok');
    expect(compute).toHaveBeenCalledTimes(1); // real store served the 2nd call from cache
  });
});
