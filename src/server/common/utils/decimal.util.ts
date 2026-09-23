import { Prisma } from '@prisma/client';

/**
 * Exact quantities and money.
 *
 * Material quantities, recipe quantities and yields, and conversion factors
 * are `numeric` columns (4 dp; factors 9 dp). Prices are `numeric` too. They
 * used to be `double precision` (or, for money, doubles in JS), so every
 * `used += delta` left binary residue behind and revenue totals depended on
 * the order they were summed in.
 *
 * The rules:
 *   - read a numeric column through `num()` before doing arithmetic;
 *   - round a quantity to its column's scale with `q4()` before writing it,
 *     so nothing beyond the 4th decimal ever reaches the database;
 *   - add money up in integer centavos (`centavos`, `pesos`), which a count of
 *     whole pieces × a 2-dp price always is — the total is then exact and
 *     independent of summation order.
 */

export type Numeric = Prisma.Decimal | number | string | null | undefined;

/** A numeric column (Decimal), or a plain number, as a JS number. */
export function num(value: Numeric): number {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  return Number(value.toString());
}

/** Round to 4 dp — the scale of every stored material/recipe quantity. */
export function q4(value: number): number {
  return Number(new Prisma.Decimal(value).toDecimalPlaces(4).toString());
}

/** A peso amount as whole centavos. */
export function centavos(pesos: Numeric): number {
  return new Prisma.Decimal(num(pesos)).mul(100).toDecimalPlaces(0).toNumber();
}

/** Whole centavos back to pesos, for the response. */
export function pesos(cents: number): number {
  return new Prisma.Decimal(cents).div(100).toNumber();
}

/**
 * The cost of a (fractional) quantity at a (4-dp) unit price, in centavos:
 * computed exactly, rounded once, half up.
 */
export function costCentavos(quantity: Numeric, unitPrice: Numeric): number {
  return new Prisma.Decimal(num(quantity))
    .mul(num(unitPrice))
    .mul(100)
    .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
    .toNumber();
}

/** The inverse of a conversion factor, at the column's 9 dp. */
export function inverseFactor(factor: Numeric): number {
  return new Prisma.Decimal(1).div(num(factor)).toDecimalPlaces(9).toNumber();
}
