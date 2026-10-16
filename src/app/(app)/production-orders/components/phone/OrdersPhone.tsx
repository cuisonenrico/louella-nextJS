'use client';

import dayjs from 'dayjs';
import { ChevronLeft, ChevronRight, ClipboardList, Plus } from 'lucide-react';
import type { Branch, Product, ProductionOrder } from '@/types';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import QueryError from '@/components/QueryError';
import { TableSkeleton } from '@/components/loading/Skeletons';
import { useCan } from '@/lib/rbac/useHasFeature';
import OrderCard from './OrderCard';
import PhoneOrderForm from './PhoneOrderForm';

interface OrdersPhoneProps {
  today: string;
  filterDate: string;
  onDateChange: (date: string) => void;
  isAdmin: boolean;
  activeBranches: Branch[];
  activeBranchId: number | null;
  onBranchChange: (id: number) => void;
  activeProducts: Product[];
  orders: ProductionOrder[];
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  stats: { drafts: number; finalized: number; total: number };
  /** The open form: null = closed, 'new' = a new order, or the draft being edited. */
  form: ProductionOrder | 'new' | null;
  onFormChange: (form: ProductionOrder | 'new' | null) => void;
  onSaved: () => void;
  onFinalize: (order: ProductionOrder) => void;
  onCancel: (order: ProductionOrder) => void;
  onDelete: (order: ProductionOrder) => void;
}

/** Branch Orders on a phone: the day's orders as cards, and the order form full screen. */
export default function OrdersPhone(props: OrdersPhoneProps) {
  const { today, filterDate, onDateChange, orders, stats, form, onFormChange } = props;
  const canCreate = useCan('production-orders:create');
  const canEdit = useCan('production-orders:edit');
  const canDelete = useCan('production-orders:delete');
  const step = (d: number) => onDateChange(dayjs(filterDate).add(d, 'day').format('YYYY-MM-DD'));

  if (form) {
    return (
      <PhoneOrderForm
        editTarget={form === 'new' ? null : form}
        filterDate={filterDate}
        activeBranchId={props.activeBranchId}
        activeBranches={props.activeBranches}
        activeProducts={props.activeProducts}
        canFinalize={canEdit}
        onClose={() => onFormChange(null)}
        onSaved={(order, finalize) => {
          props.onSaved();
          onFormChange(null);
          if (finalize) props.onFinalize(order);
        }}
      />
    );
  }

  return (
    <>
      <div className="-mx-4 -mt-4 mb-3 flex flex-col gap-2 border-b bg-background px-2 py-2">
        {props.isAdmin && props.activeBranches.length > 1 ? (
          <Select value={props.activeBranchId ? String(props.activeBranchId) : undefined} onValueChange={(v) => props.onBranchChange(Number(v))}>
            <SelectTrigger className="h-11 w-full" aria-label="Branch">
              <SelectValue placeholder="Select branch" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {props.activeBranches.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        ) : null}
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="size-11" aria-label="Previous day" onClick={() => step(-1)}>
            <ChevronLeft />
          </Button>
          <Button variant="ghost" className="h-11 flex-1 font-semibold" disabled={filterDate === today} onClick={() => onDateChange(today)}>
            {filterDate === today ? 'Today' : dayjs(filterDate).format('ddd, MMM D')}
          </Button>
          <Button variant="ghost" size="icon" className="size-11" aria-label="Next day" onClick={() => step(1)}>
            <ChevronRight />
          </Button>
        </div>
      </div>

      <p className="mb-2 text-sm text-muted-foreground">
        {orders.length} order{orders.length === 1 ? '' : 's'} · {stats.total.toLocaleString()} pcs · {stats.drafts} draft
        {stats.drafts === 1 ? '' : 's'}
      </p>

      {orders.length > 0 && stats.drafts > 0 && stats.finalized === 0 ? (
        <Alert className="mb-3">
          <AlertDescription>All orders are drafts. Finalize them so the kitchen sees today&apos;s order.</AlertDescription>
        </Alert>
      ) : null}

      {props.isLoading ? (
        <TableSkeleton rows={4} columns={2} className="py-4" />
      ) : props.error ? (
        <QueryError error={props.error} onRetry={props.onRetry} />
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
          <ClipboardList className="size-10 opacity-40" />
          <p>No orders for this day.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              canEdit={canEdit}
              canDelete={canDelete}
              onEdit={() => onFormChange(order)}
              onFinalize={() => props.onFinalize(order)}
              onCancel={() => props.onCancel(order)}
              onDelete={() => props.onDelete(order)}
            />
          ))}
        </div>
      )}

      {canCreate && props.activeBranchId ? (
        <Button
          className="fixed bottom-20 right-4 z-30 h-13 rounded-full px-5 shadow-lg"
          onClick={() => onFormChange('new')}
        >
          <Plus data-icon="inline-start" />
          New order
        </Button>
      ) : null}
    </>
  );
}
