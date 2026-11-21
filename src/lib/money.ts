/** Shared Rand formatting for broker desks, portal, and Fintastic. */

const zar0 = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 })
const zar2 = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Rand amount. Whole rands by default; exact cents when `exact` is true. Null → en-dash. */
export function zar(n: number | null | undefined, exact = false): string {
  if (n === null || n === undefined) return '–'
  return (exact ? zar2 : zar0).format(n).replace('ZAR', 'R')
}

/** Portal-style amount; null/NaN → null so callers can choose a fallback label. */
export function money(n: number | null | undefined): string | null {
  if (n == null || Number.isNaN(Number(n))) return null
  return `R${Number(n).toLocaleString('en-ZA')}`
}

/** Declared/insured values on My Page: missing amounts read as “Value not supplied”. */
export function moneyOrNotSupplied(n: number | null | undefined): string {
  return money(n) ?? 'Value not supplied'
}
