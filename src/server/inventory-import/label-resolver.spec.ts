// src/server/inventory-import/label-resolver.spec.ts
import {
  LabelResolver,
  type AliasRow,
  type PriceHistoryMap,
  type ProductCandidate,
} from './label-resolver';

/** Terse catalog-entry builder: p(id, price). */
const p = (productId: number, price: number): ProductCandidate => ({
  productId,
  price,
});

const catalog = new Map<string, ProductCandidate[]>([
  ['pandesal', [p(8, 3)]],
  ['litro', [p(147, 45)]],
  ['litro (bote)', [p(128, 10)]],
  ['bonette', [p(119, 30), p(120, 8)]], // two products share this name
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
    expect(r.resolve('Bonette', 'main', null).kind).toBe('ambiguous');
  });

  // --- bote-section catalog fallback must refuse, not guess the beverage ---

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
  });

  it('still resolves via a proper bote alias despite the bote-section refusal', () => {
    const r = new LabelResolver(aliases, catalog);
    expect(r.resolve('Litro', 'bote', 10)).toEqual({ kind: 'matched', productId: 128 });
  });

  it('still resolves the main-section catalog fallback despite the bote-section refusal', () => {
    const r = new LabelResolver(aliases, catalog);
    expect(r.resolve('Pandesal', 'main', 3)).toEqual({ kind: 'matched', productId: 8 });
  });

  // --- a price-hint miss must refuse, not fall through to the catalog ---

  describe('a label disambiguated by price hints', () => {
    const realShapedCatalog = new Map<string, ProductCandidate[]>([
      ['pandesal', [p(8, 3)]],
      ['bonette', [p(119, 30)]],
      ['bonette small', [p(121, 8)]],
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
      expect(r.resolve('Bonette', 'main', 8)).toEqual({ kind: 'matched', productId: 121 });
    });

    it('does not disable the ordinary catalog fallback for labels with no price-hinted alias', () => {
      const r = new LabelResolver(priceHintedAliases, realShapedCatalog);
      expect(r.resolve('Pandesal', 'main', 3)).toEqual({ kind: 'matched', productId: 8 });
      expect(r.resolve('Pandesal', 'main', 999)).toEqual({ kind: 'matched', productId: 8 });
    });
  });

  // --- section-null aliases must not leak into the bote section ---

  describe('bote-section isolation', () => {
    const drinkCatalog = new Map<string, ProductCandidate[]>([
      ['vitamilk', [p(200, 25)]],
    ]);

    it('does not let a section-null alias resolve a bote row', () => {
      const mainAlias: AliasRow[] = [
        { sheetLabel: 'vitamilk', section: null, priceHint: null, productId: 200 },
      ];
      const r = new LabelResolver(mainAlias, drinkCatalog);
      const res = r.resolve('Vitamilk', 'bote', 10);
      expect(res.kind).toBe('ambiguous');
      expect(res).not.toEqual({ kind: 'matched', productId: 200 });
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
      expect(r.resolve('Vitamilk', 'bote', 10)).toEqual({ kind: 'matched', productId: 201 });
      expect(r.resolve('Vitamilk', 'main', 45)).toEqual({ kind: 'matched', productId: 200 });
    });
  });

  // --- alias labels must be normalized when the map is built ---

  describe('alias label normalization on load', () => {
    it('matches an alias whose stored sheetLabel is mis-cased', () => {
      const r = new LabelResolver(
        [{ sheetLabel: 'LITRO', section: 'bote', priceHint: null, productId: 128 }],
        new Map<string, ProductCandidate[]>([['litro', [p(147, 45)]]]),
      );
      expect(r.resolve('Litro', 'bote', 10)).toEqual({ kind: 'matched', productId: 128 });
    });

    it('matches an alias whose stored sheetLabel has surrounding whitespace', () => {
      const r = new LabelResolver(
        [{ sheetLabel: ' Bonette ', section: null, priceHint: 8, productId: 121 }],
        new Map<string, ProductCandidate[]>([['bonette', [p(119, 30)]]]),
      );
      expect(r.resolve('Bonette', 'main', 8)).toEqual({ kind: 'matched', productId: 121 });
    });
  });

  // -------------------------------------------------------------------------
  // name + price identity, with price read as of the sheet's date
  //
  // The catalog seeds a label's two real SKUs under the SAME name; the price
  // separates them. Because prices drift, the comparison uses the price in
  // force on the sheet's date, not today's Product.price.
  // -------------------------------------------------------------------------

  describe('name + price resolution with no aliases at all', () => {
    // Mirrors prisma/seed-products-apr2026.sql: Bonette 30/8, Litro 10 (bote
    // deposit) and 45 (the drink), both plainly named.
    const seedCatalog = new Map<string, ProductCandidate[]>([
      ['pandesal', [p(8, 3)]],
      ['bonette', [p(120, 30), p(124, 8)]],
      ['litro', [p(130, 10), p(149, 45)]],
      ['otap', [p(140, 12)]],
    ]);

    it('separates two same-named products by price', () => {
      const r = new LabelResolver([], seedCatalog);
      expect(r.resolve('Bonette', 'main', 30)).toEqual({ kind: 'matched', productId: 120 });
      expect(r.resolve('Bonette', 'main', 8)).toEqual({ kind: 'matched', productId: 124 });
    });

    it('picks the deposit, not the drink, for a bote row', () => {
      const r = new LabelResolver([], seedCatalog);
      expect(r.resolve('Litro', 'bote', 10)).toEqual({ kind: 'matched', productId: 130 });
      expect(r.resolve('Litro', 'main', 45)).toEqual({ kind: 'matched', productId: 149 });
    });

    it('ignores price entirely for a uniquely-named product, so repricing cannot break it', () => {
      const r = new LabelResolver([], seedCatalog);
      // Otap was repriced 12 -> 35 between fortnights. Both must still resolve.
      expect(r.resolve('Otap', 'main', 12)).toEqual({ kind: 'matched', productId: 140 });
      expect(r.resolve('Otap', 'main', 35)).toEqual({ kind: 'matched', productId: 140 });
      expect(r.resolve('Otap', 'main', null)).toEqual({ kind: 'matched', productId: 140 });
    });

    it('refuses a bote row whose price matches no candidate, even when the name is unique', () => {
      // Only the DRINK is seeded; the deposit is missing. Taking the
      // unique-name shortcut here would book bottle returns as drink sales.
      const drinkOnly = new Map<string, ProductCandidate[]>([
        ['litro', [p(149, 45)]],
      ]);
      const r = new LabelResolver([], drinkOnly);
      const res = r.resolve('Litro', 'bote', 10);
      expect(res.kind).toBe('ambiguous');
      expect(res).not.toEqual({ kind: 'matched', productId: 149 });
      expect((res as { reason: string }).reason).toMatch(/bote/i);
    });

    it('refuses when a multi-candidate row carries no price', () => {
      const r = new LabelResolver([], seedCatalog);
      const res = r.resolve('Bonette', 'main', null);
      expect(res.kind).toBe('ambiguous');
      expect((res as { reason: string }).reason).toMatch(/no price/i);
    });

    it('refuses when the observed price matches no candidate', () => {
      const r = new LabelResolver([], seedCatalog);
      // Jan1-13-2026.xlsx has Bonette at 5.00 with no history seeded for it.
      const res = r.resolve('Bonette', 'main', 5);
      expect(res.kind).toBe('ambiguous');
      expect((res as { reason: string }).reason).toMatch(/matches none/i);
    });

    it('refuses when two same-named candidates share the observed price', () => {
      const collided = new Map<string, ProductCandidate[]>([
        ['mystery', [p(1, 10), p(2, 10)]],
      ]);
      const r = new LabelResolver([], collided);
      const res = r.resolve('Mystery', 'main', 10);
      expect(res.kind).toBe('ambiguous');
      expect((res as { reason: string }).reason).toMatch(/cannot separate/i);
    });
  });

  describe('price read as of the sheet date', () => {
    // Bonette Small went 5 -> 8; Bonette Big held at 30. Today's
    // Product.price is the LATEST value, so a January sheet can only resolve
    // if history is consulted.
    const seedCatalog = new Map<string, ProductCandidate[]>([
      ['bonette', [p(120, 30), p(124, 8)]],
    ]);
    const history: PriceHistoryMap = new Map([
      [
        124,
        [
          { price: 5, effectiveAt: new Date('2026-01-01T00:00:00Z') },
          { price: 8, effectiveAt: new Date('2026-04-14T00:00:00Z') },
        ],
      ],
      [120, [{ price: 30, effectiveAt: new Date('2026-01-01T00:00:00Z') }]],
    ]);

    it('resolves a January row at the January price', () => {
      const r = new LabelResolver([], seedCatalog, history);
      expect(
        r.resolve('Bonette', 'main', 5, new Date('2026-01-05T00:00:00Z')),
      ).toEqual({ kind: 'matched', productId: 124 });
    });

    it('resolves an April row at the April price', () => {
      const r = new LabelResolver([], seedCatalog, history);
      expect(
        r.resolve('Bonette', 'main', 8, new Date('2026-04-20T00:00:00Z')),
      ).toEqual({ kind: 'matched', productId: 124 });
    });

    it('does not let the April price resolve a January row', () => {
      const r = new LabelResolver([], seedCatalog, history);
      const res = r.resolve('Bonette', 'main', 8, new Date('2026-01-05T00:00:00Z'));
      expect(res.kind).toBe('ambiguous');
    });

    it('falls back to Product.price when no date is supplied', () => {
      const r = new LabelResolver([], seedCatalog, history);
      expect(r.resolve('Bonette', 'main', 8)).toEqual({ kind: 'matched', productId: 124 });
    });

    it('falls back to Product.price for a product with no history rows', () => {
      const r = new LabelResolver([], seedCatalog, new Map());
      expect(
        r.resolve('Bonette', 'main', 30, new Date('2026-01-05T00:00:00Z')),
      ).toEqual({ kind: 'matched', productId: 120 });
    });

    it('names the as-of date in the refusal so an operator can seed the missing price', () => {
      const r = new LabelResolver([], seedCatalog, history);
      const res = r.resolve('Bonette', 'main', 99, new Date('2026-01-05T00:00:00Z'));
      expect((res as { reason: string }).reason).toMatch(/2026-01-05/);
      expect((res as { reason: string }).reason).toMatch(/ProductPriceHistory/);
    });
  });
});
