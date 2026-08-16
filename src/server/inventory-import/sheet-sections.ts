/**
 * Which block of a day sheet a row belongs to. The bakery sheets list a
 * beverage and its bottle deposit under the same word — `Litro` at ₱45 is
 * the drink, `Litro` at ₱10 under the `Bote:` header is the empty bottle.
 * Section is the stable discriminator; price is not (drinks get repriced).
 */
export type SheetSection = 'main' | 'bote';

/** Mirrors the Prisma `ProductType` enum without importing the client here. */
export type ProductType = 'BREAD' | 'CAKE' | 'SPECIAL' | 'MISCELLANEOUS';

/** The section in force after reading `label` in column A. */
export function sectionForRow(
  label: string,
  current: SheetSection,
): SheetSection {
  const s = label.trim();
  if (/^bote:$/i.test(s)) return 'bote';
  // A page break or a totals line closes the deposit block.
  if (/^page\s+\d+$/i.test(s) || /^total$/i.test(s)) return 'main';
  return current;
}

/**
 * The page block in force after reading `label` in column A.
 *
 * Day sheets are printed as four pages and the blocks are separated by a
 * literal "PAGE n" row. Page 1 is implicit: it has no header, because "PAGE 1"
 * is the column-A *heading* rather than a row.
 *
 * The printed number is trusted rather than counted, so a sheet that omits a
 * block still assigns the right type to everything after it.
 */
export function pageForRow(label: string, current: number): number {
  const m = /^page\s+(\d+)$/i.exec(label.trim());
  return m ? Number(m[1]) : current;
}

/**
 * Product type for a page block.
 *
 * The bakery's page layout is its product taxonomy: page 1 is the plain bread
 * staples, page 2 the cakes and pastries, page 3 the specialty breads, page 4
 * the drinks and sundries. Verified against the seeded catalog — every product
 * under each block carries exactly this type.
 *
 * Used only to pre-fill the type when creating a product from an unknown sheet
 * label; the operator confirms it before anything is written.
 */
export function typeForPage(page: number): ProductType {
  switch (page) {
    case 1:
      return 'BREAD';
    case 2:
      return 'CAKE';
    case 3:
      return 'SPECIAL';
    default:
      // Page 4 is the drinks block. A fifth block has never appeared; if one
      // does, MISCELLANEOUS keeps it visible rather than burying it in bread.
      return 'MISCELLANEOUS';
  }
}

/**
 * Product type to pre-fill when creating a product from an unknown sheet label.
 *
 * The page gives the taxonomy, but the `Bote:` deposit block overrides it:
 * that block sits at the end of page 3, so page alone would type the bottle
 * deposits (Litro, Kasalo, Cobra, Vitamilk, 8oz) as SPECIAL. They are drink
 * deposits, and the catalog types every one of them MISCELLANEOUS.
 *
 * Verified over the real workbook: page alone agrees with the seeded catalog
 * on 160 of 169 products, and the nine it misses are exactly this block.
 */
export function suggestedTypeFor(
  page: number,
  section: SheetSection,
): ProductType {
  return section === 'bote' ? 'MISCELLANEOUS' : typeForPage(page);
}

/**
 * Fixtures and equipment the bakery counts on the same sheet but which are
 * deliberately absent from the product catalog (see prisma/seed-products.sql:
 * "Equipment excluded entirely"). Without this list every import reports
 * ~160 spurious "Product not found" errors and buries the real ones.
 */
const IGNORED_LABELS = new Set(
  [
    'estante',
    'freezer',
    'ref',
    'trays',
    'board stand',
    'thongs',
    'plancha',
    'wooden estante/cab',
    'ref-type chiller',
    'cake chiller (c2)',
  ].map((s) => s.toLowerCase()),
);

export function isIgnoredLabel(label: string): boolean {
  return IGNORED_LABELS.has(label.trim().toLowerCase());
}
