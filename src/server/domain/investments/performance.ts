// Performance calculations from dated valuations. Results are B-Covered calculations, labelled as such, never official
// fund returns. Convention: each period's net external cash flow is treated as arriving at the start of the period.

export interface ValuationPoint {
  date: string
  market_value: number
  /** Net external cash flow for the period ending at this date. Ignored for the first point. */
  net_cash_flow: number
}

export interface TwrResult {
  method: string
  periods: Array<{ date: string; return: number }>
  cumulative: number
  annualised: number | null
}

/** Time-weighted return: chain-linked sub-period returns, r = MV_end / (MV_start + CF) − 1. */
export function timeWeightedReturn(points: ValuationPoint[]): TwrResult {
  const periods = points.slice(1).map((p, i) => ({ date: p.date, return: p.market_value / (points[i].market_value + p.net_cash_flow) - 1 }))
  const cumulative = periods.reduce((acc, p) => acc * (1 + p.return), 1) - 1
  const years = points.length > 1 ? (Date.parse(points[points.length - 1].date) - Date.parse(points[0].date)) / (365.25 * 86_400_000) : 0
  return {
    method: 'Time-weighted, monthly sub-periods chain-linked; cash flows at the start of each period',
    periods,
    cumulative,
    annualised: years >= 1 ? (1 + cumulative) ** (1 / years) - 1 : null,
  }
}

export interface MwrResult {
  method: string
  periodic: number
  annualised: number
  converged: boolean
}

/** Money-weighted return: the internal rate of return of the portfolio's cash flows, with monthly periods. */
export function moneyWeightedReturn(points: ValuationPoint[]): MwrResult {
  const n = points.length - 1
  // Investor perspective: outflows into the portfolio are negative, the closing value is a positive inflow.
  const flows: Array<{ t: number; amount: number }> = [{ t: 0, amount: -points[0].market_value }]
  points.slice(1).forEach((p, i) => flows.push({ t: i, amount: -p.net_cash_flow }))
  flows.push({ t: n, amount: points[n].market_value })
  const npv = (r: number) => flows.reduce((s, f) => s + f.amount / (1 + r) ** f.t, 0)
  let lo = -0.5
  let hi = 0.5
  let converged = false
  let mid = 0
  for (let i = 0; i < 200; i++) {
    mid = (lo + hi) / 2
    const v = npv(mid)
    if (Math.abs(v) < 1e-6) {
      converged = true
      break
    }
    if (npv(lo) * v < 0) hi = mid
    else lo = mid
  }
  if (!converged) converged = Math.abs(npv(mid)) < 1
  return { method: 'Money-weighted (internal rate of return), monthly periods, annualised by compounding', periodic: mid, annualised: (1 + mid) ** 12 - 1, converged }
}

export const compound = (returns: number[]) => returns.reduce((acc, r) => acc * (1 + r), 1) - 1

export interface AllocationCheck {
  asset_class: string
  weight: number
  min: number
  max: number
  breach: boolean
}

/** Asset allocation by class against the mandate ranges (percentages). */
export function mandateCheck(holdings: Array<{ asset_class: string; market_value: number | null }>, ranges: Record<string, { min: number; max: number }>): AllocationCheck[] {
  const total = holdings.reduce((s, h) => s + (h.market_value ?? 0), 0)
  const by = new Map<string, number>()
  holdings.forEach((h) => by.set(h.asset_class, (by.get(h.asset_class) ?? 0) + (h.market_value ?? 0)))
  return Object.entries(ranges).map(([asset_class, range]) => {
    const weight = total ? ((by.get(asset_class) ?? 0) / total) * 100 : 0
    return { asset_class, weight, min: range.min, max: range.max, breach: weight < range.min || weight > range.max }
  })
}

/** Months whose return deviates from the benchmark by more than the threshold, for Russ to point at. */
export function unusualMovements(periods: Array<{ date: string; return: number }>, benchmark: Array<{ period_end: string; benchmark_return: number }>, threshold = 0.006) {
  return periods
    .map((p) => {
      const b = benchmark.find((x) => x.period_end === p.date)
      return b ? { date: p.date, portfolio: p.return, benchmark: b.benchmark_return, difference: p.return - b.benchmark_return } : null
    })
    .filter((x): x is { date: string; portfolio: number; benchmark: number; difference: number } => Boolean(x && Math.abs(x.difference) > threshold))
}
