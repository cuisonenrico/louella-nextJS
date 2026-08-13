// src/server/inventory-import/label-resolver.ts
import { getEffectivePrice } from '../common/utils/price-history.util';
import type { SheetSection } from './sheet-sections';

export interface AliasRow {
  sheetLabel: string; // lowercased, trimmed
  section: string | null; // 'bote' | null
  priceHint: number | null;
  productId: number;
}

/** A catalog product competing for a sheet label. */
export interface ProductCandidate {
  productId: number;
  price: number; // Product.price — the CURRENT price, used only as a fallback
}

/** productId -> price changes, ascending by effectiveAt (as getEffectivePrice expects). */
export type PriceHistoryMap = Map<
  number,
  { price: number; effectiveAt: Date }[]
>;

export type Resolution =
  | { kind: 'matched'; productId: number }
  | { kind: 'ambiguous'; reason: string }
  | { kind: 'unmatched' };

/** Prices are Decimal(10,2); compare at that precision, never as raw floats. */
function samePrice(a: number, b: number): boolean {
  return Math.round(a * 100) === Math.round(b * 100);
}

/**
 * Maps a sheet label to exactly one product, or refuses.
 *
 * Products are identified by (name, price): a label carrying two real SKUs is
 * seeded twice under the SAME name, and the price tells them apart. Price is
 * therefore a discriminator, never an identity — it drifts constantly (6
 * products were repriced between two consecutive fortnights), so it is
 * compared against the price in force ON THE SHEET'S DATE via
 * ProductPriceHistory, not against today's Product.price.
 *
 * Order of preference:
 *   1. an explicit ProductAlias, section-scoped (an override for labels whose
 *      sheet text does not match any product name)
 *   2. the catalog by name — taken directly when the name is unique AND the
 *      row is in the main body, which is what makes drift harmless for the
 *      ~160 uniquely-named products: their price is never consulted
 *   3. otherwise the price arbitrates between same-named candidates
 *
 * The importer refuses rather than guesses. Four refusals enforce that:
 *
 *   - a name held by several products whose as-of-date prices do not single
 *     one out is `ambiguous`, never summed into whichever came first;
 *   - a bote (bottle-deposit) row NEVER takes the unique-name shortcut. The
 *     deposit and the drink share a name, so if the deposit is missing from
 *     the catalog the shortcut would silently book returns as drink sales.
 *     In the bote section the price must match a candidate;
 *   - a label that any alias disambiguates by price is `ambiguous` when no
 *     alias covers the observed price;
 *   - a bote row with no bote-scoped alias and no price match is `ambiguous`.
 */
export class LabelResolver {
  private readonly byKey = new Map<string, number>();
  // Labels that at least one alias disambiguates by price. For these the
  // catalog name alone is never a safe answer.
  private readonly priceDisambiguated = new Set<string>();

  constructor(
    aliases: AliasRow[],
    private readonly catalog: Map<string, ProductCandidate[]>,
    private readonly priceHistory: PriceHistoryMap = new Map(),
  ) {
    for (const a of aliases) {
      // `sheetLabel` is documented as lowercased+trimmed but nothing enforces
      // it — alias rows are hand-written SQL. Normalize on load so a stray
      // 'Bonette' cannot silently never match.
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

  /** The product's price as it stood on `date`, falling back to its current price. */
  private priceOn(candidate: ProductCandidate, date: Date | undefined): number {
    if (!date) return candidate.price;
    return getEffectivePrice(
      candidate.productId,
      date,
      candidate.price,
      this.priceHistory,
    );
  }

  resolve(
    label: string,
    section: SheetSection,
    price: number | null,
    date?: Date,
  ): Resolution {
    const name = label.trim().toLowerCase();
    const sec = section === 'bote' ? 'bote' : null;

    // 1. Explicit alias. A bote row may only be resolved by a bote-scoped
    // alias: `section: null` means "main body", so falling through to the
    // section-null keys here would let a main-section alias book a
    // bottle-deposit count as a drink delivery.
    const aliasKeys =
      sec === 'bote'
        ? [
            LabelResolver.key(name, 'bote', price),
            LabelResolver.key(name, 'bote', null),
          ]
        : [
            LabelResolver.key(name, null, price),
            LabelResolver.key(name, null, null),
          ];
    for (const k of aliasKeys) {
      const hit = this.byKey.get(k);
      if (hit !== undefined) return { kind: 'matched', productId: hit };
    }

    // An alias separates this label by price, but none covers this row's
    // price. The catalog is not a safe fallback — refuse.
    if (this.priceDisambiguated.has(name)) {
      return {
        kind: 'ambiguous',
        reason:
          `"${label.trim()}" is price-disambiguated — one or more ` +
          `ProductAlias rows separate this label by price — but no alias ` +
          `covers the price ${price ?? 'n/a'} observed on this row. Add a ` +
          `ProductAlias row for sheetLabel "${name}" with priceHint ` +
          `${price ?? 'matching this row'} pointing at the correct product.`,
      };
    }

    const candidates = this.catalog.get(name) ?? [];
    if (candidates.length === 0) return { kind: 'unmatched' };

    // 2. A unique name in the main body resolves on the name alone. Price is
    // deliberately not consulted, which is what makes repricing harmless for
    // the products that have no naming collision at all.
    if (candidates.length === 1 && sec !== 'bote') {
      return { kind: 'matched', productId: candidates[0].productId };
    }

    // 3. Price arbitrates. Note this branch is also taken for a SINGLE
    // candidate in the bote section: the deposit and the drink share a name,
    // so a lone candidate there may well be the drink, and matching it would
    // be the exact misattribution the bote rule exists to stop.
    if (price === null) {
      return {
        kind: 'ambiguous',
        reason:
          `"${label.trim()}" needs its price to identify which product it is` +
          `${sec === 'bote' ? ' (bote section)' : ''}, but the row carries ` +
          `no price. Candidate product ids: ` +
          `${candidates.map((c) => c.productId).join(', ')}.`,
      };
    }

    const hits = candidates.filter((c) =>
      samePrice(this.priceOn(c, date), price),
    );
    if (hits.length === 1) return { kind: 'matched', productId: hits[0].productId };

    const asOf = date ? ` as of ${date.toISOString().slice(0, 10)}` : '';
    const seen = candidates
      .map((c) => `#${c.productId}@${this.priceOn(c, date)}`)
      .join(', ');
    if (hits.length === 0) {
      return {
        kind: 'ambiguous',
        reason:
          `"${label.trim()}" at price ${price}${asOf} matches none of the ` +
          `${candidates.length} product(s) sharing that name (${seen})` +
          `${sec === 'bote' ? '. A bote row never resolves on name alone — the deposit and the drink share a name' : ''}. ` +
          `Seed the missing price into ProductPriceHistory, or add the ` +
          `missing product, before importing this sheet.`,
      };
    }
    return {
      kind: 'ambiguous',
      reason:
        `"${label.trim()}" at price ${price}${asOf} matches ${hits.length} ` +
        `products at the same price (${hits.map((h) => `#${h.productId}`).join(', ')}). ` +
        `Price cannot separate them — add a ProductAlias to disambiguate.`,
    };
  }
}
