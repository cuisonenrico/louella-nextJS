'use client';

import { Loader2, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { productionApi } from '@/lib/apiServices';
import type { MaterialConsumption } from '@/types';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface MaterialConsumptionDrawerProps {
  consumptionId: number | null;
  plannedYield?: number;
  onClose: () => void;
}

export default function MaterialConsumptionDrawer({ consumptionId, plannedYield, onClose }: MaterialConsumptionDrawerProps) {
  const consumptionQuery = useQuery<MaterialConsumption>({
    queryKey: ['production-consumption', consumptionId, plannedYield],
    queryFn: () => productionApi.materialConsumption(consumptionId!, plannedYield).then((r) => r.data),
    enabled: consumptionId != null,
  });

  return (
    <Sheet open={consumptionId != null} onOpenChange={() => onClose()}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Material Consumption</SheetTitle>
          {consumptionQuery.data && (
            <div className="text-xs text-muted-foreground space-y-0.5">
              <p>{consumptionQuery.data.productName} — {dayjs(consumptionQuery.data.date).format('MMM D, YYYY')}</p>
              <p>Actual yield: {consumptionQuery.data.yield} pcs · Cost based on: {consumptionQuery.data.plannedYield} pcs (planned)</p>
            </div>
          )}
        </SheetHeader>

        <div className="mt-4">
          {consumptionQuery.isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : consumptionQuery.error ? (
            <Alert variant="destructive"><AlertDescription>Failed to load consumption data.</AlertDescription></Alert>
          ) : !consumptionQuery.data || consumptionQuery.data.items.length === 0 ? (
            <Alert><AlertDescription>No recipe configured for this product. Set up a recipe to see material consumption.</AlertDescription></Alert>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Material</TableHead>
                    <TableHead className="text-right">Used</TableHead>
                    <TableHead className="text-right">Unit Cost</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {consumptionQuery.data.items.map((item) => (
                    <TableRow key={item.materialId}>
                      <TableCell className="font-medium">{item.materialName}</TableCell>
                      <TableCell className="text-right">{item.consumed} {item.materialUnit}</TableCell>
                      <TableCell className="text-right">₱{item.pricePerUnit.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-semibold">₱{item.totalCost.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Separator className="my-3" />
              <div className="flex justify-between items-center px-1">
                <span className="text-sm font-bold text-muted-foreground">TOTAL MATERIAL COST</span>
                <span className="text-lg font-extrabold text-primary">₱{consumptionQuery.data.totalMaterialCost.toFixed(2)}</span>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
