'use client';

import type { CutoffHoliday } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';

type RestDayEmployee = CutoffHoliday['restDayEmployees'][number];

/**
 * The cutoff's holidays. Employees scheduled that day are paid automatically;
 * only those on their rest day need a mark, and only if they came in.
 */
export function HolidaysPanel({
  holidays,
  editable,
  busy,
  onToggle,
}: {
  holidays: CutoffHoliday[];
  /** False once the cutoff is finalized. */
  editable: boolean;
  busy: boolean;
  onToggle: (holiday: CutoffHoliday, employee: RestDayEmployee) => void;
}) {
  if (holidays.length === 0) return null;
  return (
    <Card className="flex flex-col gap-3 p-4">
      <h2 className="font-semibold">Holidays in this cutoff</h2>
      {holidays.map((h) => (
        <div key={h.id} className="flex flex-col gap-2 border-t pt-3 first-of-type:border-t-0 first-of-type:pt-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{h.name}</span>
            <span className="text-sm text-muted-foreground tabular-nums">{h.date}</span>
            <Badge variant={h.type === 'REGULAR' ? 'default' : 'secondary'}>{h.type === 'REGULAR' ? 'Regular' : 'Special'}</Badge>
            {h.isClosed && <Badge variant="outline">Closed</Badge>}
          </div>
          {h.restDayEmployees.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nobody had this day as a rest day.</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">On rest day — switch on if they came in to work:</p>
              {h.restDayEmployees.map((e) => (
                <div key={e.employeeId} className="flex items-center justify-between gap-2">
                  <span>
                    {e.employeeName}
                    {e.stale && <span className="ml-2 text-xs text-muted-foreground">no longer a rest day</span>}
                  </span>
                  <Switch
                    checked={e.markId !== null}
                    disabled={!editable || busy || (!e.stale && h.isClosed)}
                    onCheckedChange={() => onToggle(h, e)}
                    aria-label={`${e.employeeName} worked ${h.name}`}
                  />
                </div>
              ))}
            </>
          )}
        </div>
      ))}
    </Card>
  );
}
