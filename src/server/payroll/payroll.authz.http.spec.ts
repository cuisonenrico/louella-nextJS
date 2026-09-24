import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ROLE_DEFAULTS, type RoleName } from '@/lib/rbac/features';
import { RolesGuard } from '../common/guards/roles.guard';
import { FeatureGuard } from '../common/guards/feature.guard';
import { PayrollController } from './payroll.controller';
import { PayrollInputsService } from './payroll-inputs.service';
import { PayrollRunsService } from './payroll-runs.service';

/**
 * The payroll gate through a real Nest + Express stack with the real global
 * guards. The matrix spec reads decorator metadata; this proves a request is
 * actually refused before any payroll data is loaded.
 */
async function bootAs(role: RoleName, permissions: readonly string[] = ROLE_DEFAULTS[role]) {
  const runs = { getCutoff: jest.fn().mockResolvedValue({ status: 'OPEN' }) };
  const moduleRef = await Test.createTestingModule({
    controllers: [PayrollController],
    providers: [
      { provide: PayrollRunsService, useValue: runs },
      { provide: PayrollInputsService, useValue: {} },
      { provide: APP_GUARD, useClass: RolesGuard },
      { provide: APP_GUARD, useClass: FeatureGuard },
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
  app.use((req: { user?: unknown }, _res: unknown, next: () => void) => {
    req.user = { id: 1, role, permissions: [...permissions] };
    next();
  });
  await app.init();
  return { app, runs };
}

describe('payroll over HTTP', () => {
  let app: INestApplication | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('refuses a VIEWER before loading anything', async () => {
    const booted = await bootAs('VIEWER');
    app = booted.app;
    await request(app.getHttpServer()).get('/payroll/cutoffs/2026-09-01').expect(403);
    expect(booted.runs.getCutoff).not.toHaveBeenCalled();
  });

  it('refuses a MANAGER even with the payroll key granted', async () => {
    const booted = await bootAs('MANAGER', [...ROLE_DEFAULTS.MANAGER, 'payroll']);
    app = booted.app;
    await request(app.getHttpServer()).get('/payroll/cutoffs/2026-09-01').expect(403);
  });

  it('serves an ADMIN', async () => {
    const booted = await bootAs('ADMIN');
    app = booted.app;
    await request(app.getHttpServer()).get('/payroll/cutoffs/2026-09-01').expect(200);
    expect(booted.runs.getCutoff).toHaveBeenCalledWith('2026-09-01');
  });

  it('rejects a periodStart that is not the 1st or 16th', async () => {
    const booted = await bootAs('ADMIN');
    app = booted.app;
    await request(app.getHttpServer()).get('/payroll/cutoffs/2026-09-02').expect(400);
  });
});
