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
});
