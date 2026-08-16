import type { ProductType, UnknownDecision, UnknownProduct } from '@/types';

export interface ResolvedDecisions {
  /** Labels to turn into products, with the operator's chosen type. */
  createProducts: { label: string; type: ProductType }[];
  /** Labels to import without, acknowledged rather than silently dropped. */
  acknowledgeUnmatched: string[];
  /** Labels still awaiting a decision; any of these blocks the import. */
  undecided: UnknownProduct[];
}

/**
 * Splits the preview's unknown labels into the two lists the import endpoint
 * expects, plus whatever is still outstanding.
 *
 * Driven by `unknownProducts` rather than by the decision map, so a decision
 * left over from a previous preview cannot leak into the request — the server
 * rejects create requests for labels the workbook does not contain.
 */
export function resolveDecisions(
  unknownProducts: UnknownProduct[],
  decisions: Record<string, UnknownDecision>,
): ResolvedDecisions {
  const createProducts: { label: string; type: ProductType }[] = [];
  const acknowledgeUnmatched: string[] = [];
  const undecided: UnknownProduct[] = [];

  for (const unknown of unknownProducts) {
    const decision = decisions[unknown.label];
    if (!decision) {
      undecided.push(unknown);
    } else if (decision.kind === 'create') {
      createProducts.push({ label: unknown.label, type: decision.type });
    } else {
      acknowledgeUnmatched.push(unknown.label);
    }
  }

  return { createProducts, acknowledgeUnmatched, undecided };
}
