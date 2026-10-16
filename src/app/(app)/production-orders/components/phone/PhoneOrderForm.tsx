'use client';

import { Fragment, useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { X } from 'lucide-react';
import type { Branch, Product, ProductionOrder, ProductType, SuggestionPeriod } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Stepper } from '@/components/mobile/Stepper';
import { clearOrderDraft, loadOrderDraft, orderDraftKey, saveOrderDraft } from '@/lib/mobile/orderDraft';
import { PRODUCT_TYPE_ORDER, useOrderForm } from '../../hooks/useOrderForm';

const TYPE_LABELS: Record<ProductType, string> = { BREAD: 'Bread', CAKE: 'Cake', SPECIAL: 'Special', MISCELLANEOUS: 'Miscellaneous' };

interface PhoneOrderFormProps {
  editTarget: ProductionOrder | null;
  filterDate: string;
  activeBranchId: number | null;
  activeBranches: Branch[];
  activeProducts: Product[];
  canFinalize: boolean;
  onClose: () => void;
  /** After a successful save; `finalize` asks the caller to confirm finalizing the saved order. */
  onSaved: (order: ProductionOrder, finalize: boolean) => void;
}

/**
 * The morning order on a phone: one row per product with its average sales,
 * a tap-to-use suggestion and a stepper. What is typed is kept on the phone
 * until the server has it, so a reload or a call never loses it.
 */
