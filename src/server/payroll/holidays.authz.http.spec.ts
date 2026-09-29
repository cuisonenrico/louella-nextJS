import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ROLE_DEFAULTS, type RoleName } from '@/lib/rbac/features';
import { RolesGuard } from '../common/guards/roles.guard';
import { FeatureGuard } from '../common/guards/feature.guard';
import { HolidaysController } from './holidays.controller';
import { HolidaysService } from './holidays.service';
import { PayrollSettingsService } from './payroll-settings.service';

/** The holiday routes through a real Nest stack with the real global guards and pipe. */
async function bootAs(role: RoleName, permissions: readonly string[] = ROLE_DEFAULTS[role]) {
  const holidays = { list: jest.fn().mockResolvedValue([]), update: jest.fn().mockResolvedValue({}) };
  const moduleRef = await Test.createTestingModule({
    controllers: [HolidaysController],
    providers: [
      { provide: HolidaysService, useValue: holidays },
      { provide: PayrollSettingsService, useValue: { get: jest.fn().mockResolvedValue({}) } },
      { provide: APP_GUARD, useClass: RolesGuard },
      { provide: APP_GUARD, useClass: FeatureGuard },
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.use((req: { user?: unknown }, _res: unknown, next: () => void) => {
    req.user = { id: 1, role, permissions: [...permissions] };
    next();
  });
  await app.init();
  return { app, holidays };
}

describe('payroll holidays over HTTP', () => {
  let app: INestApplication | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('refuses a VIEWER before loading anything', async () => {
    const booted = await bootAs('VIEWER');
    app = booted.app;
    await request(app.getHttpServer()).get('/payroll/holidays?year=2026').expect(403);
    expect(booted.holidays.list).not.toHaveBeenCalled();
  });

  it('refuses a MANAGER even with the payroll key granted', async () => {
    const booted = await bootAs('MANAGER', [...ROLE_DEFAULTS.MANAGER, 'payroll']);
    app = booted.app;
    await request(app.getHttpServer()).get('/payroll/settings').expect(403);
  });

  it('serves an ADMIN', async () => {
    const booted = await bootAs('ADMIN');
    app = booted.app;
    await request(app.getHttpServer()).get('/payroll/holidays?year=2026').expect(200);
    expect(booted.holidays.list).toHaveBeenCalledWith(2026);
  });

  it('refuses a date change on PATCH instead of ignoring it', async () => {
    const booted = await bootAs('ADMIN');
    app = booted.app;
    await request(app.getHttpServer()).patch('/payroll/holidays/90').send({ date: '2026-12-26' }).expect(400);
    expect(booted.holidays.update).not.toHaveBeenCalled();
  });
});
