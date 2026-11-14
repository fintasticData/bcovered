// Two-pot retirement system parameters as dated configuration, not permanent assumptions. B-Covered displays
// administrator-reported component values; it never authorises a withdrawal or determines tax.
// These parameters must be confirmed against current legislation and administrator rules before production use.

export interface TwoPotRules {
  effective_from: string
  savings_share: number
  retirement_share: number
  seed_capital_pct: number
  seed_capital_cap: number
  minimum_withdrawal: number
  withdrawals_per_tax_year: number
  source_note: string
}

export const TWO_POT_RULES: TwoPotRules[] = [
  {
    effective_from: '2024-09-01',
    savings_share: 1 / 3,
    retirement_share: 2 / 3,
    seed_capital_pct: 10,
    seed_capital_cap: 30_000,
    minimum_withdrawal: 2_000,
    withdrawals_per_tax_year: 1,
    source_note: 'Configured from the two-pot framework effective 1 September 2024. Compliance must confirm before production activation.',
  },
]

export function twoPotRulesOn(date: string): TwoPotRules | null {
  return TWO_POT_RULES.filter((r) => r.effective_from <= date).sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0] ?? null
}

/**
 * An indicator only: whether the reported savings component is at or above the configured minimum. The administrator
 * decides eligibility, and SARS issues the tax directive.
 */
export function savingsWithdrawalIndicator(savingsComponent: number, date: string): { indicator: 'may_qualify' | 'below_minimum' | 'no_rules'; note: string } {
  const rules = twoPotRulesOn(date)
  if (!rules) return { indicator: 'no_rules', note: 'No two-pot rules are configured for this date.' }
  return savingsComponent >= rules.minimum_withdrawal
    ? { indicator: 'may_qualify', note: `Reported savings component is at or above the configured R${rules.minimum_withdrawal.toLocaleString('en-ZA')} minimum. The administrator decides; tax is per the SARS directive.` }
    : { indicator: 'below_minimum', note: `Reported savings component is below the configured R${rules.minimum_withdrawal.toLocaleString('en-ZA')} minimum.` }
}
