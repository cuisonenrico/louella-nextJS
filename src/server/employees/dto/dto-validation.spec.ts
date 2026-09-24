import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateEmployeeDto, CreateRateDto, SetSeparationDto } from './employee.dto';

function errorsOf<T extends object>(cls: new () => T, plain: object): string[] {
  return validateSync(plainToInstance(cls, plain)).map((e) => e.property);
}

const valid = {
  firstName: 'Ana',
  lastName: 'Cruz',
  jobRoleId: 2,
  hiredOn: '2026-01-05',
  restDays: [0],
  dailyRate: 600,
};

describe('employee DTO validation', () => {
  it('accepts a well-formed employee', () => {
    expect(errorsOf(CreateEmployeeDto, valid)).toEqual([]);
  });

  it('rejects impossible or malformed dates', () => {
    expect(errorsOf(CreateEmployeeDto, { ...valid, hiredOn: '2026-02-30' })).toEqual(['hiredOn']);
    expect(errorsOf(CreateEmployeeDto, { ...valid, hiredOn: '2026-9-1' })).toEqual(['hiredOn']);
    expect(errorsOf(CreateRateDto, { dailyRate: 600, effectiveOn: '2026-13-01' })).toEqual(['effectiveOn']);
  });

  it('rejects money with more than two decimals, zero or negative', () => {
    expect(errorsOf(CreateEmployeeDto, { ...valid, dailyRate: 600.005 })).toEqual(['dailyRate']);
    expect(errorsOf(CreateEmployeeDto, { ...valid, dailyRate: 0 })).toEqual(['dailyRate']);
    expect(errorsOf(CreateRateDto, { dailyRate: -1, effectiveOn: '2026-09-01' })).toEqual(['dailyRate']);
  });

  it('rejects seven rest days, or a weekday outside 0–6', () => {
    expect(errorsOf(CreateEmployeeDto, { ...valid, restDays: [0, 1, 2, 3, 4, 5, 6] })).toEqual(['restDays']);
    expect(errorsOf(CreateEmployeeDto, { ...valid, restDays: [7] })).toEqual(['restDays']);
    expect(errorsOf(CreateEmployeeDto, { ...valid, restDays: [0, 0] })).toEqual(['restDays']);
  });

  it('requires separatedOn to be a date or explicitly null', () => {
    expect(errorsOf(SetSeparationDto, { separatedOn: null })).toEqual([]);
    expect(errorsOf(SetSeparationDto, { separatedOn: '2026-09-30' })).toEqual([]);
    expect(errorsOf(SetSeparationDto, {})).toEqual(['separatedOn']);
  });
});
