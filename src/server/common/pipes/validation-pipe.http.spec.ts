import { Controller, Get, INestApplication, Query, UseGuards } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional } from 'class-validator';
import request from 'supertest';
import { ALL_BRANCHES_KEY } from '@/lib/rbac/features';
import { BranchGuard } from '../guards/branch.guard';
import { createValidationPipe } from './validation-pipe.factory';

/**
 * BranchGuard together with the app's real ValidationPipe.
 *
 * The guard pins the user's own `branchId` into `req.query`. The pipe is
 * `forbidNonWhitelisted`, so a query DTO that does not declare `branchId` used to reject that
 * pinned value — `400 "property branchId should not exist"` — and a scoped branch manager could
 * not load their own daily sheet. branch.guard.http.spec.ts uses a probe with no strict pipe, so it
 * could not see the two interacting.
 */
class DateQuery {
  @IsDateString()
  date: string;
}

class RangeQuery {
  @IsDateString()
  startDate: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

/** A DTO that DOES declare branchId (like branch-cash's), so the pinned value must still reach it. */
class DeclaresBranchQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  branchId?: number;
}

@Controller('probe')
@UseGuards(BranchGuard)
class ProbeController {
  @Get('branch/:branchId/date')
  byDate(@Query() q: DateQuery) {
    return { date: q.date };
  }

  @Get('range')
  range(@Query() q: RangeQuery) {
    return { startDate: q.startDate };
  }

  @Get('declared')
  declared(@Query() q: DeclaresBranchQuery) {
    return { branchId: q.branchId ?? null };
  }
}

type TestUser = { role: string; branchId: number | null; permissions: string[] };

async function bootWith(user: TestUser): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ controllers: [ProbeController] }).compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(createValidationPipe());
  app.use((req: { user?: TestUser }, _res: unknown, next: () => void) => {
    req.user = user;
    next();
  });
  await app.init();
  return app;
}

describe('BranchGuard + the app ValidationPipe', () => {
  describe('a manager confined to branch 3', () => {
    let app: INestApplication;
    beforeAll(async () => {
      app = await bootWith({ role: 'MANAGER', branchId: 3, permissions: [] });
    });
    afterAll(() => app.close());

    it('loads a by-branch route whose DTO has no branchId', async () => {
      const res = await request(app.getHttpServer()).get('/probe/branch/3/date?date=2026-09-30');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ date: '2026-09-30' });
    });

    it('loads a listing route whose DTO has no branchId', async () => {
      const res = await request(app.getHttpServer()).get('/probe/range?startDate=2026-09-01&endDate=2026-09-30');
      expect(res.status).toBe(200);
    });

    it('still gives the pinned branch to a DTO that declares branchId', async () => {
      const res = await request(app.getHttpServer()).get('/probe/declared');
      expect(res.body).toEqual({ branchId: 3 });
    });

    it('still refuses another branch', async () => {
      const res = await request(app.getHttpServer()).get('/probe/branch/5/date?date=2026-09-30');
      expect(res.status).toBe(403);
    });

    it('stays strict about parameters that are genuinely unknown', async () => {
      const res = await request(app.getHttpServer()).get('/probe/range?startDate=2026-09-01&bogus=1');
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toContain('bogus');
    });
  });

  describe('an all-branches user', () => {
    let app: INestApplication;
    beforeAll(async () => {
      app = await bootWith({ role: 'ADMIN', branchId: null, permissions: [ALL_BRANCHES_KEY] });
    });
    afterAll(() => app.close());

    it('is unaffected: nothing is pinned, and an explicit branchId is still checked by the DTO', async () => {
      const ok = await request(app.getHttpServer()).get('/probe/range?startDate=2026-09-01');
      expect(ok.status).toBe(200);
      const explicit = await request(app.getHttpServer()).get('/probe/range?startDate=2026-09-01&branchId=5');
      expect(explicit.status).toBe(400); // RangeQuery does not declare branchId; admins are not pinned
    });
  });
});
