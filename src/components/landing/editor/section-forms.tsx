'use client';

import { AlertTriangle } from 'lucide-react';
import {
  LANDING_ICONS,
  formatPrice,
  type LandingContent,
  type LandingSection,
  type SectionOf,
} from '@/lib/landing/schema';
import type { LandingDraftResponse } from '@/lib/apiServices';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LANDING_ICON_COMPONENTS } from '../site/primitives';
import { ImageField } from './ImageField';
import { LinkField, ListField, TagsField, TextField, newId } from './fields';

export type Catalog = LandingDraftResponse['options'];

type FormProps<T> = { value: T; onChange: (next: T) => void };

/** Shallow field setter: `set('title')('New')`. */
function setter<T extends object>(value: T, onChange: (next: T) => void) {
  return <K extends keyof T>(key: K) =>
    (v: T[K]) =>
      onChange({ ...value, [key]: v });
}

function AnchorField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <TextField
      label="Link anchor"
      value={value}
      onChange={(v) => onChange(v.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
      maxLength={40}
      placeholder="e.g. breads"
      hint={value ? `Nav links can point here with #${value}` : 'Optional. Lets nav links jump to this section.'}
    />
  );
}

function HeadingFields<T extends { eyebrow: string; title: string; body: string }>({
  value,
  onChange,
}: FormProps<T>) {
  return (
    <>
      <TextField label="Small heading" value={value.eyebrow} onChange={(eyebrow) => onChange({ ...value, eyebrow })} maxLength={200} />
      <TextField label="Title" value={value.title} onChange={(title) => onChange({ ...value, title })} maxLength={200} />
      <TextField label="Text" value={value.body} onChange={(body) => onChange({ ...value, body })} multiline maxLength={1200} />
    </>
  );
}

// ── Brand & navigation ───────────────────────────────────────────────────────

export function BrandForm({ value, onChange }: FormProps<LandingContent['brand']>) {
  const set = setter(value, onChange);
  return (
    <>
      <TextField label="Bakery name" value={value.name} onChange={set('name')} maxLength={60} />
      <ImageField label="Logo (optional)" value={value.logo} onChange={set('logo')} aspect="aspect-square" />
      <ListField
        label="Navigation links"
        items={value.navLinks}
        onChange={set('navLinks')}
        max={6}
        itemLabel={(l, i) => l.label || `Link ${i + 1}`}
        create={() => ({ label: '', href: '#' })}
        addLabel="Add link"
        renderItem={(link, update) => <LinkField label="Link" value={link} onChange={update} />}
      />
      <LinkField label="Header button" value={value.cta} onChange={set('cta')} />
      <TextField label="Search title" value={value.seoTitle} onChange={set('seoTitle')} maxLength={200} hint="Shown in the browser tab and Google results." />
      <TextField label="Search description" value={value.seoDescription} onChange={set('seoDescription')} multiline maxLength={300} />
    </>
  );
}

// ── Hero ─────────────────────────────────────────────────────────────────────

function HeroForm({ value, onChange }: FormProps<SectionOf<'hero'>>) {
  const set = setter(value, onChange);
  return (
    <>
      <HeadingFields value={value} onChange={onChange} />
      <LinkField label="Main button" value={value.primaryCta} onChange={set('primaryCta')} />
      <LinkField label="Second button" value={value.secondaryCta} onChange={set('secondaryCta')} />
      <ImageField label="Photo" value={value.image} onChange={set('image')} />
      <TagsField label="Photo badges" value={value.imageBadges} onChange={set('imageBadges')} max={4} />
      <TextField label="Photo caption" value={value.imageCaption} onChange={set('imageCaption')} maxLength={200} />
      <ListField
        label="Highlights"
        items={value.stats}
        onChange={set('stats')}
        max={4}
        itemLabel={(s, i) => s.label || `Highlight ${i + 1}`}
        create={() => ({ value: '', label: '' })}
        addLabel="Add highlight"
        renderItem={(stat, update) => (
          <div className="grid gap-2 sm:grid-cols-2">
            <TextField label="Value" value={stat.value} onChange={(v) => update({ ...stat, value: v })} maxLength={20} placeholder="1974" />
            <TextField label="Label" value={stat.label} onChange={(v) => update({ ...stat, label: v })} maxLength={60} placeholder="Founded" />
          </div>
        )}
      />
    </>
  );
}

