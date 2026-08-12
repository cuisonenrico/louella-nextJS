/**
 * Quotes a CSV cell value (doubling embedded quotes) and neutralizes a
 * leading =, +, -, or @ by prefixing a single quote, so spreadsheet programs
 * never interpret exported, user-entered data (product/branch names, etc.)
 * as a formula (CSV/formula injection).
 */
export function csvField(value: string | number): string {
  let str = String(value);
  if (/^[=+\-@]/.test(str)) {
    str = `'${str}`;
  }
  return `"${str.replace(/"/g, '""')}"`;
}
