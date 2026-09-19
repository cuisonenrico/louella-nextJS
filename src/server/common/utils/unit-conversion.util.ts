import { UnprocessableEntityException } from '@nestjs/common';
import { MeasurementUnit, Prisma } from '@prisma/client';

export function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

type UnitPair = { fromUnit: MeasurementUnit; toUnit: MeasurementUnit };

function pairKey(fromUnit: MeasurementUnit, toUnit: MeasurementUnit): string {
  return `${fromUnit}->${toUnit}`;
}

/**
 * Batch-load conversion factors for every pair, in one query.
 *
 * Same-unit pairs map to 1. A pair with no `UnitConversion` row is **absent**
 * from the result — it used to be filled in with 1, which silently turned a
 * recipe written in grams against a material stocked in kilograms into a
 * thousandfold over-consumption. Read factors with `requireFactor`, which
 * refuses instead of guessing.
 */
export async function getConversionFactorMap(
  // A transaction client works too, so reads can share the caller's snapshot.
  prisma: Pick<Prisma.TransactionClient, 'unitConversion'>,
  pairs: UnitPair[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const deduped = new Map<string, UnitPair>();

  for (const pair of pairs) {
    const key = pairKey(pair.fromUnit, pair.toUnit);
    if (pair.fromUnit === pair.toUnit) {
      map.set(key, 1);
      continue;
    }
    if (!deduped.has(key)) deduped.set(key, pair);
  }

  if (deduped.size > 0) {
    const conversions = await prisma.unitConversion.findMany({
      where: {
        OR: Array.from(deduped.values()).map((p) => ({
          fromUnit: p.fromUnit,
          toUnit: p.toUnit,
        })),
      },
    });
    for (const conv of conversions) {
      map.set(pairKey(conv.fromUnit, conv.toUnit), conv.factor);
    }
  }

  return map;
}

/**
 * The factor converting `fromUnit` into `toUnit`, or a 422 naming the pair.
 *
 * Matches `UnitConversionsService.convert`, which has always refused rather
 * than assume: a stock figure computed with an invented factor is worse than
 * no figure, because nothing downstream can tell it is wrong.
 */
export function requireFactor(
  map: Map<string, number>,
  fromUnit: MeasurementUnit,
  toUnit: MeasurementUnit,
  context?: string,
): number {
  const factor = map.get(pairKey(fromUnit, toUnit));
  if (factor === undefined) {
    throw new UnprocessableEntityException(
      `No unit conversion defined for ${fromUnit}→${toUnit}` +
        (context ? ` (${context})` : '') +
        `. Add it under Unit Conversions first.`,
    );
  }
  return factor;
}
