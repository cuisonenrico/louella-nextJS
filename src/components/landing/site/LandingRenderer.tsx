import { Fragment, type ReactNode } from 'react';
import { Menu } from 'lucide-react';
import type { ResolvedLanding, ResolvedSection } from '@/lib/landing/schema';
import { cn } from '@/lib/utils';
import { landingSans, landingSerif } from './fonts';
import { Container, LandingImg, SmartLink } from './primitives';
import {
  AboutSection,
  BranchesSection,
  CtaSection,
  FooterSection,
  HeroSection,
  ProductsSection,
} from './sections';

function LandingNav({ content, accountSlot }: { content: ResolvedLanding; accountSlot?: ReactNode }) {
  const { brand } = content;
  return (
    <header className="sticky top-0 z-40 border-b border-lp-line/60 bg-lp-paper/90 backdrop-blur">
      <Container className="flex h-16 items-center justify-between gap-4">
        <a href="#top" className="flex items-center gap-2">
          {brand.logo && (
            <span className="relative size-8 overflow-hidden rounded-full">
              <LandingImg image={brand.logo} sizes="32px" />
            </span>
          )}
          <span className="font-lp-serif text-xl font-semibold text-lp-brand">{brand.name}</span>
        </a>
        <nav aria-label="Main" className="hidden md:block">
          <ul className="flex items-center gap-8 text-[13px] text-lp-ink">
            {brand.navLinks.map((link, i) => (
              <li key={i}>
                <SmartLink link={link} className="hover:text-lp-brand" />
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center gap-2">
          {brand.cta.label && (
            <SmartLink
              link={brand.cta}
              className="hidden rounded-lg bg-lp-brand px-4 py-2 text-[13px] font-semibold text-white hover:bg-lp-brand-deep sm:inline-flex"
            />
          )}
          {accountSlot}
          {brand.navLinks.length > 0 && (
            // Pure-CSS disclosure so the nav needs no client JavaScript.
            <details className="group relative md:hidden">
              <summary
                className="flex size-9 cursor-pointer list-none items-center justify-center rounded-lg text-lp-ink ring-1 ring-lp-line [&::-webkit-details-marker]:hidden"
                aria-label="Menu"
              >
                <Menu className="size-4" aria-hidden />
              </summary>
              <ul className="absolute right-0 mt-2 flex w-56 flex-col rounded-xl bg-lp-card p-2 text-sm shadow-lg ring-1 ring-lp-line">
                {brand.navLinks.map((link, i) => (
                  <li key={i}>
                    <SmartLink link={link} className="block rounded-lg px-3 py-2 text-lp-ink hover:bg-lp-blush" />
                  </li>
                ))}
                {brand.cta.label && (
                  <li>
                    <SmartLink link={brand.cta} className="block rounded-lg px-3 py-2 font-semibold text-lp-brand hover:bg-lp-blush" />
                  </li>
                )}
              </ul>
            </details>
          )}
        </div>
      </Container>
    </header>
  );
}

function renderSection(section: ResolvedSection, brandName: string) {
  switch (section.type) {
    case 'hero': return <HeroSection section={section} />;
    case 'products': return <ProductsSection section={section} />;
    case 'about': return <AboutSection section={section} />;
    case 'branches': return <BranchesSection section={section} />;
    case 'cta': return <CtaSection section={section} />;
    case 'footer': return <FooterSection section={section} brandName={brandName} />;
  }
}

/**
 * The whole landing page from resolved content. Used by `src/app/page.tsx`
 * and by the editor's live preview, so what an admin previews is exactly
 * what visitors get.
 */
export default function LandingRenderer({
  content,
  accountSlot,
  className,
}: {
  content: ResolvedLanding;
  /** Login/Dashboard button on the live site; omitted in the preview. */
  accountSlot?: ReactNode;
  className?: string;
}) {
  const sections = content.sections.filter((s) => s.visible);
  const footer = sections.find((s) => s.type === 'footer');
  const body = sections.filter((s) => s.type !== 'footer');
  return (
    <div
      id="top"
      className={cn(
        landingSerif.variable,
        landingSans.variable,
        'min-h-screen bg-lp-paper font-lp-sans text-lp-ink antialiased',
        className,
      )}
    >
      <LandingNav content={content} accountSlot={accountSlot} />
      <main>
        {body.map((section) => (
          <Fragment key={section.id}>{renderSection(section, content.brand.name)}</Fragment>
        ))}
      </main>
      {footer && renderSection(footer, content.brand.name)}
    </div>
  );
}
