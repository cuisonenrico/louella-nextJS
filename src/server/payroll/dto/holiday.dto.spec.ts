import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateHolidayDto, UpdateHolidayDto, UpdatePayrollSettingsDto } from './holiday.dto';

/** Mirrors the global pipe: `{ whitelist: true, forbidNonWhitelisted: true }`. */
function errorsOf<T extends object>(cls: new () => T, plain: object): string[] {
  return validateSync(plainToInstance(cls, plain), { whitelist: true, forbidNonWhitelisted: true }).map((e) => e.property);
}

describe('holiday DTOs', () => {
  it('accepts a holiday and rejects a bad date or type', () => {
    expect(errorsOf(CreateHolidayDto, { date: '2026-12-25', name: 'Christmas Day', type: 'REGULAR' })).toEqual([]);
    expect(errorsOf(CreateHolidayDto, { date: '2026-02-30', name: 'X', type: 'REGULAR' })).toEqual(['date']);
    expect(errorsOf(CreateHolidayDto, { date: '2026-12-25', name: 'X', type: 'DOUBLE' })).toEqual(['type']);
  });

  it('refuses to change a holiday’s date', () => {
    expect(errorsOf(UpdateHolidayDto, { date: '2026-12-26' })).toEqual(['date']);
  });

  it('keeps multipliers between 1.00 and 5.00 with two decimals', () => {
    expect(errorsOf(UpdatePayrollSettingsDto, { regularHolidayMultiplier: 2, specialHolidayMultiplier: 1.3 })).toEqual([]);
    expect(errorsOf(UpdatePayrollSettingsDto, { regularHolidayMultiplier: 0.99 })).toEqual(['regularHolidayMultiplier']);
    expect(errorsOf(UpdatePayrollSettingsDto, { specialHolidayMultiplier: 5.01 })).toEqual(['specialHolidayMultiplier']);
    expect(errorsOf(UpdatePayrollSettingsDto, { specialHolidayMultiplier: 1.305 })).toEqual(['specialHolidayMultiplier']);
  });
});
