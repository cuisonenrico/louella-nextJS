/**
 * One component per landing section type. Props-only, so the public page and
 * the editor preview render identical markup.
 */
import { CheckCircle2, Clock, Info, MapPin, Quote, Store } from 'lucide-react';
import {
  formatPrice,
  mapsHref,
  type ResolvedBranchItem,
  type ResolvedProductItem,
  type SectionOf,
} from '@/lib/landing/schema';
import {
  Container,
  Eyebrow,
  LANDING_ICON_COMPONENTS,
  LandingImg,
  Pill,
  SmartLink,
  primaryButton,
  secondaryButton,
} from './primitives';

const anchorId = (anchor: string) => (anchor ? anchor : undefined);

// ── Hero ─────────────────────────────────────────────────────────────────────

export function HeroSection({ section }: { section: SectionOf<'hero'> }) {
  return (
    <section id={anchorId(section.anchor)} className="scroll-mt-20 bg-lp-cream">
      <Container className="grid items-center gap-10 py-12 md:grid-cols-2 md:py-16">
        <div>
          {section.eyebrow && (
            <Pill className="mb-5">
              <Store className="size-3" aria-hidden />
              {section.eyebrow}
            </Pill>
          )}
          <h1 className="font-lp-serif text-4xl leading-[1.08] font-medium text-lp-ink sm:text-5xl lg:text-[3.4rem]">
            {section.title}
          </h1>
          {section.body && (
            <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-lp-muted">{section.body}</p>
          )}
          <div className="mt-7 flex flex-wrap gap-3">
            {section.primaryCta.label && <SmartLink link={section.primaryCta} className={primaryButton} />}
            {section.secondaryCta.label && <SmartLink link={section.secondaryCta} className={secondaryButton} />}
          </div>
          {section.stats.length > 0 && (
            <dl className="mt-8 grid max-w-lg grid-cols-3 gap-2 sm:gap-3">
              {section.stats.map((stat, i) => (
                <div key={i} className="rounded-xl bg-lp-card/70 px-3 py-3 ring-1 ring-lp-line sm:px-4">
                  <dt className="sr-only">{stat.label}</dt>
                  <dd className="font-lp-serif text-xl text-lp-ink">{stat.value}</dd>
                  <dd className="mt-0.5 text-xs leading-snug text-lp-muted">{stat.label}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl shadow-xl shadow-lp-brand/10">
          <LandingImg image={section.image} sizes="(min-width: 768px) 50vw, 100vw" priority />
          {section.imageBadges.length > 0 && (
            <div className="absolute top-3 left-3 flex flex-wrap gap-2">
              {section.imageBadges.map((badge, i) => (
                <span key={i} className="rounded-full bg-white/90 px-3 py-1 text-[11px] font-medium text-lp-ink shadow-sm backdrop-blur">
                  {badge}
                </span>
              ))}
            </div>
          )}
          {section.imageCaption && (
            <p className="absolute right-3 bottom-3 flex max-w-[85%] items-center gap-2 rounded-full bg-white/95 px-3 py-1.5 text-xs text-lp-ink shadow-sm">
              <span className="size-2 shrink-0 rounded-full bg-lp-brand" aria-hidden />
              {section.imageCaption}
            </p>
          )}
        </div>
      </Container>
    </section>
  );
}

// ── Featured breads ──────────────────────────────────────────────────────────

function ProductCard({ item }: { item: ResolvedProductItem }) {
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl bg-lp-card shadow-sm ring-1 ring-lp-line">
      <div className="relative aspect-[4/3]">
        <LandingImg image={item.image} sizes="(min-width: 768px) 33vw, 100vw" />
        {item.badge && (
          <span className="absolute top-3 left-3 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium text-lp-ink shadow-sm">
            {item.badge}
          </span>
        )}
        <span className="absolute right-3 bottom-3 rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-lp-ink shadow-sm">
          {formatPrice(item.price, item.priceUnit)}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <h3 className="font-lp-serif text-xl text-lp-ink">{item.name}</h3>
        {item.description && <p className="text-sm leading-relaxed text-lp-muted">{item.description}</p>}
        {item.tags.length > 0 && (
          <p className="rounded-md bg-lp-blush/70 px-2.5 py-1.5 text-[11px] font-medium text-lp-brand">
            {item.tags.join(' • ')}
          </p>
        )}
        {(item.bakeTimes || item.note) && (
          <div className="flex items-start justify-between gap-3 text-xs text-lp-muted">
            {item.bakeTimes && (
              <span className="flex items-start gap-1.5">
                <Clock className="mt-px size-3.5 shrink-0 text-lp-brand" aria-hidden />
                {item.bakeTimes}
              </span>
            )}
            {item.note && <span className="text-right text-lp-brand">{item.note}</span>}
          </div>
        )}
        {item.footerText && (
          <p className="mt-auto flex items-center justify-center gap-2 rounded-lg bg-lp-blush/60 px-3 py-2.5 text-center text-xs font-medium text-lp-ink">
            <CheckCircle2 className="size-3.5 shrink-0 text-lp-brand" aria-hidden />
            {item.footerText}
          </p>
        )}
      </div>
    </article>
  );
}

export function ProductsSection({
  section,
}: {
  section: Omit<SectionOf<'products'>, 'items'> & { items: ResolvedProductItem[] };
}) {
  return (
    <section id={anchorId(section.anchor)} className="scroll-mt-20 bg-lp-paper py-16 md:py-20">
      <Container>
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-xl">
            <Eyebrow>{section.eyebrow}</Eyebrow>
            <h2 className="mt-2 font-lp-serif text-3xl text-lp-ink sm:text-4xl">{section.title}</h2>
            {section.body && <p className="mt-3 text-[15px] leading-relaxed text-lp-muted">{section.body}</p>}
          </div>
          {section.pill && <Pill className="self-start md:self-auto">{section.pill}</Pill>}
        </div>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {section.items.map((item) => (
            <ProductCard key={item.id} item={item} />
          ))}
        </div>
      </Container>
    </section>
  );
}

// ── About ────────────────────────────────────────────────────────────────────

export function AboutSection({ section }: { section: SectionOf<'about'> }) {
  const images = section.images.length ? section.images : [null];
  return (
    <section id={anchorId(section.anchor)} className="scroll-mt-20 bg-lp-cream py-16 md:py-20">
      <Container className="grid items-center gap-12 md:grid-cols-2">
        <div className="relative pb-10">
          <div className={images.length > 1 ? 'grid grid-cols-2 gap-2' : ''}>
            {images.map((image, i) => (
              <div key={i} className="relative aspect-[4/5] overflow-hidden rounded-2xl sm:aspect-[4/4]">
                <LandingImg image={image} sizes="(min-width: 768px) 25vw, 50vw" />
              </div>
            ))}
          </div>
          {section.quote && (
            <blockquote className="absolute right-4 bottom-0 left-4 rounded-xl bg-lp-card p-5 shadow-lg shadow-lp-brand/10 sm:right-10">
              <Quote className="mb-1 size-4 text-lp-brand" aria-hidden />
              <p className="font-lp-serif text-lg leading-snug text-lp-ink italic">“{section.quote}”</p>
            </blockquote>
          )}
        </div>
        <div>
          <Eyebrow>{section.eyebrow}</Eyebrow>
          <h2 className="mt-2 font-lp-serif text-3xl text-lp-ink sm:text-4xl">{section.title}</h2>
          {section.body && (
            <p className="mt-4 text-[15px] leading-relaxed whitespace-pre-line text-lp-muted">{section.body}</p>
          )}
          {section.features.length > 0 && (
            <ul className="mt-8 flex flex-col gap-6">
              {section.features.map((f, i) => {
                const Icon = LANDING_ICON_COMPONENTS[f.icon];
                return (
                  <li key={i} className="flex gap-4">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-lp-card text-lp-brand ring-1 ring-lp-line">
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <div>
                      <p className="font-semibold text-lp-ink">{f.title}</p>
                      <p className="mt-1 text-sm leading-relaxed text-lp-muted">{f.body}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Container>
    </section>
  );
}

// ── Branches ─────────────────────────────────────────────────────────────────

function BranchCard({ item, buttonLabel }: { item: ResolvedBranchItem; buttonLabel: string }) {
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl bg-lp-paper shadow-sm ring-1 ring-lp-line">
      {item.image && (
        <div className="relative aspect-[16/9]">
          <LandingImg image={item.image} sizes="(min-width: 768px) 33vw, 100vw" />
        </div>
      )}
      <div className="flex flex-1 flex-col gap-3 p-6">
        <div className="flex items-start justify-between gap-3">
          {item.badge ? (
            <Pill className="bg-lp-gold/25 text-lp-brand-deep">
              <span className="size-1.5 rounded-full bg-lp-brand" aria-hidden />
              {item.badge}
            </Pill>
          ) : <span />}
          <Store className="size-4 text-lp-muted" aria-hidden />
        </div>
        <div>
          <h3 className="font-lp-serif text-xl text-lp-ink">{item.name}</h3>
          {item.subtitle && <p className="mt-0.5 text-xs font-semibold text-lp-brand">{item.subtitle}</p>}
        </div>
        {item.description && <p className="text-sm leading-relaxed text-lp-muted">{item.description}</p>}
        <div className="flex flex-col gap-1.5 text-xs text-lp-ink">
          {item.address && (
            <p className="flex items-start gap-2">
              <MapPin className="mt-px size-3.5 shrink-0 text-lp-muted" aria-hidden />
              {item.address}
            </p>
          )}
          {item.hours && (
            <p className="flex items-start gap-2">
              <Clock className="mt-px size-3.5 shrink-0 text-lp-muted" aria-hidden />
              {item.hours}
            </p>
          )}
        </div>
        <div className="mt-auto flex items-center gap-3 pt-3">
          <SmartLink
            link={{ label: buttonLabel || 'Get Directions', href: mapsHref(item) }}
            className={`${primaryButton} flex-1 py-2.5`}
          />
          {item.phone && (
            <a
              href={`tel:${item.phone.replace(/[^\d+]/g, '')}`}
              className="flex size-9 items-center justify-center rounded-full bg-lp-card text-lp-muted ring-1 ring-lp-line hover:text-lp-brand"
              aria-label={`Call ${item.name}: ${item.phone}`}
              title={item.phone}
            >
              <Info className="size-4" aria-hidden />
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

export function BranchesSection({
  section,
}: {
  section: Omit<SectionOf<'branches'>, 'items'> & { items: ResolvedBranchItem[] };
}) {
  return (
    <section id={anchorId(section.anchor)} className="scroll-mt-20 bg-lp-card py-16 md:py-20">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow>{section.eyebrow}</Eyebrow>
          <h2 className="mt-2 font-lp-serif text-3xl text-lp-ink sm:text-4xl">{section.title}</h2>
          {section.body && <p className="mt-3 text-[15px] leading-relaxed text-lp-muted">{section.body}</p>}
        </div>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {section.items.map((item) => (
            <BranchCard key={item.id} item={item} buttonLabel={section.buttonLabel} />
          ))}
        </div>
      </Container>
    </section>
  );
}

// ── Call to action ───────────────────────────────────────────────────────────

export function CtaSection({ section }: { section: SectionOf<'cta'> }) {
  return (
    <section id={anchorId(section.anchor)} className="scroll-mt-20 bg-lp-card py-10 md:py-14">
      <Container>
        <div className="grid items-center gap-8 rounded-3xl bg-gradient-to-br from-lp-brand to-lp-brand-deep p-8 text-white shadow-xl shadow-lp-brand/20 md:grid-cols-[1fr_auto] md:p-12">
          <div>
            {section.eyebrow && (
              <p className="text-[11px] font-semibold tracking-[0.18em] text-white/80 uppercase">{section.eyebrow}</p>
            )}
            <h2 className="mt-2 max-w-xl font-lp-serif text-3xl leading-tight sm:text-4xl">{section.title}</h2>
            {section.body && <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/80">{section.body}</p>}
          </div>
          {section.button.label && (
            <div className="flex flex-col items-start gap-2 md:items-center">
              <SmartLink
                link={section.button}
                className="inline-flex items-center justify-center rounded-lg bg-lp-gold px-6 py-3 text-sm font-semibold text-lp-ink shadow-sm transition-colors hover:bg-[#f7c56d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              />
              {section.caption && <p className="text-xs text-white/70">{section.caption}</p>}
            </div>
          )}
        </div>
      </Container>
    </section>
  );
}

// ── Footer ───────────────────────────────────────────────────────────────────

export function FooterSection({ section, brandName }: { section: SectionOf<'footer'>; brandName: string }) {
  return (
    <footer id={anchorId(section.anchor)} className="scroll-mt-20 bg-lp-cream">
      <Container className="grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <p className="font-lp-serif text-2xl text-lp-ink">{brandName}</p>
          {section.blurb && <p className="mt-3 max-w-sm text-sm leading-relaxed text-lp-muted">{section.blurb}</p>}
          {section.tagline && (
            <p className="mt-4 flex items-center gap-2 text-[11px] font-semibold tracking-wide text-lp-brand uppercase">
              <Store className="size-3.5" aria-hidden />
              {section.tagline}
            </p>
          )}
        </div>
        {(section.hours.length > 0 || section.hoursNote) && (
          <div>
            <p className="font-semibold text-lp-ink">{section.hoursTitle || 'Hours'}</p>
            <dl className="mt-3 flex flex-col gap-2 text-sm">
              {section.hours.map((h, i) => (
                <div key={i} className="flex justify-between gap-4">
                  <dt className="text-lp-ink">{h.days}</dt>
                  <dd className="text-lp-muted">{h.time}</dd>
                </div>
              ))}
            </dl>
            {section.hoursNote && (
              <p className="mt-4 rounded-md bg-lp-gold/20 px-3 py-2 text-xs text-lp-brand-deep">{section.hoursNote}</p>
            )}
          </div>
        )}
        {section.linkColumns.map((col, i) => (
          <div key={i}>
            <p className="font-semibold text-lp-ink">{col.title}</p>
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {col.links.map((link, j) => (
                <li key={j}>
                  <SmartLink link={link} className="text-lp-muted hover:text-lp-brand" />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Container>
      <div className="border-t border-lp-line">
        <Container className="flex flex-col gap-3 py-6 text-xs text-lp-muted sm:flex-row sm:items-center sm:justify-between">
          <p>{section.copyright}</p>
          {section.legalLinks.length > 0 && (
            <ul className="flex flex-wrap gap-5">
              {section.legalLinks.map((link, i) => (
                <li key={i}>
                  <SmartLink link={link} className="hover:text-lp-brand" />
                </li>
              ))}
            </ul>
          )}
        </Container>
      </div>
    </footer>
  );
}
