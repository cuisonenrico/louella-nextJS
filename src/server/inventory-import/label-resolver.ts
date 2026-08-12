// src/server/inventory-import/label-resolver.ts
import type { SheetSection } from './sheet-sections';

export interface AliasRow {
  sheetLabel: string; // lowercased, trimmed
  section: string | null; // 'bote' | null
  priceHint: number | null;
  productId: number;
}

export type Resolution =
  | { kind: 'matched'; productId: number }
  | { kind: 'ambiguous'; reason: string }
  | { kind: 'unmatched' };

/**
 * Maps a sheet label to exactly one product, or refuses.
 *
 * Order of preference, most specific first:
 *   1. alias on (label, section, price)
 *   2. alias on (label, section)
 *   3. alias on (label)
 *   4. catalog name, but only when the name is unique in the catalog
 *
 * A name that maps to several products with no alias to separate them is
 * reported as `ambiguous`, never silently summed into one of them.
 */
export class LabelResolver {
  private readonly byKey = new Map<string, number>();

  constructor(
    aliases: AliasRow[],
    private readonly catalog: Map<string, number[]>,
  ) {
    for (const a of aliases) {
      this.byKey.set(
        LabelResolver.key(a.sheetLabel, a.section, a.priceHint),
        a.productId,
      );
    }
  }

  private static key(
    label: string,
    section: string | null,
    price: number | null,
  ): string {
    return `${label}|${section ?? ''}|${price ?? ''}`;
  }

  resolve(
    label: string,
    section: SheetSection,
    price: number | null,
  ): Resolution {
    const name = label.trim().toLowerCase();
    const sec = section === 'bote' ? 'bote' : null;

    const candidates = [
      LabelResolver.key(name, sec, price),
      LabelResolver.key(name, sec, null),
      LabelResolver.key(name, null, price),
      LabelResolver.key(name, null, null),
    ];
    for (const k of candidates) {
      const hit = this.byKey.get(k);
      if (hit !== undefined) return { kind: 'matched', productId: hit };
    }

    const products = this.catalog.get(name) ?? [];
    if (products.length === 1) return { kind: 'matched', productId: products[0] };
    if (products.length > 1) {
      return {
        kind: 'ambiguous',
        reason:
          `"${label.trim()}" matches ${products.length} products ` +
          `(ids ${products.join(', ')}) and no alias resolves it at ` +
          `price ${price ?? 'n/a'} in section ${section}`,
      };
    }
    return { kind: 'unmatched' };
  }
}
