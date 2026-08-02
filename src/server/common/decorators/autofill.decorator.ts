import { SetMetadata } from '@nestjs/common';
import type { AutofillScope } from '../../jobs/autofill-on-demand.service';

export const AUTOFILL_SCOPE_KEY = 'autofillScope';

/**
 * Marks a read endpoint as one whose page depends on today's placeholder rows,
 * so AutofillInterceptor tops them up before the handler runs.
 *
 * This is metadata only — no provider is injected — which is what lets
 * material-inventory and production use it without importing JobsModule
 * (JobsModule already imports MaterialInventoryModule; the reverse import
 * would be a cycle).
 */
export const Autofill = (scope: AutofillScope) =>
  SetMetadata(AUTOFILL_SCOPE_KEY, scope);
