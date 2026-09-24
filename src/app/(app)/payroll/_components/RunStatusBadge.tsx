import { Badge } from '@/components/ui/badge';

const STYLES = {
  OPEN: { label: 'Open', variant: 'outline' },
  FINALIZED: { label: 'Finalized', variant: 'secondary' },
  PAID: { label: 'Paid', variant: 'default' },
  VOIDED: { label: 'Voided', variant: 'destructive' },
} as const;

export function RunStatusBadge({ status }: { status: keyof typeof STYLES }) {
  const { label, variant } = STYLES[status];
  return <Badge variant={variant}>{label}</Badge>;
}
