/**
 * Merges live catalog fields into landing content. Pure, so the server (for
 * the public page) and the editor (for its live preview) resolve identically.
 *
 * Items whose product or branch is missing from the catalog maps — deleted or
 * inactive — are dropped, as are hidden sections and list sections left with
 * no items: the page never shows a card it cannot fill.
 */
import type { LandingContent, ResolvedLanding, ResolvedSection } from './schema';

export type CatalogProduct = { id: number; name: string; price: number };
export type CatalogBranch = { id: number; name: string; address: string | null; phone: string | null };

export function resolveWithCatalog(
  content: LandingContent,
  productById: ReadonlyMap<number, CatalogProduct>,
  branchById: ReadonlyMap<number, CatalogBranch>,
): ResolvedLanding {
  const sections: ResolvedSection[] = [];
  for (const s of content.sections) {
    if (!s.visible) continue;
    if (s.type === 'products') {
      const items = s.items.flatMap((i) => {
        const p = productById.get(i.productId);
        return p ? [{ ...i, name: p.name, price: p.price }] : [];
      });
      if (items.length) sections.push({ ...s, items });
    } else if (s.type === 'branches') {
      const items = s.items.flatMap((i) => {
        const b = branchById.get(i.branchId);
        return b ? [{ ...i, name: b.name, address: b.address, phone: b.phone }] : [];
      });
      if (items.length) sections.push({ ...s, items });
    } else {
      sections.push(s);
    }
  }
  return { ...content, sections };
}
