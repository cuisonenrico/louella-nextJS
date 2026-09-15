/**
 * Quotes a CSV cell value (doubling embedded quotes) and neutralizes a
 * leading =, +, -, @, tab, carriage return or | by prefixing a single quote,
 * so spreadsheet programs never interpret exported, user-entered data
 * (product/branch names, etc.) as a formula (CSV/formula injection). Tab and
 * carriage return matter because some spreadsheets strip leading whitespace
 * before deciding whether a cell is a formula.
 */
export function csvField(value: string | number): string {
  let str = String(value);
  if (/^[=+\-@\t\r|]/.test(str)) {
    str = `'${str}`;
  }
  return `"${str.replace(/"/g, '""')}"`;
}
