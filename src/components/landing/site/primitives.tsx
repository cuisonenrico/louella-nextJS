/**
 * Small building blocks shared by the landing sections. Everything here is
 * props-only (no hooks, no data fetching) so the same components render the
 * public page on the server and the live preview inside the admin editor.
 */
import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  Award, Cake, ChefHat, Clock, Coffee, Croissant, Flame, Heart, Leaf, MapPin,
  Sparkles, Star, Store, Sun, Users, Wheat, type LucideIcon,
} from 'lucide-react';
import type { LandingIcon, LandingImage, LandingLink } from '@/lib/landing/schema';
import { cn } from '@/lib/utils';

export const LANDING_ICON_COMPONENTS: Record<LandingIcon, LucideIcon> = {
  wheat: Wheat, store: Store, croissant: Croissant, clock: Clock, heart: Heart,
  flame: Flame, sun: Sun, award: Award, coffee: Coffee, cake: Cake,
  'map-pin': MapPin, users: Users, leaf: Leaf, star: Star, sparkles: Sparkles,
  'chef-hat': ChefHat,
};

export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('mx-auto w-full max-w-6xl px-4 sm:px-6', className)}>{children}</div>;
}

export function Eyebrow({ className, children }: { className?: string; children: ReactNode }) {
  if (!children) return null;
  return (
    <p className={cn('text-[11px] font-semibold uppercase tracking-[0.18em] text-lp-brand', className)}>
      {children}
    </p>
  );
}

/** Internal paths use next/link; anchors and external links stay plain. */
export function SmartLink({
  link,
  className,
  children,
}: {
  link: LandingLink;
  className?: string;
  children?: ReactNode;
}) {
  const content = children ?? link.label;
  if (!link.href) return <span className={className}>{content}</span>;
  if (link.href.startsWith('/')) {
    return <Link href={link.href} className={className}>{content}</Link>;
  }
  const external = /^https?:\/\//i.test(link.href);
  return (
    <a
      href={link.href}
      className={className}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {content}
    </a>
  );
}

export const primaryButton =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-lp-brand px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-lp-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lp-brand';
export const secondaryButton =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-lp-card px-5 py-3 text-sm font-semibold text-lp-ink shadow-sm ring-1 ring-lp-line transition-colors hover:bg-lp-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lp-brand';

/**
 * A landing image, or a warm placeholder when none is set yet. The parent
 * sets the size; this fills it.
 */
export function LandingImg({
  image,
  sizes,
  priority,
  className,
}: {
  image: LandingImage | null | undefined;
  sizes: string;
  priority?: boolean;
  className?: string;
}) {
  if (!image?.url) {
    return (
      <div
        className={cn(
          'flex size-full items-center justify-center bg-gradient-to-br from-lp-blush via-lp-paper to-lp-gold/40 text-lp-brand/40',
          className,
        )}
        role="img"
        aria-label="Image coming soon"
      >
        <Wheat className="size-10" strokeWidth={1.25} aria-hidden />
      </div>
    );
  }
  return (
    <Image
      src={image.url}
      alt={image.alt}
      fill
      sizes={sizes}
      priority={priority}
      className={cn('object-cover', className)}
    />
  );
}

export function Pill({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full bg-lp-blush px-3 py-1 text-[11px] font-medium text-lp-brand',
        className,
      )}
    >
      {children}
    </span>
  );
}
