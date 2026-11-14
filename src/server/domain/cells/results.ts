// Cell captive results from imported insurer data and the cell agreement's terms. Inputs are reported; every figure here
// is a B-Covered calculation. Terms differ per agreement, so nothing is assumed beyond what the agreement records.
import type { CellFinancialPeriod, CellTerms } from '../../db/specialistSchema'

export interface CellPeriodResult {
  period_end: string
  gross_written_premium: number
  net_written_premium: number
  earned_premium: number
  incurred_claims: number
  expenses: number
  underwriting_result: number
  investment_income: number
  net_result: number
  loss_ratio: number | null
  expense_ratio: number | null
  combined_ratio: number | null
  cumulative_result: number
  profit_share_accrued: number
  profit_share_movement: number
  solvency_cover: number | null
}

const r2 = (n: number) => Math.round(n * 100) / 100

export function cellResults(periods: CellFinancialPeriod[], terms: CellTerms): CellPeriodResult[] {
  let cumulative = 0
  let accrued = 0
  return [...periods]
    .sort((a, b) => a.period_end.localeCompare(b.period_end))
    .map((p) => {
      const net = p.gross_written_premium - p.reinsurance_premium
      const earned = terms.reporting_basis === 'earned' ? net - p.unearned_premium_movement : net
      const incurred = p.claims_paid + p.outstanding_claims_movement + p.ibnr_movement
      const expenses = p.acquisition_costs + p.management_expenses
      const uw = earned - incurred - expenses
      const result = uw + p.investment_income
      cumulative += result
      const share = terms.profit_share_pct / 100
      const newAccrued = terms.deficit_carry_forward ? Math.max(0, cumulative) * share : accrued + Math.max(0, result) * share
      const movement = newAccrued - accrued
      accrued = newAccrued
      return {
        period_end: p.period_end,
        gross_written_premium: r2(p.gross_written_premium),
        net_written_premium: r2(net),
        earned_premium: r2(earned),
        incurred_claims: r2(incurred),
        expenses: r2(expenses),
        underwriting_result: r2(uw),
        investment_income: r2(p.investment_income),
        net_result: r2(result),
        loss_ratio: earned ? incurred / earned : null,
        expense_ratio: earned ? expenses / earned : null,
        combined_ratio: earned ? (incurred + expenses) / earned : null,
        cumulative_result: r2(cumulative),
        profit_share_accrued: r2(accrued),
        profit_share_movement: r2(movement),
        solvency_cover: p.capital_requirement ? p.reserves_held / p.capital_requirement : null,
      }
    })
}

export function cellTotals(results: CellPeriodResult[]) {
  const sum = (k: keyof CellPeriodResult) => r2(results.reduce((s, r) => s + (r[k] as number), 0))
  const earned = sum('earned_premium')
  const incurred = sum('incurred_claims')
  const expenses = sum('expenses')
  return {
    gross_written_premium: sum('gross_written_premium'),
    earned_premium: earned,
    incurred_claims: incurred,
    expenses,
    underwriting_result: sum('underwriting_result'),
    investment_income: sum('investment_income'),
    net_result: sum('net_result'),
    loss_ratio: earned ? incurred / earned : null,
    expense_ratio: earned ? expenses / earned : null,
    combined_ratio: earned ? (incurred + expenses) / earned : null,
    profit_share_accrued: results.at(-1)?.profit_share_accrued ?? 0,
  }
}
