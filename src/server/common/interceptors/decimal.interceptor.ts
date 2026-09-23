import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Observable, map } from 'rxjs';

/**
 * Every Prisma Decimal in a response becomes a plain JSON number.
 *
 * Prices and material quantities are `numeric` columns. Left alone, a Decimal
 * serialises as a string, so the same field used to arrive as "12.5" from one
 * endpoint and 12.5 from another, depending on whether the service happened
 * to convert it (F19). The columns hold at most 14 significant digits, well
 * inside a double's exact range, so the number is the stored value.
 *
 * Registered after the idempotency interceptor, so it runs inside it and a
 * replayed response carries numbers too.
 */
@Injectable()
export class DecimalInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map(plainDecimals));
  }
}

export function plainDecimals(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Prisma.Decimal.isDecimal(value)) return (value as Prisma.Decimal).toNumber();
  if (Array.isArray(value)) {
    let changed = false;
    const out = value.map((v) => {
      const p = plainDecimals(v);
      if (p !== v) changed = true;
      return p;
    });
    return changed ? out : value;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value; // Date, Buffer, streams…
  let out: Record<string, unknown> | undefined;
  for (const [k, v] of Object.entries(value)) {
    const p = plainDecimals(v);
    if (p !== v) (out ??= { ...(value as Record<string, unknown>) })[k] = p;
  }
  return out ?? value;
}
