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
 *   4. catalog name, but only when the name is unique in the catalog AND
 *      the label is not in the bote (bottle-deposit) section
 *
 * A name that maps to several products with no alias to separate them is
 * reported as `ambiguous`, never silently summed into one of them. A
 * bote-section label with no alias is also `ambiguous`, never silently
 * matched to the identically-named beverage in the main catalog.
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

    // A bote-section label with no alias must not fall back to the plain
    // catalog name: the same word in the main catalog is the beverage, not
    // the bottle deposit, and matching it there would silently misattribute
    // a deposit count as a drink sale. Refuse instead of guessing.
    if (sec === 'bote') {
      return {
        kind: 'ambiguous',
        reason:
          `"${label.trim()}" appeared in the bote (bottle-deposit) section ` +
          `but no ProductAlias maps it to a deposit product there. ` +
          `Resolving it by catalog name would wrongly match the beverage ` +
          `of the same name. Add a ProductAlias row for sheetLabel ` +
          `"${name}" with section "bote" pointing at the deposit product.`,
      };
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
