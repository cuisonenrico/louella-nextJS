import { MeasurementUnit } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function getConversionFactorMap(
  prisma: PrismaService,
  pairs: Array<{ fromUnit: MeasurementUnit; toUnit: MeasurementUnit }>,
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const deduped = new Map<
    string,
    { fromUnit: MeasurementUnit; toUnit: MeasurementUnit }
  >();

  for (const pair of pairs) {
    const key = `${pair.fromUnit}->${pair.toUnit}`;
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
      map.set(`${conv.fromUnit}->${conv.toUnit}`, conv.factor);
    }
  }

  for (const key of deduped.keys()) {
    if (!map.has(key)) map.set(key, 1);
  }

  return map;
}
