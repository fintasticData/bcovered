import type { ContributionRules } from '../../db/benefitsSchema'
import { pctOfCents, toCents } from './money'

export interface ExpectedContribution {
  employer_cents: number
  employee_cents: number
  basis: string
}

/** Expected monthly contributions from pensionable salary and the rules in force for the period. */
export function expectedContribution(monthlySalary: number, category: string, rules: ContributionRules, period: string): ExpectedContribution {
  const holiday = rules.contribution_holiday
  if (holiday && period >= holiday.from && period <= holiday.to) {
    return { employer_cents: 0, employee_cents: 0, basis: `Contribution holiday ${holiday.from} to ${holiday.to}` }
  }
  const rate = rules.categories[category] ?? rules.categories.general
  if (!rate) return { employer_cents: 0, employee_cents: 0, basis: `No rate for category “${category}”` }
  const salary = toCents(monthlySalary)
  return {
    employer_cents: pctOfCents(salary, rate.employer_pct),
    employee_cents: pctOfCents(salary, rate.employee_pct),
    basis: `${category}: employer ${rate.employer_pct}% and employee ${rate.employee_pct}% of pensionable salary`,
  }
}
