import type { PayslipLineView, PayslipRecord, PayrollRunStatus } from '@/types';
import { formatCutoff } from '@/lib/payroll/cutoff';
import { peso } from '@/lib/payroll/format';
import { cn } from '@/lib/utils';

const cents = (n: number) => Math.round(n * 100);

function Section({ title, lines, total }: { title: string; lines: PayslipLineView[]; total: number }) {
  return (
    <section className="mb-3">
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">{title}</h3>
      <ul className="space-y-0.5">
        {lines.map((l, i) => (
          <li key={i} className="flex justify-between gap-4">
            <span>
              {l.label}
              {l.type === 'BASIC' && l.quantity !== null && l.rate !== null && (
                <span className="text-neutral-500"> ({l.quantity} days × {peso(l.rate)})</span>
              )}
            </span>
            <span className="tabular-nums">{peso(l.amount)}</span>
          </li>
        ))}
        {lines.length === 0 && <li className="text-neutral-500">None</li>}
      </ul>
      <p className="mt-1 flex justify-between border-t border-dashed pt-1 font-medium">
        <span>Total {title.toLowerCase()}</span>
        <span className="tabular-nums">{peso(total)}</span>
      </p>
    </section>
  );
}

/**
 * One printable payslip, rendered only from the frozen snapshot. Employer
 * shares are the bakery's cost, not the employee's, so they are left off.
 */
export function PayslipView({
  slip,
  run,
  className,
}: {
  slip: PayslipRecord;
  run: { periodStart: string; periodEnd: string; status: PayrollRunStatus };
  className?: string;
}) {
  const earnings = slip.lines.filter((l) => l.type === 'BASIC' || l.type === 'ADDITION');
  const deductions = slip.lines.filter((l) => l.type === 'DEDUCTION');

  return (
    <article className={cn('rounded-lg border bg-white p-6 text-sm text-black print:break-inside-avoid', className)}>
      {run.status === 'VOIDED' && (
        <p role="status" className="mb-3 rounded border-2 border-red-600 px-2 py-1 text-center font-bold uppercase tracking-widest text-red-600">
          Voided — not valid for payment
        </p>
      )}
      <header className="mb-4 flex justify-between gap-4 border-b pb-3">
        <div>
          <h2 className="text-lg font-bold">Louella Bakery</h2>
          <p>Payslip · {formatCutoff(run)}</p>
        </div>
        <div className="text-right">
          <p className="font-semibold">{slip.employeeName}</p>
          <p>{slip.jobRoleName}{slip.branchName ? ` · ${slip.branchName}` : ''}</p>
        </div>
      </header>
      <p className="mb-3">
        Days worked: {slip.daysWorked} of {slip.workingDays}
        {slip.absenceDays > 0 ? ` (${slip.absenceDays} absent)` : ''}
      </p>
      <Section title="Earnings" lines={earnings} total={(cents(slip.basicPay) + cents(slip.totalAdditions)) / 100} />
      <Section title="Deductions" lines={deductions} total={slip.totalDeductions} />
      <footer className="mt-4 flex justify-between border-t-2 pt-3 text-base font-bold">
        <span>Net pay</span>
        <span data-testid="net-pay" className="tabular-nums">{peso(slip.netPay)}</span>
      </footer>
    </article>
  );
}
