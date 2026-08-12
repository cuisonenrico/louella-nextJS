// src/server/inventory-import/label-resolver.spec.ts
import { LabelResolver, type AliasRow } from './label-resolver';

const catalog = new Map<string, number[]>([
  ['pandesal', [8]],
  ['litro', [147]],
  ['litro (bote)', [128]],
  ['bonette', [119, 120]], // two products share this name
]);

const aliases: AliasRow[] = [
  { sheetLabel: 'litro', section: 'bote', priceHint: null, productId: 128 },
  { sheetLabel: 'bonette', section: null, priceHint: 30, productId: 119 },
  { sheetLabel: 'bonette', section: null, priceHint: 8, productId: 120 },
];

describe('LabelResolver', () => {
  it('resolves an unambiguous catalog name', () => {
    const r = new LabelResolver(aliases, catalog);
    expect(r.resolve('Pandesal', 'main', 3)).toEqual({ kind: 'matched', productId: 8 });
  });

  it('routes a bote-section label to the deposit product', () => {
    const r = new LabelResolver(aliases, catalog);
    expect(r.resolve('Litro', 'bote', 10)).toEqual({ kind: 'matched', productId: 128 });
  });

  it('routes the same label in the main section to the beverage', () => {
    const r = new LabelResolver(aliases, catalog);
    expect(r.resolve('Litro', 'main', 45)).toEqual({ kind: 'matched', productId: 147 });
  });

  it('uses the price hint when a name maps to two products', () => {
    const r = new LabelResolver(aliases, catalog);
    expect(r.resolve('Bonette', 'main', 8)).toEqual({ kind: 'matched', productId: 120 });
  });

  it('reports ambiguity rather than guessing when the price hint misses', () => {
    const r = new LabelResolver(aliases, catalog);
    const res = r.resolve('Bonette', 'main', 99);
    expect(res.kind).toBe('ambiguous');
    expect((res as { reason: string }).reason).toMatch(/Bonette/);
  });

  it('reports unmatched for a name absent from catalog and aliases', () => {
    const r = new LabelResolver(aliases, catalog);
    expect(r.resolve('Peanut Butter XL', 'main', 90)).toEqual({ kind: 'unmatched' });
  });

  // --- Additional tests beyond the brief: precedence, normalization, ambiguity-under-missing-price ---

  it('prefers a more specific alias (label+section+price) over a more general one (label+section)', () => {
    const precedenceAliases: AliasRow[] = [
      { sheetLabel: 'litro', section: 'bote', priceHint: 10, productId: 128 },
      { sheetLabel: 'litro', section: 'bote', priceHint: null, productId: 999 },
    ];
    const r = new LabelResolver(precedenceAliases, catalog);
    expect(r.resolve('Litro', 'bote', 10)).toEqual({ kind: 'matched', productId: 128 });
  });

  it('normalizes label whitespace and casing before matching', () => {
    const r = new LabelResolver(aliases, catalog);
    expect(r.resolve('  LiTrO  ', 'bote', 10)).toEqual(r.resolve('Litro', 'bote', 10));
  });

  it('reports ambiguous, not a guess, when the price hint is absent and aliases exist for other prices', () => {
    const r = new LabelResolver(aliases, catalog);
    const res = r.resolve('Bonette', 'main', null);
    expect(res.kind).toBe('ambiguous');
  });

  // --- Fix round 1: bote-section catalog fallback must refuse, not guess the beverage ---

  it('refuses to fall back to the plain catalog name in the bote section when no alias covers it', () => {
    const noBoteAlias: AliasRow[] = [
      { sheetLabel: 'bonette', section: null, priceHint: 30, productId: 119 },
      { sheetLabel: 'bonette', section: null, priceHint: 8, productId: 120 },
    ];
    const r = new LabelResolver(noBoteAlias, catalog);
    const res = r.resolve('Litro', 'bote', 10);
    expect(res.kind).toBe('ambiguous');
    expect(res).not.toEqual({ kind: 'matched', productId: 147 });
    expect((res as { reason: string }).reason).toMatch(/Litro/i);
    expect((res as { reason: string }).reason).toMatch(/bote/i);
  });

  it('still resolves via a proper bote alias despite the new bote-section refusal', () => {
    const r = new LabelResolver(aliases, catalog);
    expect(r.resolve('Litro', 'bote', 10)).toEqual({ kind: 'matched', productId: 128 });
  });

  it('still resolves the main-section catalog fallback despite the new bote-section refusal', () => {
    const r = new LabelResolver(aliases, catalog);
    expect(r.resolve('Pandesal', 'main', 3)).toEqual({ kind: 'matched', productId: 8 });
  });

  // --- C2: a price-hint miss must refuse, not fall through to the catalog ---
  //
  // The fixture above gives 'bonette' TWO catalog ids, which real data never
  // does: prisma/seed-products.sql has zero duplicate names, and the planned
  // alias seed creates second SKUs under NEW names ('Bonette Small'). So the
  // catalog below models reality — one id per name — and the only thing that
  // can separate the two real SKUs is the price hint.

  describe('a label disambiguated by price hints', () => {
    const realShapedCatalog = new Map<string, number[]>([
      ['pandesal', [8]],
      ['bonette', [119]], // exactly one product per name, as in real seed data
      ['bonette small', [121]],
    ]);
    const priceHintedAliases: AliasRow[] = [
      { sheetLabel: 'bonette', section: null, priceHint: 30, productId: 119 },
      { sheetLabel: 'bonette', section: null, priceHint: 8, productId: 121 },
    ];

    it('refuses when no alias covers the observed price, instead of falling back to the unique catalog name', () => {
      const r = new LabelResolver(priceHintedAliases, realShapedCatalog);
      // Jan1-13-2026.xlsx carries "Bonette " at 5.00 — neither hint matches.
      const res = r.resolve('Bonette ', 'main', 5);
      expect(res.kind).toBe('ambiguous');
      expect(res).not.toEqual({ kind: 'matched', productId: 119 });
      const reason = (res as { reason: string }).reason;
      expect(reason).toMatch(/Bonette/);
      expect(reason).toMatch(/\b5\b/);
      expect(reason).toMatch(/price/i);
      expect(reason).toMatch(/alias/i);
    });

    it('refuses when the row carries no price at all', () => {
      const r = new LabelResolver(priceHintedAliases, realShapedCatalog);
      expect(r.resolve('Bonette', 'main', null).kind).toBe('ambiguous');
    });

    it('still resolves when a price hint does match', () => {
      const r = new LabelResolver(priceHintedAliases, realShapedCatalog);
      expect(r.resolve('Bonette', 'main', 8)).toEqual({
        kind: 'matched',
        productId: 121,
      });
    });

    it('does not disable the ordinary catalog fallback for labels with no price-hinted alias', () => {
      const r = new LabelResolver(priceHintedAliases, realShapedCatalog);
      expect(r.resolve('Pandesal', 'main', 3)).toEqual({
        kind: 'matched',
        productId: 8,
      });
      expect(r.resolve('Pandesal', 'main', 999)).toEqual({
        kind: 'matched',
        productId: 8,
      });
    });
  });

  // --- I3: section-null aliases must not leak into the bote section ---

  describe('bote-section isolation', () => {
    const drinkCatalog = new Map<string, number[]>([['vitamilk', [200]]]);

    it('does not let a section-null alias resolve a bote row', () => {
      // section null means "main body" per the schema; a main-section alias
      // must never book a bottle-deposit count as a drink delivery.
      const mainAlias: AliasRow[] = [
        { sheetLabel: 'vitamilk', section: null, priceHint: null, productId: 200 },
      ];
      const r = new LabelResolver(mainAlias, drinkCatalog);
      const res = r.resolve('Vitamilk', 'bote', 10);
      expect(res.kind).toBe('ambiguous');
      expect(res).not.toEqual({ kind: 'matched', productId: 200 });
      expect((res as { reason: string }).reason).toMatch(/bote/i);
    });

    it('does not let a section-null price-hinted alias resolve a bote row either', () => {
      const mainAlias: AliasRow[] = [
        { sheetLabel: 'vitamilk', section: null, priceHint: 10, productId: 200 },
      ];
      const r = new LabelResolver(mainAlias, drinkCatalog);
      const res = r.resolve('Vitamilk', 'bote', 10);
      expect(res.kind).toBe('ambiguous');
      expect(res).not.toEqual({ kind: 'matched', productId: 200 });
    });

    it('still resolves a bote row through a bote-scoped alias', () => {
      const boteAlias: AliasRow[] = [
        { sheetLabel: 'vitamilk', section: 'bote', priceHint: null, productId: 201 },
        { sheetLabel: 'vitamilk', section: null, priceHint: null, productId: 200 },
      ];
      const r = new LabelResolver(boteAlias, drinkCatalog);
      expect(r.resolve('Vitamilk', 'bote', 10)).toEqual({
        kind: 'matched',
        productId: 201,
      });
      expect(r.resolve('Vitamilk', 'main', 45)).toEqual({
        kind: 'matched',
        productId: 200,
      });
    });
  });

  // --- I4: alias labels must be normalized when the map is built ---

  describe('alias label normalization on load', () => {
    it('matches an alias whose stored sheetLabel is mis-cased', () => {
      // The alias seed is hand-written SQL; a single 'LITRO' must still work.
      const r = new LabelResolver(
        [{ sheetLabel: 'LITRO', section: 'bote', priceHint: null, productId: 128 }],
        new Map<string, number[]>([['litro', [147]]]),
      );
      expect(r.resolve('Litro', 'bote', 10)).toEqual({
        kind: 'matched',
        productId: 128,
      });
    });

    it('matches an alias whose stored sheetLabel has surrounding whitespace', () => {
      const r = new LabelResolver(
        [{ sheetLabel: ' Bonette ', section: null, priceHint: 8, productId: 121 }],
        new Map<string, number[]>([['bonette', [119]]]),
      );
      expect(r.resolve('Bonette', 'main', 8)).toEqual({
        kind: 'matched',
        productId: 121,
      });
    });
  });
});
