import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ROLE_DEFAULTS, type RoleName } from '@/lib/rbac/features';
import { RolesGuard } from '../common/guards/roles.guard';
import { FeatureGuard } from '../common/guards/feature.guard';
import { IDEMPOTENT_KEY } from '../common/decorators/idempotent.decorator';
import { BranchCashController } from './branch-cash.controller';
import { BranchCashDaysService } from './branch-cash-days.service';
import { BranchCashEntriesService } from './branch-cash-entries.service';
import { ExpenseCategoriesService } from './expense-categories.service';

/**
 * Branch cash through a real Nest + Express 5 stack: the real global guards,
 * the real BranchGuard, and the app's ValidationPipe options. Scope and the
 * body stamping only show up at this level.
 */
async function bootAs(role: RoleName, branchId: number | null) {
  const days = {
    getDay: jest.fn().mockResolvedValue({}),
    summary: jest.fn().mockResolvedValue({ rows: [] }),
    verify: jest.fn().mockResolvedValue({}),
  };
  const entries = {
    createExpense: jest.fn().mockResolvedValue({ id: 11 }),
    updateExpense: jest.fn().mockResolvedValue({ id: 11 }),
  };
  const moduleRef = await Test.createTestingModule({
    controllers: [BranchCashController],
    providers: [
      { provide: BranchCashDaysService, useValue: days },
      { provide: BranchCashEntriesService, useValue: entries },
      { provide: ExpenseCategoriesService, useValue: {} },
      { provide: APP_GUARD, useClass: RolesGuard },
      { provide: APP_GUARD, useClass: FeatureGuard },
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
  app.use((req: { user?: unknown }, _res: unknown, next: () => void) => {
    req.user = { id: 1, role, branchId, permissions: [...ROLE_DEFAULTS[role]] };
    next();
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  return { app, days, entries };
}

describe('branch cash over HTTP', () => {
  let app: INestApplication | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('confines a manager to their own branch-day', async () => {
    const booted = await bootAs('MANAGER', 3);
    app = booted.app;
    await request(app.getHttpServer()).get('/branch-cash/day?date=2026-10-01').expect(200);
    expect(booted.days.getDay).toHaveBeenCalledWith(3, '2026-10-01');
    await request(app.getHttpServer()).get('/branch-cash/day?branchId=5&date=2026-10-01').expect(403);
  });

  it('scopes a manager’s summary to their branch', async () => {
    const booted = await bootAs('MANAGER', 3);
    app = booted.app;
    await request(app.getHttpServer()).get('/branch-cash/summary?from=2026-10-01&to=2026-10-07').expect(200);
    expect(booted.days.summary).toHaveBeenCalledWith({ from: '2026-10-01', to: '2026-10-07', branchId: 3, unverified: false });
  });

  it('stamps the manager’s branch on a new expense', async () => {
    const booted = await bootAs('MANAGER', 3);
    app = booted.app;
    await request(app.getHttpServer())
      .post('/branch-cash/expenses')
      .send({ date: '2026-10-01', categoryId: 2, amount: 850 })
      .expect(201);
    expect(booted.entries.createExpense.mock.calls[0][0]).toMatchObject({ branchId: 3, amount: 850 });
  });

  it('lets a manager edit despite the stamped branchId, scoped by the query', async () => {
    const booted = await bootAs('MANAGER', 3);
    app = booted.app;
    await request(app.getHttpServer()).patch('/branch-cash/expenses/11').send({ amount: 900 }).expect(200);
    expect(booted.entries.updateExpense).toHaveBeenCalledWith(11, expect.objectContaining({ amount: 900 }), 3, 1);
  });

  it('rejects an amount with more than two decimals', async () => {
    const booted = await bootAs('MANAGER', 3);
    app = booted.app;
    await request(app.getHttpServer())
      .post('/branch-cash/expenses')
      .send({ date: '2026-10-01', categoryId: 2, amount: 12.345 })
      .expect(400);
    expect(booted.entries.createExpense).not.toHaveBeenCalled();
  });

  it('refuses verification to a manager and serves it to an admin', async () => {
    const manager = await bootAs('MANAGER', 3);
    app = manager.app;
    await request(app.getHttpServer()).post('/branch-cash/day/verify').send({ date: '2026-10-01' }).expect(403);
    await app.close();

    const admin = await bootAs('ADMIN', null);
    app = admin.app;
    await request(app.getHttpServer())
      .post('/branch-cash/day/verify')
      .send({ branchId: 3, date: '2026-10-01' })
      .expect(201);
    expect(admin.days.verify).toHaveBeenCalledWith(3, '2026-10-01', 1);
  });

  it('refuses a viewer before loading anything', async () => {
    const booted = await bootAs('VIEWER', null);
    app = booted.app;
    await request(app.getHttpServer()).get('/branch-cash/summary?from=2026-10-01&to=2026-10-07').expect(403);
    expect(booted.days.summary).not.toHaveBeenCalled();
  });

  it('marks the adding endpoints idempotent', () => {
    const reflector = new Reflector();
    const proto = BranchCashController.prototype;
    expect(reflector.get(IDEMPOTENT_KEY, proto.createExpense)).toBe(true);
    expect(reflector.get(IDEMPOTENT_KEY, proto.createVale)).toBe(true);
  });
});
