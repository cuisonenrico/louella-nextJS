/**
 * The landing page's content, as one validated document.
 *
 * Shared by the Nest API (validates every draft save), the admin editor (form
 * shape) and the public page (renders only what parses). An admin edits a
 * `draft`; publishing copies it to `published`. Product names/prices and
 * branch addresses are NOT stored here — items hold ids and the server merges
 * the live catalog in, so a price change never has to be made twice.
 */
import { z } from 'zod';

const MAX_TEXT = 200;
const MAX_BODY = 1200;

const text = (max = MAX_TEXT) => z.string().trim().max(max);

/**
 * Relative links, anchors, http(s), mailto and tel only. Blocks `javascript:`
 * and friends: this content is rendered into anchors on a public page.
 */
export const hrefSchema = z
  .string()
  .trim()
  .max(500)
  .refine(
    (v) => v === '' || /^(\/(?!\/)|#|https?:\/\/|mailto:|tel:)/i.test(v),
    'Use a path (/…), an anchor (#…), or an http(s)/mailto/tel link',
  );

export const imageSchema = z.object({
  url: z.string().trim().max(1000),
  alt: text(),
  /** Object key in the Supabase `landing` bucket; empty for bundled assets. */
  path: z.string().trim().max(500).default(''),
});
export type LandingImage = z.infer<typeof imageSchema>;

/** Icons an admin may pick for feature rows. Keys map to lucide in the UI. */
export const LANDING_ICONS = [
  'wheat', 'store', 'croissant', 'clock', 'heart', 'flame', 'sun', 'award',
  'coffee', 'cake', 'map-pin', 'users', 'leaf', 'star', 'sparkles', 'chef-hat',
] as const;
export type LandingIcon = (typeof LANDING_ICONS)[number];

const linkSchema = z.object({ label: text(60), href: hrefSchema });
export type LandingLink = z.infer<typeof linkSchema>;

const base = {
  /** Stable client-generated id, used as the React key and editor handle. */
  id: z.string().min(1).max(64),
  visible: z.boolean().default(true),
  /** Anchor for nav links, e.g. `breads` → `/#breads`. */
  anchor: z.string().trim().max(40).regex(/^[a-z0-9-]*$/, 'Lowercase letters, digits and dashes').default(''),
};

export const heroSectionSchema = z.object({
  ...base,
  type: z.literal('hero'),
  eyebrow: text(),
  title: text(),
  body: text(MAX_BODY),
  primaryCta: linkSchema,
  secondaryCta: linkSchema,
  image: imageSchema.nullable(),
  imageBadges: z.array(text(60)).max(4),
  imageCaption: text(),
  stats: z.array(z.object({ value: text(20), label: text(60) })).max(4),
});

export const productItemSchema = z.object({
  id: z.string().min(1).max(64),
  productId: z.number().int().positive(),
  image: imageSchema.nullable(),
  badge: text(40),
  /** Appended to the live price: `₱45.00 / bag of 10`. Empty → `/ pc`. */
  priceUnit: text(40),
  description: text(MAX_BODY),
  tags: z.array(text(40)).max(4),
  bakeTimes: text(80),
  note: text(80),
  footerText: text(80),
});
export type LandingProductItem = z.infer<typeof productItemSchema>;

export const productsSectionSchema = z.object({
  ...base,
  type: z.literal('products'),
  eyebrow: text(),
  title: text(),
  body: text(MAX_BODY),
  pill: text(80),
  items: z.array(productItemSchema).max(12),
});

export const aboutSectionSchema = z.object({
  ...base,
  type: z.literal('about'),
  eyebrow: text(),
  title: text(),
  body: text(2000),
  images: z.array(imageSchema).max(2),
  quote: text(300),
  features: z
    .array(z.object({ icon: z.enum(LANDING_ICONS), title: text(80), body: text(400) }))
    .max(6),
});

export const branchItemSchema = z.object({
  id: z.string().min(1).max(64),
  branchId: z.number().int().positive(),
  image: imageSchema.nullable(),
  badge: text(40),
  subtitle: text(80),
  description: text(600),
  hours: text(80),
  /** Optional override; otherwise a Maps search for the branch address. */
  mapsUrl: hrefSchema,
});
export type LandingBranchItem = z.infer<typeof branchItemSchema>;

export const branchesSectionSchema = z.object({
  ...base,
  type: z.literal('branches'),
  eyebrow: text(),
  title: text(),
  body: text(MAX_BODY),
  buttonLabel: text(40),
  items: z.array(branchItemSchema).max(24),
});

export const ctaSectionSchema = z.object({
  ...base,
  type: z.literal('cta'),
  eyebrow: text(),
  title: text(),
  body: text(MAX_BODY),
  button: linkSchema,
  caption: text(),
});

export const footerSectionSchema = z.object({
  ...base,
  type: z.literal('footer'),
  blurb: text(600),
  tagline: text(80),
  hoursTitle: text(60),
  hours: z.array(z.object({ days: text(60), time: text(60) })).max(8),
  hoursNote: text(),
  linkColumns: z
    .array(z.object({ title: text(60), links: z.array(linkSchema).max(8) }))
    .max(3),
  copyright: text(),
  legalLinks: z.array(linkSchema).max(5),
});

export const sectionSchema = z.discriminatedUnion('type', [
  heroSectionSchema,
  productsSectionSchema,
  aboutSectionSchema,
  branchesSectionSchema,
  ctaSectionSchema,
  footerSectionSchema,
]);
export type LandingSection = z.infer<typeof sectionSchema>;
export type LandingSectionType = LandingSection['type'];
export type SectionOf<T extends LandingSectionType> = Extract<LandingSection, { type: T }>;

export const brandSchema = z.object({
  name: text(60).min(1),
  logo: imageSchema.nullable(),
  navLinks: z.array(linkSchema).max(6),
  cta: linkSchema,
  /** Used for the page <title> and meta description. */
  seoTitle: text(),
  seoDescription: text(300),
});

export const landingContentSchema = z.object({
  version: z.literal(1),
  brand: brandSchema,
  sections: z.array(sectionSchema).max(20),
});
export type LandingContent = z.infer<typeof landingContentSchema>;

export const SECTION_LABELS: Record<LandingSectionType, string> = {
  hero: 'Hero',
  products: 'Featured breads',
  about: 'About',
  branches: 'Branches',
  cta: 'Call to action',
  footer: 'Footer',
};

// ── Resolved (public) shape ────────────────────────────────────────────────
// What the server hands the renderer: items carry the live catalog fields.

export type ResolvedProductItem = LandingProductItem & { name: string; price: number };
export type ResolvedBranchItem = LandingBranchItem & { name: string; address: string | null; phone: string | null };

export type ResolvedSection =
  | Exclude<LandingSection, { type: 'products' | 'branches' }>
  | (Omit<SectionOf<'products'>, 'items'> & { items: ResolvedProductItem[] })
  | (Omit<SectionOf<'branches'>, 'items'> & { items: ResolvedBranchItem[] });

export type ResolvedLanding = Omit<LandingContent, 'sections'> & { sections: ResolvedSection[] };

/** `₱45.00 / bag of 10`. */
export function formatPrice(price: number, unit: string): string {
  const amount = `₱${price.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `${amount} / ${unit.trim() || 'pc'}`;
}

export function mapsHref(item: { mapsUrl: string; address: string | null; name: string }): string {
  if (item.mapsUrl) return item.mapsUrl;
  const q = item.address ? `${item.name}, ${item.address}` : `Louella Bakery ${item.name}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}
