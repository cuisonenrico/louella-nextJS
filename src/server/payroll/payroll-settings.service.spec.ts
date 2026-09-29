import { PayrollSettingsService } from './payroll-settings.service';

describe('PayrollSettingsService', () => {
  let prisma: Record<string, any>;
  let service: PayrollSettingsService;

  beforeEach(() => {
    prisma = {
      payrollSettings: {
        findUnique: jest.fn().mockResolvedValue({ id: 1, regularHolidayMultiplier: 2, specialHolidayMultiplier: 1.3 }),
        upsert: jest.fn().mockImplementation(({ update }) =>
          Promise.resolve({ id: 1, regularHolidayMultiplier: 2, specialHolidayMultiplier: 1.3, ...update }),
        ),
      },
      auditEvent: { createMany: jest.fn() },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    };
    service = new PayrollSettingsService(prisma as never);
  });

  it('reads the multipliers', async () => {
    await expect(service.get()).resolves.toEqual({ regularHolidayMultiplier: 2, specialHolidayMultiplier: 1.3 });
  });

  it('reads the defaults when the row is missing', async () => {
    prisma.payrollSettings.findUnique.mockResolvedValue(null);
    await expect(service.get()).resolves.toEqual({ regularHolidayMultiplier: 2, specialHolidayMultiplier: 1.3 });
  });

  it('updates only what was sent, with no cutoff lock', async () => {
    const view = await service.update({ specialHolidayMultiplier: 1.5 }, 7);
    expect(prisma.payrollSettings.upsert).toHaveBeenCalledWith({
      where: { id: 1 },
      update: { specialHolidayMultiplier: 1.5, updatedById: 7 },
      create: { id: 1, specialHolidayMultiplier: 1.5, updatedById: 7 },
    });
    expect(view).toEqual({ regularHolidayMultiplier: 2, specialHolidayMultiplier: 1.5 });
    expect(prisma.auditEvent.createMany).toHaveBeenCalled();
  });
});
