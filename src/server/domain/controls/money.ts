// All reconciliation arithmetic runs in integer cents so totals are exact. Units use six decimals.

export const toCents = (rand: number) => Math.round(rand * 100)
export const fromCents = (cents: number) => cents / 100
export const toMicroUnits = (units: number) => Math.round(units * 1_000_000)
export const fromMicroUnits = (micro: number) => micro / 1_000_000

/** Parses "R 12 345,67", "12,345.67" or "12345.67" into a number, or null when it is not an amount. */
export function parseAmount(raw: string | undefined | null): number | null {
  if (raw === undefined || raw === null) return null
  let s = String(raw).trim().replace(/^R\s*/i, '').replace(/\s/g, '')
  if (!s) return null
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '')
  else if (/^-?\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** Percentage of an amount, rounded half-up to the cent. */
export const pctOfCents = (amountCents: number, pct: number) => Math.round((amountCents * pct) / 100)
