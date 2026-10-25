/** What the branches were given against what was baked. */
export function allocation(yieldVal: number, branchValues: number[]): { assigned: number; over: boolean } {
  const assigned = branchValues.reduce((sum, v) => sum + v, 0);
  return { assigned, over: assigned > yieldVal };
}

/**
 * Where the yield stepper starts. A product planned but with nothing stored
 * starts at the plan (as the desktop board pre-fills it), shown as not saved.
 */
export function startingYield(stored: number, planned: number): { value: number; fromPlan: boolean } {
  return stored === 0 && planned > 0 ? { value: planned, fromPlan: true } : { value: stored, fromPlan: false };
}
