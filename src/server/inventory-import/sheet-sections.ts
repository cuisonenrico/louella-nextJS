/**
 * Which block of a day sheet a row belongs to. The bakery sheets list a
 * beverage and its bottle deposit under the same word — `Litro` at ₱45 is
 * the drink, `Litro` at ₱10 under the `Bote:` header is the empty bottle.
 * Section is the stable discriminator; price is not (drinks get repriced).
 */
export type SheetSection = 'main' | 'bote';

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
