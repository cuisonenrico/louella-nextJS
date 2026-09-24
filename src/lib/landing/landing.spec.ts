import { describe, expect, it } from 'vitest';
import { buildDefaultContent } from './defaults';
import { resolveWithCatalog } from './resolve';
import { formatPrice, landingContentSchema, mapsHref } from './schema';

const products = new Map([[1, { id: 1, name: 'Pandesal', price: 4.5 }]]);
const branches = new Map([[7, { id: 7, name: 'Main', address: '12 Rizal St', phone: null }]]);

describe('landing content', () => {
  it('ships defaults that pass its own schema', () => {
    expect(landingContentSchema.safeParse(buildDefaultContent([1, 2, 3], [7])).success).toBe(true);
    expect(landingContentSchema.safeParse(buildDefaultContent()).success).toBe(true);
  });

  it('refuses script links anywhere a link is rendered', () => {
    const content = buildDefaultContent();
    content.brand.navLinks[0].href = 'javascript:alert(1)';
    expect(landingContentSchema.safeParse(content).success).toBe(false);

    const ok = buildDefaultContent();
    for (const href of ['#breads', '/login', 'https://maps.google.com', 'tel:+639171234567', 'mailto:a@b.co', '']) {
      ok.brand.navLinks[0].href = href;
      expect(landingContentSchema.safeParse(ok).success).toBe(true);
    }
    ok.brand.navLinks[0].href = '//evil.example';
    expect(landingContentSchema.safeParse(ok).success).toBe(false);
  });

  it('merges live names, prices and addresses and drops what it cannot fill', () => {
    const content = buildDefaultContent([1, 99], [7]);
    const resolved = resolveWithCatalog(content, products, branches);

    const breads = resolved.sections.find((s) => s.type === 'products');
    expect(breads?.type === 'products' && breads.items.map((i) => [i.name, i.price])).toEqual([['Pandesal', 4.5]]);

    const shops = resolved.sections.find((s) => s.type === 'branches');
    expect(shops?.type === 'branches' && shops.items[0].address).toBe('12 Rizal St');
  });

  it('skips hidden sections and list sections left empty', () => {
    const content = buildDefaultContent([99], []);
    content.sections.find((s) => s.type === 'cta')!.visible = false;
    const types = resolveWithCatalog(content, products, branches).sections.map((s) => s.type);
    expect(types).toEqual(['hero', 'about', 'footer']);
  });

  it('formats prices with the unit an admin typed', () => {
    expect(formatPrice(45, 'bag of 10')).toBe('₱45.00 / bag of 10');
    expect(formatPrice(1250.5, '  ')).toBe('₱1,250.50 / pc');
  });

  it('prefers an explicit map link, else searches the address', () => {
    expect(mapsHref({ mapsUrl: 'https://maps.app.goo.gl/x', address: 'A', name: 'B' })).toBe('https://maps.app.goo.gl/x');
    expect(mapsHref({ mapsUrl: '', address: '12 Rizal St', name: 'Main' })).toContain(encodeURIComponent('Main, 12 Rizal St'));
  });
});
