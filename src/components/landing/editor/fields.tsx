'use client';

/**
 * Form building blocks for the landing editor. Every field is controlled:
 * `value` in, `onChange(next)` out, so a section form is just a tree of these.
 */
import { useId, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import type { LandingLink } from '@/lib/landing/schema';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export function newId(prefix = 'item'): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export function TextField({
  label,
  value,
  onChange,
  multiline,
  maxLength,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  maxLength?: number;
  placeholder?: string;
  hint?: string;
}) {
  const id = useId();
  const Control = multiline ? Textarea : Input;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {maxLength != null && value.length > maxLength * 0.8 && (
          <span className={cn('text-xs text-muted-foreground', value.length > maxLength && 'text-destructive')}>
            {value.length}/{maxLength}
          </span>
        )}
      </div>
      <Control
        id={id}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        {...(multiline ? { rows: 3 } : {})}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function LinkField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: LandingLink;
  onChange: (value: LandingLink) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-sm font-medium">{label}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          aria-label={`${label} text`}
          placeholder="Button text"
          value={value.label}
          onChange={(e) => onChange({ ...value, label: e.target.value })}
        />
        <Input
          aria-label={`${label} link`}
          placeholder="#branches, /login or https://…"
          value={value.href}
          onChange={(e) => onChange({ ...value, href: e.target.value })}
        />
      </div>
    </fieldset>
  );
}

/** Up / down / remove controls for one row of a list. */
export function RowControls({
  index,
  count,
  onMove,
  onRemove,
  label,
}: {
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
  onRemove: () => void;
  label: string;
}) {
  return (
    <div className="flex shrink-0 items-center">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-9 md:size-8"
        disabled={index === 0}
        onClick={() => onMove(index, index - 1)}
        aria-label={`Move ${label} up`}
      >
        <ArrowUp />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-9 md:size-8"
        disabled={index === count - 1}
        onClick={() => onMove(index, index + 1)}
        aria-label={`Move ${label} down`}
      >
        <ArrowDown />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-9 text-destructive md:size-8"
        onClick={onRemove}
        aria-label={`Remove ${label}`}
      >
        <Trash2 />
      </Button>
    </div>
  );
}

export function move<T>(list: readonly T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return [...list];
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * An editable, reorderable list. `renderItem` draws one row's fields; the
 * list supplies ordering, removal and the add button (hidden at `max`).
 */
export function ListField<T>({
  label,
  items,
  onChange,
  renderItem,
  create,
  max,
  itemLabel,
  addLabel,
  empty,
  getKey,
}: {
  label: string;
  items: readonly T[];
  onChange: (items: T[]) => void;
  renderItem: (item: T, update: (next: T) => void, index: number) => ReactNode;
  create: () => T;
  max: number;
  itemLabel: (item: T, index: number) => string;
  addLabel?: string;
  empty?: string;
  /** Stable key for rows that hold uncontrolled inputs; defaults to index. */
  getKey?: (item: T, index: number) => string;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-sm font-medium">{label}</legend>
      {items.length === 0 && empty && <p className="text-sm text-muted-foreground">{empty}</p>}
      <ol className="flex flex-col gap-2">
        {items.map((item, i) => {
          const name = itemLabel(item, i);
          return (
            <li key={getKey ? getKey(item, i) : i} className="rounded-lg border bg-muted/30 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="truncate text-xs font-semibold text-muted-foreground">{name}</span>
                <RowControls
                  index={i}
                  count={items.length}
                  label={name}
                  onMove={(from, to) => onChange(move(items, from, to))}
                  onRemove={() => onChange(items.filter((_, j) => j !== i))}
                />
              </div>
              <div className="flex flex-col gap-3">
                {renderItem(item, (next) => onChange(items.map((it, j) => (j === i ? next : it))), i)}
              </div>
            </li>
          );
        })}
      </ol>
      {items.length < max && (
        <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => onChange([...items, create()])}>
          <Plus data-icon="inline-start" />
          {addLabel ?? 'Add'}
        </Button>
      )}
    </fieldset>
  );
}

/** A list of short strings (badges, tags) edited as one comma-separated line. */
export function TagsField({
  label,
  value,
  onChange,
  max,
  hint,
}: {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  max: number;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        defaultValue={value.join(', ')}
        // Commit on blur so typing a comma does not fight the cursor.
        onBlur={(e) =>
          onChange(
            e.target.value
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
              .slice(0, max),
          )
        }
      />
      <p className="text-xs text-muted-foreground">{hint ?? `Separate with commas (up to ${max}).`}</p>
    </div>
  );
}
