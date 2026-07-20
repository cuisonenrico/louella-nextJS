export type LowStockEntry = {
  id: number;
  name: string;
  unit: string;
  currentStock: number;
  reorderLevel: number;
};

/** Stock as a percentage of the reorder level, clamped to [0, 100]. */
export function severityPct(item: LowStockEntry): number {
  if (item.reorderLevel <= 0) return 0;
  return Math.round(Math.min(100, Math.max(0, (item.currentStock / item.reorderLevel) * 100)));
}

/** Worst first (lowest % of reorder level); ties broken by name. */
export function sortBySeverity(items: LowStockEntry[]): LowStockEntry[] {
  return [...items].sort(
    (a, b) => severityPct(a) - severityPct(b) || a.name.localeCompare(b.name),
  );
}
