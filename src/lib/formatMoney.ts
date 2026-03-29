/** Display cents as dollars — `$` with grouping; avoids `US$` from locale defaults. */
export function formatMoney(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    currencyDisplay: 'narrowSymbol',
    maximumFractionDigits: 2,
  }).format(cents / 100);
}
