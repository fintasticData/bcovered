import type { FinancialProfile, NeedLine, ProductRules, QuotedBenefit, RateBand } from '../../db/lifeSchema'

export const NEED_LABEL: Record<string, string> = {
  life: 'Life cover',
  disability_lump_sum: 'Disability lump sum',
  income_protection: 'Income protection (monthly benefit)',
  critical_illness: 'Critical illness',
  funeral: 'Funeral cover',
}

const roundTo = (n: number, step: number) => Math.round(n / step) * step

export interface ExistingCover {
  life: number
  disability_lump_sum: number
  income_protection: number
  critical_illness: number
}

/**
 * A transparent needs model for illustration. Each line states its basis so the adviser can change it; it is an input to
 * advice, not advice.
 */
export function analyseNeeds(profile: FinancialProfile, existing: ExistingCover, financialDependants: number): NeedLine[] {
  const gross = profile.gross_monthly_income ?? 0
  const net = profile.net_monthly_income ?? 0
  const debt = profile.outstanding_debt ?? 0
  const years = financialDependants > 0 ? 10 : 3
  const line = (key: keyof ExistingCover, required: number, basis: string, step: number): NeedLine => {
    const r = roundTo(required, step)
    return { benefit_type_key: key, label: NEED_LABEL[key], required: r, existing: existing[key], shortfall: Math.max(0, r - existing[key]), basis }
  }
  return [
    line('life', debt + net * 12 * years, `Outstanding debt plus ${years} years of net income (${financialDependants} financial dependant${financialDependants === 1 ? '' : 's'})`, 10_000),
    line('disability_lump_sum', debt + gross * 12 * 5, 'Outstanding debt plus five years of gross income', 10_000),
    line('income_protection', gross * 0.75, '75% of gross monthly income, the usual insurer maximum', 500),
    line('critical_illness', gross * 12, 'One year of gross income', 10_000),
  ]
}

export function rateFor(bands: RateBand[] | undefined, age: number): number | null {
  if (!bands?.length) return null
  return bands.find((b) => age <= b.max_age)?.rate ?? null
}

const cents = (n: number) => Math.round(n * 100) / 100

export interface PricedOption {
  benefits: QuotedBenefit[]
  monthly_premium: number
  policy_fee: number
  underwriting_expected: string[]
}

/**
 * Prices requested benefits from a product's rate table. Income protection is quoted per R1 000 of annual benefit.
 * Returns null when the life is outside the product's entry ages or the product offers none of the benefits.
 */
export function priceFromRates(rules: ProductRules, requested: Array<{ benefit_type_key: string; sum_assured: number }>, age: number, smoker: boolean): PricedOption | null {
  if (age < rules.min_entry_age || age > rules.max_entry_age) return null
  const loading = smoker ? 1 + rules.smoker_loading_pct / 100 : 1
  const benefits: QuotedBenefit[] = []
  for (const r of requested) {
    const rate = rateFor(rules.rates_per_1000[r.benefit_type_key], age)
    if (rate === null || r.sum_assured <= 0) continue
    const annualBase = r.benefit_type_key === 'income_protection' ? r.sum_assured * 12 : r.sum_assured
    benefits.push({ benefit_type_key: r.benefit_type_key, sum_assured: r.sum_assured, monthly_premium: cents(((annualBase / 1000) * rate * loading) / 12) })
  }
  if (!benefits.length) return null
  const lumpSum = Math.max(0, ...benefits.filter((b) => b.benefit_type_key !== 'income_protection').map((b) => b.sum_assured))
  const underwriting = rules.underwriting.filter((u) => lumpSum > u.above_sum_assured).map((u) => u.requirement)
  const premium = cents(benefits.reduce((s, b) => s + b.monthly_premium, 0) + rules.monthly_policy_fee)
  return { benefits, monthly_premium: premium, policy_fee: rules.monthly_policy_fee, underwriting_expected: underwriting }
}
