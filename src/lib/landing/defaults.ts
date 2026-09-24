/**
 * Starting content for the landing page.
 *
 * Used when no page has been saved yet (the first time an admin opens the
 * editor, and as the public fallback) and when stored content fails to parse.
 * The copy is placeholder marketing text for an admin to replace; featured
 * breads and branches are filled from the live catalog because ids cannot be
 * known ahead of time.
 */
import type { LandingContent, LandingProductItem, LandingBranchItem } from './schema';

const PRODUCT_EXTRAS: Omit<LandingProductItem, 'id' | 'productId'>[] = [
  {
    image: null,
    badge: 'Morning Staple',
    priceUnit: 'pc',
    description:
      'Signature golden rolls rolled in toasted breadcrumbs, with a delicate crisp crust and pillowy, steaming-soft crumb.',
    tags: ['Stone-Hearth Baked', 'Soft & Airy'],
    bakeTimes: 'Bakes: 5:00 AM & 3:00 PM daily',
    note: 'Fresh batches twice daily',
    footerText: 'Fresh from the pugon • Walk-in purchase',
  },
  {
    image: null,
    badge: 'Afternoon Merienda',
    priceUnit: 'pc',
    description:
      'Soft rolled sweet dough generously filled with rich caramelized golden butter, brown sugar, and toasted breadcrumbs.',
    tags: ['Cultured Butter', 'Golden Crust'],
    bakeTimes: 'Bakes: 6:00 AM & 2:00 PM daily',
    note: 'Merienda favorite',
    footerText: 'Fresh from the pugon • Walk-in purchase',
  },
  {
    image: null,
    badge: 'Heritage Classic',
    priceUnit: 'pc',
    description:
      'Dense, slightly sweet, and aromatic heirloom bun with its signature center crease and glistening butter-glazed crust.',
    tags: ['Heirloom Recipe', 'Rich Butter Glaze'],
    bakeTimes: 'Bakes: 7:00 AM daily',
    note: 'Available all day',
    footerText: 'Fresh from the pugon • Walk-in purchase',
  },
];

const BRANCH_EXTRAS: Omit<LandingBranchItem, 'id' | 'branchId'>[] = [
  { image: null, badge: 'Active Hearth', subtitle: 'Flagship', description: 'Our flagship bakery, where the first trays come out before sunrise.', hours: 'Mon – Sun • 05:00 – 20:00', mapsUrl: '' },
  { image: null, badge: 'Neighborhood', subtitle: '', description: 'Warm pandesal every morning and merienda breads every afternoon.', hours: 'Mon – Sun • 05:00 – 20:00', mapsUrl: '' },
  { image: null, badge: 'Neighborhood', subtitle: '', description: 'Fresh loaves land at the counter three times daily.', hours: 'Mon – Sun • 05:00 – 20:00', mapsUrl: '' },
];

