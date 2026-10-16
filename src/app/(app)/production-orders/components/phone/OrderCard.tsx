'use client';

import dayjs from 'dayjs';
import { MoreHorizontal } from 'lucide-react';
import type { ProductionOrder, ProductionOrderStatus } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const STATUS: Record<ProductionOrderStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' }> = {
  DRAFT: { label: 'Draft', variant: 'secondary' },
  FINALIZED: { label: 'Finalized', variant: 'default' },
  CANCELLED: { label: 'Cancelled', variant: 'destructive' },
};

interface OrderCardProps {
  order: ProductionOrder;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onFinalize: () => void;
  onCancel: () => void;
  onDelete: () => void;
}

/** One order: what it asks for at a glance, with thumb-size Edit / Finalize; the rest behind ⋯. */
export default function OrderCard({ order, canEdit, canDelete, onEdit, onFinalize, onCancel, onDelete }: OrderCardProps) {
  const items = order.items.filter((i) => i.yield > 0);
  const total = items.reduce((sum, i) => sum + i.yield, 0);
  const status = STATUS[order.status];
  const isDraft = order.status === 'DRAFT';
  const title = `PO #${order.id}`;

  return (
    <Card role="article" aria-label={title} className="gap-2 py-3 shadow-none">
      <CardHeader className="flex-row items-center justify-between gap-2 px-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          {title} <Badge variant={status.variant}>{status.label}</Badge>
        </CardTitle>
        {isDraft && (canEdit || canDelete) ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-11" aria-label="More actions">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                {canEdit ? <DropdownMenuItem onSelect={onCancel}>Cancel order</DropdownMenuItem> : null}
                {canDelete ? (
                  <DropdownMenuItem className="text-destructive" onSelect={onDelete}>
                    Delete
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-2 px-3">
        <p className="text-xs text-muted-foreground">
          {dayjs(order.createdAt).format('h:mm A')} · {items.length} product{items.length === 1 ? '' : 's'} ·{' '}
          <span className="font-semibold text-foreground">{total.toLocaleString()} pcs</span>
        </p>
        {items.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {items.slice(0, 3).map((i) => (
              <Badge key={i.id} variant="outline" className="font-normal">
                {i.product?.name ?? `#${i.productId}`} {i.yield}
              </Badge>
            ))}
            {items.length > 3 ? <Badge variant="outline" className="font-normal">+{items.length - 3} more</Badge> : null}
          </div>
        ) : null}
        {order.notes ? <p className="text-xs text-muted-foreground">{order.notes}</p> : null}
      </CardContent>
      {isDraft && canEdit ? (
        <CardFooter className="gap-2 px-3">
          <Button variant="outline" className="h-11 flex-1" onClick={onEdit}>
            Edit
          </Button>
          <Button className="h-11 flex-1" onClick={onFinalize}>
            Finalize
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  );
}
