/** Shared My Page formatting helpers. */
export { money, moneyOrNotSupplied } from '@/lib/money'

export function freq(f: string | null | undefined): string {
  if (!f) return ''
  if (f === 'monthly') return '/mo'
  if (f === 'annually') return '/yr'
  if (f === 'quarterly') return '/qtr'
  return ` · ${f}`
}

export function insurerPolicyLabel(
  insurer: string | null | undefined,
  policyRef: string | null | undefined,
): string {
  const parts = [insurer, policyRef].filter(Boolean)
  return parts.length ? parts.join(' · ') : '—'
}
