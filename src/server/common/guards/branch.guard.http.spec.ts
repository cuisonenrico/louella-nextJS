import {
  Controller,
  Get,
  INestApplication,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ALL_BRANCHES_KEY } from '@/lib/rbac/features';
import { BranchGuard } from './branch.guard';

/**
 * BranchGuard through a real Nest + Express 5 stack.
 *
 * branch.guard.spec.ts hands the guard a plain object, where assigning into
 * `req.query` sticks. Under Express 5 `req.query` is a re-parsing getter, so
 * that assignment was silently discarded and scoped users reached handlers
 * with no branch filter at all. Only an HTTP-level test can see that.
 */
@Controller('scoped')
@UseGuards(BranchGuard)
class ScopedController {
  @Get()
  list(@Query('branchId') branchId?: unknown) {
    return { branchId: branchId ?? null };
  }

  @Get(':id')
  one(@Param('id') id: string, @Query('branchId') branchId?: unknown) {
    return { id, branchId: branchId ?? null };
  }
}

type TestUser = { role: string; branchId: number | null; permissions: string[] };

async function bootWith(user: TestUser): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    controllers: [ScopedController],
  }).compile();
  const app = moduleRef.createNestApplication();
  app.use((req: { user?: TestUser }, _res: unknown, next: () => void) => {
    req.user = user;
    next();
  });
  await app.init();
  return app;
}

describe('BranchGuard over HTTP (Express 5)', () => {
  describe('a user confined to branch 3', () => {
    let app: INestApplication;
    beforeAll(async () => {
      app = await bootWith({ role: 'MANAGER', branchId: 3, permissions: [] });
    });
    afterAll(() => app.close());

    it('reaches a listing handler with its own branch, not null', async () => {
      const res = await request(app.getHttpServer()).get('/scoped');
      expect(res.body).toEqual({ branchId: '3' });
    });

    it('reaches an :id handler with its own branch, not null', async () => {
      const res = await request(app.getHttpServer()).get('/scoped/99');
      expect(res.body).toEqual({ id: '99', branchId: '3' });
    });

    it('keeps the other query parameters', async () => {
      const res = await request(app.getHttpServer()).get('/scoped?page=2');
      expect(res.status).toBe(200);
      expect(res.body.branchId).toBe('3');
    });

    it('refuses another branch', async () => {
      const res = await request(app.getHttpServer()).get('/scoped?branchId=5');
      expect(res.status).toBe(403);
    });

    it('collapses a repeated branchId to its own branch', async () => {
      const res = await request(app.getHttpServer()).get(
        '/scoped?branchId=3&branchId=5',
      );
      expect(res.body).toEqual({ branchId: '3' });
    });

    it('overrides a nested branchId rather than passing it through', async () => {
      const res = await request(app.getHttpServer()).get('/scoped?branchId[x]=5');
      expect(res.body).toEqual({ branchId: '3' });
    });
  });

  describe('an all-branches user', () => {
    let app: INestApplication;
    beforeAll(async () => {
      app = await bootWith({
        role: 'ADMIN',
        branchId: null,
        permissions: [ALL_BRANCHES_KEY],
      });
    });
    afterAll(() => app.close());

    it('is not stamped, so it still sees every branch', async () => {
      const res = await request(app.getHttpServer()).get('/scoped');
      expect(res.body).toEqual({ branchId: null });
    });

    it('may pick any branch', async () => {
      const res = await request(app.getHttpServer()).get('/scoped?branchId=5');
      expect(res.body).toEqual({ branchId: '5' });
    });
  });
});
