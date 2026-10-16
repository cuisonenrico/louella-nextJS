'use client';

import dayjs from 'dayjs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { usePendingTransfers } from '../PendingTransfersPanel';

/** Transfers this branch must accept or reject, as full-width cards above the count. */
export default function IncomingTransfers({ branchId }: { branchId: number | null }) {
  const { canAnswer, pending, acceptMutation, rejectMutation, busy } = usePendingTransfers(branchId);
  const incoming = pending.filter((t) => t.direction === 'incoming' && t.canRespond && canAnswer);
  if (incoming.length === 0) return null;

  return (
    <div className="mb-3 flex flex-col gap-2">
      {incoming.map((t) => (
        <Card key={t.id} className="border-amber-300 bg-amber-50/60 py-3 shadow-none">
          <CardHeader className="px-3">
            <CardTitle className="text-sm">Incoming from {t.fromBranch.name}</CardTitle>
            <CardDescription>
              {t.value} {t.product.name} · sent {dayjs(t.createdAt).format('h:mm A')}
              {t.notes ? ` · ${t.notes}` : ''}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2 px-3">
            <Button variant="outline" className="h-11 flex-1" disabled={busy} onClick={() => rejectMutation.mutate(t)}>
              Reject
            </Button>
            <Button className="h-11 flex-1" disabled={busy} onClick={() => acceptMutation.mutate(t)}>
              Accept {t.value}
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