// ── Featured breads ──────────────────────────────────────────────────────────

function ProductPicker({
  value,
  onChange,
  catalog,
}: {
  value: number;
  onChange: (id: number) => void;
  catalog: Catalog;
}) {
  const types = [...new Set(catalog.products.map((p) => p.type))];
  return (
    <div className="flex flex-col gap-1.5">
      <Label>Product</Label>
      <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
        <SelectTrigger>
          <SelectValue placeholder="Choose a product" />
        </SelectTrigger>
        <SelectContent>
          {types.map((type) => (
            <SelectGroup key={type}>
              <SelectLabel>{type}</SelectLabel>
              {catalog.products
                .filter((p) => p.type === type)
                .map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name}
                    {!p.isActive && ' (inactive)'}
                  </SelectItem>
                ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function ProductsForm({ value, onChange, catalog }: FormProps<SectionOf<'products'>> & { catalog: Catalog }) {
  const set = setter(value, onChange);
  const byId = new Map(catalog.products.map((p) => [p.id, p]));
  return (
    <>
      <HeadingFields value={value} onChange={onChange} />
      <TextField label="Side note" value={value.pill} onChange={set('pill')} maxLength={80} />
      <ListField
        label="Breads"
        items={value.items}
        onChange={set('items')}
        max={12}
        getKey={(item) => item.id}
        empty="No breads yet. Add one to show this section."
        itemLabel={(item) => byId.get(item.productId)?.name ?? 'Product not found'}
        create={() => ({
          id: newId('product'),
          productId: catalog.products.find((p) => p.isActive)?.id ?? catalog.products[0]?.id ?? 1,
          image: null,
          badge: '',
          priceUnit: 'pc',
          description: '',
          tags: [],
          bakeTimes: '',
          note: '',
          footerText: '',
        })}
        addLabel="Add bread"
        renderItem={(item, update) => {
          const product = byId.get(item.productId);
          return (
            <>
              <ProductPicker value={item.productId} onChange={(productId) => update({ ...item, productId })} catalog={catalog} />
              {!product || !product.isActive ? (
                <Alert variant="destructive">
                  <AlertTriangle />
                  <AlertDescription>
                    {product ? 'This product is inactive' : 'This product was deleted'}, so the card is hidden on the site.
                  </AlertDescription>
                </Alert>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Name and price come from Products: {formatPrice(product.price, item.priceUnit)}
                </p>
              )}
              <TextField label="Price per" value={item.priceUnit} onChange={(v) => update({ ...item, priceUnit: v })} maxLength={40} placeholder="pc, bag of 10…" />
              <ImageField label="Photo" value={item.image} onChange={(image) => update({ ...item, image })} />
              <TextField label="Badge" value={item.badge} onChange={(v) => update({ ...item, badge: v })} maxLength={40} placeholder="Morning Staple" />
              <TextField label="Description" value={item.description} onChange={(v) => update({ ...item, description: v })} multiline maxLength={1200} />
              <TagsField label="Highlights" value={item.tags} onChange={(tags) => update({ ...item, tags })} max={4} />
              <div className="grid gap-2 sm:grid-cols-2">
                <TextField label="Bake times" value={item.bakeTimes} onChange={(v) => update({ ...item, bakeTimes: v })} maxLength={80} />
                <TextField label="Note" value={item.note} onChange={(v) => update({ ...item, note: v })} maxLength={80} />
              </div>
              <TextField label="Card footer" value={item.footerText} onChange={(v) => update({ ...item, footerText: v })} maxLength={80} />
            </>
          );
        }}
      />
    </>
  );
}

// ── About ────────────────────────────────────────────────────────────────────

function AboutForm({ value, onChange }: FormProps<SectionOf<'about'>>) {
  const set = setter(value, onChange);
  const setImage = (i: number) => (img: SectionOf<'about'>['images'][number] | null) => {
    const images = [...value.images];
    if (img) images[i] = img;
    else images.splice(i, 1);
    onChange({ ...value, images });
  };
  return (
    <>
      <HeadingFields value={value} onChange={onChange} />
      <div className="grid gap-3">
        <ImageField label="Photo 1" value={value.images[0] ?? null} onChange={setImage(0)} aspect="aspect-square" />
        {value.images.length >= 1 && (
          <ImageField label="Photo 2 (optional)" value={value.images[1] ?? null} onChange={setImage(1)} aspect="aspect-square" />
        )}
      </div>
      <TextField label="Quote" value={value.quote} onChange={set('quote')} multiline maxLength={300} />
      <ListField
        label="Highlights"
        items={value.features}
        onChange={set('features')}
        max={6}
        itemLabel={(f, i) => f.title || `Highlight ${i + 1}`}
        create={() => ({ icon: 'wheat' as const, title: '', body: '' })}
        addLabel="Add highlight"
        renderItem={(f, update) => (
          <>
            <div className="flex flex-col gap-1.5">
              <Label>Icon</Label>
              <Select value={f.icon} onValueChange={(icon) => update({ ...f, icon: icon as typeof f.icon })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {LANDING_ICONS.map((name) => {
                      const Icon = LANDING_ICON_COMPONENTS[name];
                      return (
                        <SelectItem key={name} value={name}>
                          <Icon aria-hidden />
                          {name.replace('-', ' ')}
                        </SelectItem>
                      );
                    })}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <TextField label="Title" value={f.title} onChange={(v) => update({ ...f, title: v })} maxLength={80} />
            <TextField label="Text" value={f.body} onChange={(v) => update({ ...f, body: v })} multiline maxLength={400} />
          </>
        )}
      />
    </>
  );
}

// ── Branches ─────────────────────────────────────────────────────────────────

function BranchesForm({ value, onChange, catalog }: FormProps<SectionOf<'branches'>> & { catalog: Catalog }) {
  const set = setter(value, onChange);
  const byId = new Map(catalog.branches.map((b) => [b.id, b]));
  return (
    <>
      <HeadingFields value={value} onChange={onChange} />
      <TextField label="Button text" value={value.buttonLabel} onChange={set('buttonLabel')} maxLength={40} />
      <ListField
        label="Branches"
        items={value.items}
        onChange={set('items')}
        max={24}
        getKey={(item) => item.id}
        empty="No branches yet. Add one to show this section."
        itemLabel={(item) => byId.get(item.branchId)?.name ?? 'Branch not found'}
        create={() => ({
          id: newId('branch'),
          branchId: catalog.branches.find((b) => b.isActive)?.id ?? catalog.branches[0]?.id ?? 1,
          image: null,
          badge: '',
          subtitle: '',
          description: '',
          hours: '',
          mapsUrl: '',
        })}
        addLabel="Add branch"
        renderItem={(item, update) => {
          const branch = byId.get(item.branchId);
          return (
            <>
              <div className="flex flex-col gap-1.5">
                <Label>Branch</Label>
                <Select value={String(item.branchId)} onValueChange={(v) => update({ ...item, branchId: Number(v) })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a branch" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {catalog.branches.map((b) => (
                        <SelectItem key={b.id} value={String(b.id)}>
                          {b.name}
                          {!b.isActive && ' (inactive)'}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              {!branch || !branch.isActive ? (
                <Alert variant="destructive">
                  <AlertTriangle />
                  <AlertDescription>
                    {branch ? 'This branch is inactive' : 'This branch was deleted'}, so the card is hidden on the site.
                  </AlertDescription>
                </Alert>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Name and address come from Branches{branch.address ? `: ${branch.address}` : ' (no address set yet)'}.
                </p>
              )}
              <ImageField label="Photo (optional)" value={item.image} onChange={(image) => update({ ...item, image })} aspect="aspect-video" />
              <div className="grid gap-2 sm:grid-cols-2">
                <TextField label="Badge" value={item.badge} onChange={(v) => update({ ...item, badge: v })} maxLength={40} />
                <TextField label="Subtitle" value={item.subtitle} onChange={(v) => update({ ...item, subtitle: v })} maxLength={80} />
              </div>
              <TextField label="Description" value={item.description} onChange={(v) => update({ ...item, description: v })} multiline maxLength={600} />
              <TextField label="Hours" value={item.hours} onChange={(v) => update({ ...item, hours: v })} maxLength={80} placeholder="Mon – Sun • 05:00 – 20:00" />
              <TextField
                label="Map link (optional)"
                value={item.mapsUrl}
                onChange={(v) => update({ ...item, mapsUrl: v })}
                placeholder="https://maps.app.goo.gl/…"
                hint="Leave empty to search Google Maps for the branch address."
              />
            </>
          );
        }}
      />
    </>
  );
}

// ── Call to action ───────────────────────────────────────────────────────────

function CtaForm({ value, onChange }: FormProps<SectionOf<'cta'>>) {
  const set = setter(value, onChange);
  return (
    <>
      <HeadingFields value={value} onChange={onChange} />
      <LinkField label="Button" value={value.button} onChange={set('button')} />
      <TextField label="Under the button" value={value.caption} onChange={set('caption')} maxLength={200} />
    </>
  );
}

// ── Footer ───────────────────────────────────────────────────────────────────

function FooterForm({ value, onChange }: FormProps<SectionOf<'footer'>>) {
  const set = setter(value, onChange);
  return (
    <>
      <TextField label="About text" value={value.blurb} onChange={set('blurb')} multiline maxLength={600} />
      <TextField label="Tagline" value={value.tagline} onChange={set('tagline')} maxLength={80} />
      <TextField label="Hours heading" value={value.hoursTitle} onChange={set('hoursTitle')} maxLength={60} />
      <ListField
        label="Opening hours"
        items={value.hours}
        onChange={set('hours')}
        max={8}
        itemLabel={(h, i) => h.days || `Row ${i + 1}`}
        create={() => ({ days: '', time: '' })}
        addLabel="Add row"
        renderItem={(h, update) => (
          <div className="grid gap-2 sm:grid-cols-2">
            <TextField label="Days" value={h.days} onChange={(v) => update({ ...h, days: v })} maxLength={60} />
            <TextField label="Time" value={h.time} onChange={(v) => update({ ...h, time: v })} maxLength={60} />
          </div>
        )}
      />
      <TextField label="Hours note" value={value.hoursNote} onChange={set('hoursNote')} maxLength={200} />
      <ListField
        label="Link columns"
        items={value.linkColumns}
        onChange={set('linkColumns')}
        max={3}
        itemLabel={(c, i) => c.title || `Column ${i + 1}`}
        create={() => ({ title: '', links: [] })}
        addLabel="Add column"
        renderItem={(col, update) => (
          <>
            <TextField label="Heading" value={col.title} onChange={(v) => update({ ...col, title: v })} maxLength={60} />
            <ListField
              label="Links"
              items={col.links}
              onChange={(links) => update({ ...col, links })}
              max={8}
              itemLabel={(l, i) => l.label || `Link ${i + 1}`}
              create={() => ({ label: '', href: '#' })}
              addLabel="Add link"
              renderItem={(link, updateLink) => <LinkField label="Link" value={link} onChange={updateLink} />}
            />
          </>
        )}
      />
      <TextField label="Copyright line" value={value.copyright} onChange={set('copyright')} maxLength={200} />
      <ListField
        label="Bottom links"
        items={value.legalLinks}
        onChange={set('legalLinks')}
        max={5}
        itemLabel={(l, i) => l.label || `Link ${i + 1}`}
        create={() => ({ label: '', href: '/' })}
        addLabel="Add link"
        renderItem={(link, update) => <LinkField label="Link" value={link} onChange={update} />}
      />
    </>
  );
}

// ── Dispatcher ───────────────────────────────────────────────────────────────

export function SectionForm({
  section,
  onChange,
  catalog,
}: {
  section: LandingSection;
  onChange: (next: LandingSection) => void;
  catalog: Catalog;
}) {
  const anchor = <AnchorField value={section.anchor} onChange={(anchor) => onChange({ ...section, anchor })} />;
  let form;
  switch (section.type) {
    case 'hero': form = <HeroForm value={section} onChange={onChange} />; break;
    case 'products': form = <ProductsForm value={section} onChange={onChange} catalog={catalog} />; break;
    case 'about': form = <AboutForm value={section} onChange={onChange} />; break;
    case 'branches': form = <BranchesForm value={section} onChange={onChange} catalog={catalog} />; break;
    case 'cta': form = <CtaForm value={section} onChange={onChange} />; break;
    case 'footer': form = <FooterForm value={section} onChange={onChange} />; break;
  }
  return (
    <div className="flex flex-col gap-4">
      {form}
      {anchor}
    </div>
  );
}