export function buildDefaultContent(
  productIds: number[] = [],
  branchIds: number[] = [],
): LandingContent {
  return {
    version: 1,
    brand: {
      name: 'Louella Bakery',
      logo: null,
      navLinks: [
        { label: 'Our Breads', href: '#breads' },
        { label: 'The Bakehouse', href: '#about' },
        { label: 'Our Branches', href: '#branches' },
        { label: 'Hours & Visit', href: '#visit' },
      ],
      cta: { label: 'Find a Branch', href: '#branches' },
      seoTitle: 'Louella Bakery — Traditional Filipino Panaderia',
      seoDescription:
        'Handcrafted Filipino panaderia classics, merienda favorites, and freshly baked pandesal from our ovens every morning.',
    },
    sections: [
      {
        id: 'hero',
        type: 'hero',
        visible: true,
        anchor: '',
        eyebrow: 'Traditional Panaderia • Brick Pugon Hearth',
        title: 'Baked with Heart, Tradition & Morning Warmth',
        body: 'Handcrafted Filipino panaderia classics, comforting merienda favorites, and freshly baked pandesal pulling hot from our brick ovens each morning.',
        primaryCta: { label: 'Explore Our Bakes', href: '#breads' },
        secondaryCta: { label: 'Visit Our Branches', href: '#branches' },
        image: null,
        imageBadges: ['Baked Fresh Daily', 'Filipino Classics'],
        imageCaption: 'Pandesal pulling hot from the oven now',
        stats: [
          { value: '1974', label: 'Founded' },
          { value: String(branchIds.length || 1), label: 'Neighborhood Branches' },
          { value: '5:00 AM', label: 'First Oven Pull' },
        ],
      },
      {
        id: 'products',
        type: 'products',
        visible: true,
        anchor: 'breads',
        eyebrow: 'Daily Panaderia Classics',
        title: 'From Our Pugon & Ovens',
        body: 'Honoring time-tested Filipino recipes, rich golden butter, and traditional breadcrumb-dusted bakes prepared fresh from morning to afternoon merienda.',
        pill: 'Freshly baked every morning & afternoon',
        items: productIds.slice(0, 3).map((productId, i) => ({
          id: `product-${productId}`,
          productId,
          ...PRODUCT_EXTRAS[i % PRODUCT_EXTRAS.length],
        })),
      },
      {
        id: 'about',
        type: 'about',
        visible: true,
        anchor: 'about',
        eyebrow: 'About Louella Bakery',
        title: 'Baking Filipino Heritage Since 1974',
        body: 'Founded as a modest neighborhood panaderia, Louella Bakery has spent decades honoring traditional Filipino baking. Every pandesal, spanish bread, and monay is crafted with unhurried care, wholesome ingredients, and the comforting spirit of community.',
        images: [],
        quote: 'Serving hot, comforting pandesal and sweet merienda favorites to Filipino homes for generations.',
        features: [
          { icon: 'wheat', title: 'Decades of Panaderia Tradition', body: 'Keeping heritage recipes alive with authentic Filipino techniques and cherished local flavors.' },
          { icon: 'store', title: 'Neighborhood Branches', body: 'Bringing warm morning ovens and fresh bakes closer to families across the community every single day.' },
          { icon: 'croissant', title: 'Baked Fresh Throughout the Day', body: 'Morning sunrise bakes and afternoon merienda batches pulled hot so you always enjoy bread at its peak.' },
        ],
      },
      {
        id: 'branches',
        type: 'branches',
        visible: true,
        anchor: 'branches',
        eyebrow: 'Neighborhood Bakehouses',
        title: 'Find Louella in Your Neighborhood',
        body: 'Each location has its own distinct character and a warm counter team. Fresh loaves land at each counter throughout the day.',
        buttonLabel: 'Get Directions',
        items: branchIds.slice(0, 6).map((branchId, i) => ({
          id: `branch-${branchId}`,
          branchId,
          ...BRANCH_EXTRAS[i % BRANCH_EXTRAS.length],
        })),
      },
      {
        id: 'cta',
        type: 'cta',
        visible: true,
        anchor: '',
        eyebrow: 'Always Fresh & Warm',
        title: 'Warm Bread from Our Ovens to Your Morning Table',
        body: 'Visit any of our neighborhood branches for hot pandesal and classic Filipino favorites. Baked fresh every morning and afternoon.',
        button: { label: 'Locate Your Nearest Branch', href: '#branches' },
        caption: 'Walk-ins welcome',
      },
      {
        id: 'footer',
        type: 'footer',
        visible: true,
        anchor: 'visit',
        blurb: 'Crafting beloved Filipino panaderia favorites. Every pandesal, spanish bread, and monay is baked with unhurried care across our neighborhood branches.',
        tagline: 'Traditional panaderia heritage',
        hoursTitle: 'Hearth & Hours',
        hours: [
          { days: 'Monday – Sunday', time: '05:00 – 20:00' },
        ],
        hoursNote: 'Hot pandesal pulled daily at 05:00 and 15:00',
        linkColumns: [
          {
            title: 'Discovery',
            links: [
              { label: 'Our Breads', href: '#breads' },
              { label: 'The Bakehouse', href: '#about' },
              { label: 'Bakery Locations', href: '#branches' },
            ],
          },
        ],
        copyright: `© ${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric' }).format(new Date())} Louella Bakery. Handcrafted with care.`,
        legalLinks: [{ label: 'Staff Login', href: '/login' }],
      },
    ],
  };
}
