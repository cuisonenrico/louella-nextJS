import { registerDecorator, type ValidationOptions } from 'class-validator';
import { isCalendarDate, isPeriodStart } from '@/lib/payroll/cutoff';

/** The largest amount a Decimal(12,2) column holds. */
export const MAX_MONEY = 9_999_999_999.99;

/** A real calendar day in `YYYY-MM-DD` form. Rejects 2026-02-30 and 2026-9-1. */
export function IsCalendarDate(options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'isCalendarDate',
      target: object.constructor,
      propertyName,
      options: { message: `${propertyName} must be a real date in YYYY-MM-DD form`, ...options },
      validator: { validate: (value: unknown) => typeof value === 'string' && isCalendarDate(value) },
    });
}

/** The 1st or 16th of a month, as `YYYY-MM-DD`. */
export function IsPeriodStart(options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'isPeriodStart',
      target: object.constructor,
      propertyName,
      options: { message: `${propertyName} must be the 1st or 16th of a month, as YYYY-MM-DD`, ...options },
      validator: { validate: (value: unknown) => typeof value === 'string' && isPeriodStart(value) },
    });
}
