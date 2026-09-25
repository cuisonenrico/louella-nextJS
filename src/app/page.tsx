import type { Metadata } from 'next';
import LandingCta from '@/components/landing/LandingCta';
import LandingRenderer from '@/components/landing/site/LandingRenderer';
import SmoothAnchors from '@/components/landing/site/SmoothAnchors';
import { getPublishedLanding } from '@/server/landing/published-landing';

// Content is edited in Settings → Landing Page and cached under the `landing`
// tag (see src/server/landing/published-landing.ts). Revalidating here too
// keeps the prerendered HTML from outliving the data cache.
export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const content = await getPublishedLanding();
  const hero = content.sections.find((s) => s.type === 'hero');
  const title = content.brand.seoTitle || content.brand.name;
  const description = content.brand.seoDescription || (hero?.type === 'hero' ? hero.body : undefined);
  const image = hero?.type === 'hero' ? hero.image : null;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: image?.url ? [{ url: image.url, alt: image.alt }] : undefined,
    },
  };
}

export default async function Home() {
  const content = await getPublishedLanding();
  return (
    <>
      <LandingRenderer content={content} accountSlot={<LandingCta />} />
      <SmoothAnchors />
    </>
  );
}
