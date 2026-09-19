'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { ArrowDownLeft, ArrowUpRight, Check, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { inventoryAdjustmentsApi } from '@/lib/apiServices';
import { extractError } from '@/lib/errors';
import { useCan } from '@/lib/rbac/useHasFeature';
import type { PendingTransfer } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

export const PENDING_TRANSFERS_KEY = ['pending-transfers'] as const;

/**
 * Transfers waiting for the receiving branch to confirm.
 *
 * Stock leaves the sender when a transfer is sent, but reaches the receiver
 * only when someone there accepts it (decision 2026-09-19). Until then it is
 * flagged here on both branches: the receiver can accept or reject, the
 * sender sees it is still awaiting an answer. Renders nothing when nothing is
 * pending, or when the caller cannot see adjustments.
 */
export default function PendingTransfersPanel({ branchId }: { branchId?: number | null }) {
  const qc = useQueryClient();
  const canSee = useCan('inventory-adjustments');
  const canAnswer = useCan('inventory-adjustments:transfer');

  const { data: pending = [] } = useQuery({
    queryKey: [...PENDING_TRANSFERS_KEY, branchId ?? 'all'],
    queryFn: () =>
      inventoryAdjustmentsApi.pendingTransfers(branchId ?? undefined).then((r) => r.data),
    enabled: canSee,
  });

  const onAnswered = (message: string) => {
    qc.invalidateQueries({ queryKey: PENDING_TRANSFERS_KEY });
    qc.invalidateQueries({ queryKey: ['inventory'] });
    toast.success(message);
  };

  const acceptMutation = useMutation({
    mutationFn: (t: PendingTransfer) => inventoryAdjustmentsApi.acceptTransfer(t.id),
    onSuccess: (_r, t) => onAnswered(`Accepted ${t.value} ${t.product.name} from ${t.fromBranch.name}`),
    onError: (err) => toast.error(extractError(err)),
  });
  const rejectMutation = useMutation({
    mutationFn: (t: PendingTransfer) => inventoryAdjustmentsApi.rejectTransfer(t.id),
    onSuccess: (_r, t) => onAnswered(`Rejected — ${t.value} ${t.product.name} returned to ${t.fromBranch.name}`),
    onError: (err) => toast.error(extractError(err)),
  });
  const busy = acceptMutation.isPending || rejectMutation.isPending;

  if (!canSee || pending.length === 0) return null;

  return (
    <Card className="mb-4">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          Transfers awaiting confirmation <Badge variant="secondary">{pending.length}</Badge>
        </CardTitle>
        <CardDescription>
          The sending branch has already given this stock up. The receiving branch counts it only once it accepts.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {pending.map((t, i) => (
          <div key={t.id} className="flex flex-col gap-2">
            {i > 0 && <Separator />}
            <div className="flex flex-wrap items-center gap-2">
              {t.direction === 'outgoing' ? (
                <Badge variant="outline"><ArrowUpRight data-icon="inline-start" />Sent</Badge>
              ) : (
                <Badge variant="outline"><ArrowDownLeft data-icon="inline-start" />Incoming</Badge>
              )}
              <span className="font-medium">
                {t.value} × {t.product.name}
              </span>
              <span className="text-sm text-muted-foreground">
                {t.fromBranch.name} → {t.toBranch?.name ?? 'deleted day'} · {dayjs(t.date).format('MMM D')}
                {t.notes ? ` · ${t.notes}` : ''}
              </span>
              <div className="ml-auto flex gap-2">
                {t.canRespond && canAnswer ? (
                  <>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => rejectMutation.mutate(t)}>
                      {rejectMutation.isPending && rejectMutation.variables?.id === t.id
                        ? <Loader2 data-icon="inline-start" className="animate-spin" />
                        : <X data-icon="inline-start" />}
                      Reject
                    </Button>
                    <Button size="sm" disabled={busy} onClick={() => acceptMutation.mutate(t)}>
                      {acceptMutation.isPending && acceptMutation.variables?.id === t.id
                        ? <Loader2 data-icon="inline-start" className="animate-spin" />
                        : <Check data-icon="inline-start" />}
                      Accept
                    </Button>
                  </>
                ) : (
                  <Badge variant="secondary">Awaiting {t.toBranch?.name ?? 'receiver'}</Badge>
                )}
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
