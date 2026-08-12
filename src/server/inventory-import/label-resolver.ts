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
 *   3. catalog name, but only when the name is unique in the catalog AND
 *      the label is neither in the bote (bottle-deposit) section nor
 *      price-disambiguated by an alias
 *
 * The importer refuses rather than guesses. Three refusals enforce that:
 *
 *   - a name mapping to several catalog products with no alias to separate
 *     them is `ambiguous`, never silently summed into one of them;
 *   - a bote-section label with no bote-scoped alias is `ambiguous`, never
 *     matched to the identically-named beverage in the main catalog;
 *   - a label that ANY alias disambiguates by price is `ambiguous` whenever
 *     none of those price hints covers the observed price. Real catalogs
 *     have no duplicate names — the second SKU is seeded under a new name
 *     ("Bonette Small") — so without this rule an unseen price would fall
 *     through to the unique catalog name and silently merge two SKUs.
 */
export class LabelResolver {
  private readonly byKey = new Map<string, number>();
  // Labels that at least one alias disambiguates by price. For these the
  // catalog name is never a safe fallback: the name is shared by SKUs that
  // only the price tells apart.
  private readonly priceDisambiguated = new Set<string>();

  constructor(
    aliases: AliasRow[],
    private readonly catalog: Map<string, number[]>,
  ) {
    for (const a of aliases) {
      // `sheetLabel` is documented as lowercased+trimmed but nothing enforces
      // it — the alias rows are hand-written SQL. Normalize on load so a
      // stray 'Bonette' cannot silently never match.
      const label = a.sheetLabel.trim().toLowerCase();
      this.byKey.set(
        LabelResolver.key(label, a.section, a.priceHint),
        a.productId,
      );
      if (a.priceHint !== null) this.priceDisambiguated.add(label);
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

    // A bote row may only be resolved by a bote-scoped alias. `section: null`
    // means "main body", so falling through to the section-null candidates
    // here would let a main-section alias book a bottle-deposit count as a
    // drink delivery — the very thing the bote refusal below exists to stop.
    const candidates =
      sec === 'bote'
        ? [
            LabelResolver.key(name, 'bote', price),
            LabelResolver.key(name, 'bote', null),
          ]
        : [
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

    // Same rule as the bote refusal, applied to the price axis: if this label
    // is only ever separated by price and no alias covers the price on this
    // row, the catalog name is a coin flip between two real SKUs. Refuse.
    if (this.priceDisambiguated.has(name)) {
      return {
        kind: 'ambiguous',
        reason:
          `"${label.trim()}" is price-disambiguated — one or more ` +
          `ProductAlias rows separate this label by price — but no alias ` +
          `covers the price ${price ?? 'n/a'} observed on this row. ` +
          `Resolving it by catalog name would silently merge two distinct ` +
          `SKUs. Add a ProductAlias row for sheetLabel "${name}" with ` +
          `priceHint ${price ?? 'matching this row'} pointing at the ` +
          `correct product.`,
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
