const PESO = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });

export function peso(amount: number): string {
  return PESO.format(amount);
}

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export function restDaysLabel(days: readonly number[]): string {
  return days.length === 0 ? 'None' : days.map((d) => WEEKDAYS[d]).join(', ');
}