export default function PhoneOrderForm({
  editTarget, filterDate, activeBranchId, activeBranches, activeProducts, canFinalize, onClose, onSaved,
}: PhoneOrderFormProps) {
  const { user } = useAuth();
  const form = useOrderForm({ open: true, editTarget, filterDate, activeBranchId, activeProducts });
  const [dirty, setDirty] = useState(false);
  const [restoredFrom, setRestoredFrom] = useState<string | null>(null);

  const key =
    user && form.branchId != null
      ? orderDraftKey({ userId: user.id, branchId: form.branchId, date: filterDate, orderId: editTarget?.id ?? null })
      : null;

  // Bring back what was typed last time, once the form knows its branch.
  const [checkedKey, setCheckedKey] = useState<string | null>(null);
  if (key && checkedKey !== key) {
    setCheckedKey(key);
    const draft = loadOrderDraft(key);
    if (draft) {
      form.replaceItems(new Map([...form.items, ...draft.items]));
      form.setNotes(draft.notes);
      setRestoredFrom(draft.savedAt);
      setDirty(true);
    }
  }

  // Keep what is typed, as it is typed, until the server has it. No debounce:
  // Android's back button or a reload would drop the last keystrokes.
  useEffect(() => {
    if (!key || !dirty) return;
    saveOrderDraft(key, { items: [...form.items], notes: form.notes, savedAt: new Date().toISOString() });
  }, [key, dirty, form.items, form.notes]);
  const [asking, setAsking] = useState(false);

  const writeDraftNow = () => {
    if (key && dirty) saveOrderDraft(key, { items: [...form.items], notes: form.notes, savedAt: new Date().toISOString() });
  };
  // Closing with changes asks: nothing typed has reached the server, and the
  // card's Finalize would book what the server has.
  const close = () => {
    if (dirty) setAsking(true);
    else onClose();
  };
  const keepOnPhone = () => {
    writeDraftNow();
    onClose();
  };

  const setQty = (productId: number, qty: number) => {
    setDirty(true);
    form.setItem(productId, qty);
  };

  const discard = () => {
    if (key) clearOrderDraft(key);
    const initial = new Map<number, number>();
    activeProducts.forEach((p) => initial.set(p.id, 0));
    editTarget?.items.forEach((i) => initial.set(i.productId, i.yield));
    form.replaceItems(initial);
    form.setNotes(editTarget?.notes ?? '');
    setRestoredFrom(null);
    setDirty(false);
  };

  const save = async (finalize: boolean) => {
    writeDraftNow(); // a failed save must not lose what was typed
    const saved = await form.save();
    if (!saved) return; // the draft stays; the error is shown
    if (key) clearOrderDraft(key);
    setDirty(false);
    onSaved(saved, finalize);
  };

  const products = PRODUCT_TYPE_ORDER.map((t) => [t, form.productsByType.get(t) ?? []] as const);
  const withQty = [...form.items.values()].filter((q) => q > 0).length;
  const branchName = activeBranches.find((b) => b.id === form.branchId)?.name ?? '';
  const title = editTarget ? `Edit PO #${editTarget.id}` : 'New order';

  return (
    <section aria-label={title} className="fixed inset-0 z-50 flex flex-col bg-background">
      <header className="flex items-center gap-2 border-b px-2 py-2">
        <Button variant="ghost" size="icon" className="size-11" aria-label="Close" onClick={close}>
          <X />
        </Button>
        <div className="flex min-w-0 flex-col">
          <h2 className="truncate font-semibold">
            {title}
            {branchName ? ` · ${branchName}` : ''}
          </h2>
          <span className="text-xs text-muted-foreground">Delivery {dayjs(filterDate).format('ddd, MMM D')}</span>
        </div>
      </header>

      <div className="flex flex-col gap-2 border-b px-3 py-2">
        {restoredFrom ? (
          <Alert>
            <AlertDescription className="flex items-center justify-between gap-2">
              <span>Restored your unsaved order from {dayjs(restoredFrom).format('h:mm A')}</span>
              <Button variant="link" className="h-11 px-0" onClick={discard}>
                Discard
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}
        {form.error ? (
          <Alert variant="destructive">
            <AlertDescription>{form.error}</AlertDescription>
          </Alert>
        ) : null}
        {activeBranches.length > 1 && user?.role === 'ADMIN' ? (
          <Select value={form.branchId ? String(form.branchId) : ''} onValueChange={(v) => form.setBranchId(Number(v))}>
            <SelectTrigger className="h-11 w-full" aria-label="Deliver to branch">
              <SelectValue placeholder="Select branch" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {activeBranches.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        ) : null}
        <div className="flex items-center gap-2">
          <Select value={form.suggestPeriod} onValueChange={(v) => form.setSuggestPeriod(v as SuggestionPeriod)}>
            <SelectTrigger className="h-11 flex-1" aria-label="Suggestions from">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="prev-day">From yesterday</SelectItem>
                <SelectItem value="7d">From last 7 days</SelectItem>
                <SelectItem value="30d">From last 30 days</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            className="h-11"
            disabled={form.suggestionByProduct.size === 0}
            onClick={() => {
              setDirty(true);
              form.applyAll();
            }}
          >
            Fill all from suggestions
          </Button>
        </div>
        {form.suggestionsQuery.isError ? (
          <p role="alert" className="text-xs text-destructive">
            Could not load suggestions — you can still enter quantities.
          </p>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto">
        {products.map(([type, prods]) =>
          prods.length === 0 ? null : (
            <Fragment key={type}>
              <div className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {TYPE_LABELS[type]}
              </div>
              {prods.map((p) => {
                const s = form.suggestionByProduct.get(p.id);
                return (
                  <div key={p.id} className="flex min-h-14 items-center gap-2 border-b px-3 py-1.5">
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium">{p.name}</span>
                      {s ? <span className="text-xs text-muted-foreground">avg sold {s.avgSold.toFixed(0)}/day</span> : null}
                    </div>
                    {s ? (
                      <Button
                        variant="outline"
                        className="h-11 shrink-0 border-dashed px-2 font-mono text-xs"
                        aria-label={`Use suggested ${s.suggestedQty} for ${p.name}`}
                        onClick={() => setQty(p.id, s.suggestedQty)}
                      >
                        ↑ {s.suggestedQty}
                      </Button>
                    ) : null}
                    <Stepper
                      label={p.name}
                      value={form.items.get(p.id) ?? 0}
                      onChange={(v) => setQty(p.id, v ?? 0)}
                      className="w-36 shrink-0"
                    />
                  </div>
                );
              })}
            </Fragment>
          ),
        )}
        <div className="flex flex-col gap-1 p-3">
          <Label htmlFor="phone-order-notes">Notes (optional)</Label>
          <Textarea
            id="phone-order-notes"
            value={form.notes}
            onChange={(e) => {
              setDirty(true);
              form.setNotes(e.target.value);
            }}
            className="h-16 resize-none"
          />
        </div>
      </div>

      <footer className="flex items-center gap-2 border-t px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <div className="flex flex-col pr-1">
          <span className="font-semibold tabular-nums">{form.total.toLocaleString()} pcs</span>
          <span className="text-xs text-muted-foreground">
            {withQty} product{withQty === 1 ? '' : 's'}
          </span>
        </div>
        <Button variant="outline" className="h-12 flex-1" disabled={form.saving} onClick={() => save(false)}>
          Save draft
        </Button>
        {editTarget?.status === 'DRAFT' && canFinalize ? (
          <Button className="h-12 flex-1" disabled={form.saving} onClick={() => save(true)}>
            Finalize
          </Button>
        ) : null}
      </footer>

      <AlertDialog open={asking} onOpenChange={setAsking}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save this order?</AlertDialogTitle>
            <AlertDialogDescription>
              Your changes are not saved to the server yet. Keep them on this phone to finish later, or save them now.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => void save(false)}>Save draft</AlertDialogAction>
            <AlertDialogCancel onClick={keepOnPhone}>Keep on this phone</AlertDialogCancel>
            <Button
              variant="ghost"
              className="text-destructive"
              onClick={() => {
                discard();
                setAsking(false);
                onClose();
              }}
            >
              Discard changes
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
