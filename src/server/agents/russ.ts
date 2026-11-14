// Russ (Russell), B-Covered's staff assistant: routes requests to the specialist agents and workflows through typed tools.
// Russ prepares work and explains it; approvals, regulated advice and insurer or administrator decisions stay with people.
import { OPEN_EXCEPTION } from '../db/controlsSchema'
import type { Customer } from '../db/schema'
import type { Repo } from '../db/store'
import { ToolError } from '../lib/errors'
import { compound, moneyWeightedReturn, timeWeightedReturn, unusualMovements } from '../domain/investments/performance'
import { checkAuthorisation } from '../tools/adviser'
import { growthOpportunities } from '../tools/growth'
import { rand, type ServicingFinding } from '../tools/life'
import { selfOf } from '../tools/person'
import { invokeTool, type Actor } from '../tools/registry'
import type { CopilotTurn } from './copilotCommands'
import { startContributionRecon, startGroupMovements } from './controlsOrchestrator'
import { startLifeAdvice } from './lifeOrchestrator'

export const LIFE_SUGGESTIONS = [
  'Start life advice for Johan van der Merwe',
  'Run the life servicing scan',
  'Show life policies',
  'Show pending approvals',
]

export const CONTROLS_SUGGESTIONS = [
  'Reconcile the October payroll against the administrator contribution schedule',
  'Identify employers with outstanding contribution reconciliations and prioritise the exceptions',
  'Show financial exceptions',
  'Show pending approvals',
]

const nameAfter = (raw: string, re: RegExp) => {
  const m = raw.match(re)
  return m ? m[1].replace(/[“”"'.?!]+$/g, '').trim() : null
}

function findCustomer(repo: Repo, actor: Actor, name: string): Customer | null {
  const matches = invokeTool<Customer[]>('customer.search', { query: name }, { repo, actor })
  return matches.find((c) => c.full_name.toLowerCase() === name.toLowerCase()) ?? matches[0] ?? null
}

function lifeAdvice(repo: Repo, actor: Actor, raw: string): CopilotTurn {
  const name = nameAfter(raw, /\bfor\s+(.+)$/i)
  if (!name) {
    return { reply: 'Who is the client? For example “Start life advice for Johan van der Merwe”.', view: { kind: 'none' }, suggestions: LIFE_SUGGESTIONS }
  }
  const customer = findCustomer(repo, actor, name)
  if (!customer) return { reply: `I couldn’t find a client called “${name}”.`, view: { kind: 'none' }, suggestions: LIFE_SUGGESTIONS }
  const person = selfOf(repo, customer.id)
  if (!person) {
    return { reply: `${customer.full_name} has no person linked as “self”, so there is no life to advise on yet.`, view: { kind: 'none' }, suggestions: LIFE_SUGGESTIONS }
  }
  const auth = checkAuthorisation(repo, actor.id, 'lt_b1')
  if (!auth.authorised) {
    return {
      reply: `${auth.reason} Switch to Lerato Dube (adviser) or Naledi Mokoena to run life advice. Nothing was started.`,
      view: { kind: 'none' },
      suggestions: ['Run the life servicing scan', 'Show life policies'],
    }
  }
  try {
    const { job, reused } = startLifeAdvice(repo, actor, { customer_id: customer.id, person_id: person.id, adviser_id: actor.id, smoker: false })
    return {
      reply: reused
        ? `${customer.full_name} already has life advice ${job.status.replace(/_/g, ' ')}. Opening it instead of starting a duplicate.`
        : `Starting life advice for ${customer.full_name} under your authorisation. Plan: 1) needs analysis from the financial profile and existing cover, ` +
          '2) simulated quotes from the panel’s rate tables, 3) a draft Record of Advice for your sign-off, 4) the application, held for your approval, ' +
          '5) expected underwriting requirements and follow-ups. Nothing is sent to an insurer; the insurer’s decision is recorded by a person.',
      view: { kind: 'life_case', title: `Life advice: ${customer.full_name}`, customer_id: customer.id, job_id: job.id },
      suggestions: ['Show pending approvals', 'Run the life servicing scan'],
    }
  } catch (e) {
    if (e instanceof ToolError) return { reply: `${e.message}. Nothing was started.`, view: { kind: 'none' }, suggestions: LIFE_SUGGESTIONS }
    throw e
  }
}

function servicing(repo: Repo, actor: Actor): CopilotTurn {
  const findings = invokeTool<ServicingFinding[]>('life.scan_servicing', {}, { repo, actor })
  const fresh = findings.filter((f) => f.created).length
  const by = (c: ServicingFinding['category']) => findings.filter((f) => f.category === c).length
  return {
    reply: findings.length
      ? `${findings.length} servicing item${findings.length === 1 ? '' : 's'} (${fresh} new task${fresh === 1 ? '' : 's'}): ${by('missing_beneficiary')} missing beneficiaries, ` +
        `${by('anniversary')} anniversaries in the next 60 days, ${by('underwriting')} with outstanding underwriting, ${by('shortfall')} cover shortfalls and ${by('compliance')} missing advice records.`
      : 'No servicing items found.',
    view: { kind: 'life_servicing', title: 'Life servicing' },
    suggestions: ['Show life policies', 'Start life advice for Johan van der Merwe'],
  }
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

/** "October" → the most recent October on or before this month, as YYYY-MM-01. Defaults to last month. */
export function periodFrom(t: string, now = new Date()): string {
  const idx = MONTHS.findIndex((m) => t.includes(m))
  const month = idx >= 0 ? idx + 1 : now.getMonth() === 0 ? 12 : now.getMonth()
  const year = month > now.getMonth() + 1 || (idx < 0 && now.getMonth() === 0) ? now.getFullYear() - 1 : now.getFullYear()
  return `${year}-${String(month).padStart(2, '0')}-01`
}

const monthLabel = (period: string) => new Date(`${period}T00:00:00Z`).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric', timeZone: 'UTC' })

/** The employer named in the request, or the only employer with a payroll source. */
function employerFrom(repo: Repo, t: string): Customer | null {
  const employers = repo.list('customers', (c) => c.customer_type === 'commercial' && repo.list('data_sources', (s) => s.customer_id === c.id && s.dataset === 'payroll_schedule').length > 0)
  const named = employers.find((c) => t.includes(c.full_name.toLowerCase().split(' (')[0].split(' ')[0]))
  return named ?? (employers.length ? employers.sort((a, b) => a.full_name.localeCompare(b.full_name))[0] : null)
}

function contributionRecon(repo: Repo, actor: Actor, t: string): CopilotTurn {
  const employer = employerFrom(repo, t)
  if (!employer) return { reply: 'No employer has a payroll source set up yet.', view: { kind: 'none' }, suggestions: CONTROLS_SUGGESTIONS }
  const period = periodFrom(t)
  try {
    const { job, reused, loadedDemo } = startContributionRecon(repo, actor, employer.id, period)
    return {
      reply:
        (reused ? `A ${monthLabel(period)} reconciliation for ${employer.full_name} is already running. Opening it. ` : `Reconciling ${employer.full_name}’s ${monthLabel(period)} payroll against the administrator contribution schedule. `) +
        (loadedDemo ? 'No files had been imported for the period, so I loaded the synthetic demo payroll and schedule. ' : '') +
        'Plan: 1) validate both files, 2) match members by ID number, member or employee number, 3) calculate expected contributions from the rules in force and compare, ' +
        '4) raise one exception per member and problem, 5) prepare a correction schedule for your approval. No money moves and nothing is sent to the administrator.',
      view: { kind: 'reconciliation', title: `Contributions ${monthLabel(period)}: ${employer.full_name}`, run_id: null, job_id: job.id },
      suggestions: ['Show financial exceptions', 'Show pending approvals'],
    }
  } catch (e) {
    if (e instanceof ToolError) return { reply: `${e.message}. Import the files on the Imports screen first.`, view: { kind: 'links', title: 'Imports', items: [{ label: 'Open Imports', to: '/broker/controls/imports', detail: 'Upload the payroll and the administrator schedule' }] }, suggestions: CONTROLS_SUGGESTIONS }
    throw e
  }
}

const SEVERITY_RANK = { critical: 4, high: 3, medium: 2, low: 1 } as const

function prioritiseEmployers(repo: Repo): CopilotTurn {
  const open = repo.list('financial_exceptions', (e) => OPEN_EXCEPTION.includes(e.status))
  const byEmployer = new Map<string, typeof open>()
  open.forEach((e) => e.customer_id && byEmployer.set(e.customer_id, [...(byEmployer.get(e.customer_id) ?? []), e]))
  const ranked = [...byEmployer.entries()]
    .map(([id, list]) => ({ id, list, score: list.reduce((s, e) => s + SEVERITY_RANK[e.severity] * 1_000_000 + Math.abs(e.amount ?? 0), 0) }))
    .sort((a, b) => b.score - a.score)
  const employersWithoutRun = repo
    .list('fund_participations', (p) => p.status === 'active')
    .filter((p) => !repo.find('reconciliation_runs', (r) => r.customer_id === p.employer_customer_id && r.status === 'completed'))
    .map((p) => p.employer_customer_id)
  const items = [
    ...ranked.map((r) => {
      const c = repo.get('customers', r.id)
      const high = r.list.filter((e) => e.severity === 'high' || e.severity === 'critical').length
      return { label: c?.full_name ?? 'Employer', to: `/broker/controls/exceptions?employer=${r.id}`, detail: `${r.list.length} open exceptions (${high} high), ${rand(r.list.reduce((s, e) => s + Math.abs(e.amount ?? 0), 0))} gross`, badge: high ? 'high' : 'open' }
    }),
    ...employersWithoutRun
      .filter((id) => !byEmployer.has(id))
      .map((id) => ({ label: repo.get('customers', id)?.full_name ?? 'Employer', to: `/broker/benefits/employers/${id}`, detail: 'No contribution reconciliation has been run yet', badge: 'pending' })),
  ]
  return {
    reply: items.length
      ? `Prioritised by severity, then amount: ${items.map((i) => i.label).join('; ')}. Employers with no reconciliation at all are listed last as a gap in evidence.`
      : 'No employer has outstanding contribution reconciliation exceptions.',
    view: { kind: 'links', title: 'Employers with outstanding contribution reconciliations', items },
    suggestions: CONTROLS_SUGGESTIONS,
  }
}

function movements(repo: Repo, actor: Actor, t: string): CopilotTurn {
  const employer = employerFrom(repo, t)
  if (!employer) return { reply: 'No employer has a payroll source set up yet.', view: { kind: 'none' }, suggestions: CONTROLS_SUGGESTIONS }
  try {
    const { job, reused, loadedDemo } = startGroupMovements(repo, actor, employer.id)
    return {
      reply:
        (reused ? `Movement processing for ${employer.full_name} is already running. Opening it. ` : `Processing ${employer.full_name}’s employee movements from the latest payroll. `) +
        (loadedDemo ? 'No payroll had been imported, so I loaded the synthetic October file. ' : '') +
        'Plan: 1) validate and match the payroll, and hold the member changes for your approval, 2) recalculate group life cover from the scheme rules in force on each effective date, ' +
        'flagging cover above the free cover limit for underwriting, 3) hold the insurer movement schedule for approval. Nothing is sent to the insurer.',
      view: { kind: 'movements', title: `Movements: ${employer.full_name}`, employer_id: employer.id, job_id: job.id },
      suggestions: ['Show pending approvals', 'Show financial exceptions'],
    }
  } catch (e) {
    if (e instanceof ToolError) return { reply: `${e.message}.`, view: { kind: 'none' }, suggestions: CONTROLS_SUGGESTIONS }
    throw e
  }
}

function transfers(repo: Repo, actor: Actor): CopilotTurn {
  const open = repo.list('fund_transfers', (x) => x.status === 'open')
  const items = open.flatMap((transfer) => {
    const r = invokeTool<{ reconciled: number; differences: number; missing: number }>('transfer.reconcile', { transfer_id: transfer.id }, { repo, actor })
    const from = repo.get('retirement_funds', transfer.transferor_fund_id)?.name ?? 'Transferor'
    const to = repo.get('retirement_funds', transfer.transferee_fund_id)?.name ?? 'Transferee'
    const unreconciled = repo.list('transfer_members', (m) => m.transfer_id === transfer.id && m.status !== 'reconciled')
    return [
      {
        label: `${transfer.transfer_type === 'section_14' ? 'Section 14' : 'Transfer'}: ${from} → ${to}`,
        to: `/broker/transfers/${transfer.id}`,
        detail: `Stage: ${transfer.stage.replace(/_/g, ' ')}. ${r.reconciled} members reconciled, ${r.differences} with a value difference, ${r.missing} allocations not confirmed.`,
        badge: unreconciled.length ? 'awaiting_information' : 'completed',
      },
      ...unreconciled.map((m) => {
        const p = repo.get('persons', m.person_id)
        return {
          label: `${p?.first_names} ${p?.surname}`,
          to: `/broker/transfers/${transfer.id}`,
          detail: m.value_received === null ? `Transfer value ${rand(m.transfer_value_reported)} reported; no allocation confirmed by the transferee` : `Transfer value ${rand(m.transfer_value_reported)} vs allocated ${rand(m.value_received)}`,
          badge: m.status === 'difference' ? 'failed' : 'pending',
        }
      }),
    ]
  })
  return {
    reply: open.length
      ? `${open.length} open transfer${open.length === 1 ? '' : 's'}. I reconciled each member’s transfer value against the transferee’s allocation; unreconciled members are listed with the transfer.`
      : 'There are no open transfers.',
    view: { kind: 'links', title: 'Outstanding transfer items', items },
    suggestions: CONTROLS_SUGGESTIONS,
  }
}

function holdings(repo: Repo, actor: Actor): CopilotTurn {
  const portfolio = repo.list('investment_portfolios', (p) => p.status === 'active')[0]
  if (!portfolio) return { reply: 'No investment portfolios are set up.', view: { kind: 'none' }, suggestions: CONTROLS_SUGGESTIONS }
  const r = invokeTool<{ run: { id: string; difference_count: number; left_only_count: number; right_only_count: number }; exceptions: number; missing_prices: number }>('investment.reconcile_holdings', { portfolio_id: portfolio.id }, { repo, actor })
  return {
    reply: `Reconciled ${portfolio.name}: ${r.run.difference_count} holdings differ between the administrator register and the manager report, ${r.missing_prices} price missing on the register. ${r.exceptions} new exceptions raised.`,
    view: { kind: 'reconciliation', title: `Holdings: ${portfolio.name}`, run_id: r.run.id, job_id: null },
    suggestions: ['Compare our fund’s investment performance with its benchmarks', 'Show financial exceptions'],
  }
}

const pct = (n: number | null) => (n === null || !Number.isFinite(n) ? '–' : `${(n * 100).toFixed(2)}%`)

function performance(repo: Repo): CopilotTurn {
  const portfolio = repo.list('investment_portfolios', (p) => p.status === 'active')[0]
  if (!portfolio) return { reply: 'No investment portfolios are set up.', view: { kind: 'none' }, suggestions: CONTROLS_SUGGESTIONS }
  const points = repo
    .list('investment_valuations', (v) => v.portfolio_id === portfolio.id)
    .sort((a, b) => a.valuation_date.localeCompare(b.valuation_date))
    .map((v) => ({ date: v.valuation_date, market_value: v.market_value, net_cash_flow: v.net_cash_flow }))
  const bench = repo.list('investment_benchmarks', (b) => b.portfolio_id === portfolio.id)
  const twr = timeWeightedReturn(points)
  const mwr = moneyWeightedReturn(points)
  const benchmark = compound(bench.map((b) => b.benchmark_return))
  const unusual = unusualMovements(twr.periods, bench)
  return {
    reply:
      `${portfolio.name}, ${points[0]?.date} to ${points.at(-1)?.date} (calculated by B-Covered from manager valuations, not official fund returns): ` +
      `time-weighted return ${pct(twr.cumulative)} against the benchmark’s ${pct(benchmark)}, so ${pct(twr.cumulative - benchmark)} relative; money-weighted return ${pct(mwr.annualised)} a year. ` +
      (unusual.length
        ? `Unusual months (more than 0.6 percentage points from the benchmark): ${unusual.map((u) => `${u.date.slice(0, 7)} ${pct(u.portfolio)} vs ${pct(u.benchmark)}`).join('; ')}. These are observations to investigate, not conclusions.`
        : 'No month deviated from the benchmark by more than 0.6 percentage points.'),
    view: { kind: 'links', title: 'Investment performance', items: [{ label: portfolio.name, to: `/broker/investments/${portfolio.id}`, detail: `${twr.method}. Benchmark: ${portfolio.mandate.benchmark}.` }] },
    suggestions: ['Reconcile the holdings against the manager report', 'Show financial exceptions'],
  }
}

function cellCommand(repo: Repo, actor: Actor): CopilotTurn {
  const cell = repo.list('cell_arrangements', (c) => c.status === 'active')[0]
  if (!cell) return { reply: 'No cell captive arrangements are set up.', view: { kind: 'none' }, suggestions: COPILOT_SUGGESTION_FALLBACK }
  const report = invokeTool<{ totals: { gross_written_premium: number; loss_ratio: number | null; expense_ratio: number | null; combined_ratio: number | null; underwriting_result: number; net_result: number; profit_share_accrued: number }; results: Array<{ period_end: string; loss_ratio: number | null; underwriting_result: number }> }>(
    'cell.prepare_report',
    { cell_id: cell.id },
    { repo, actor },
  )
  const last = report.results.at(-1)
  const worst = [...report.results].sort((a, b) => (b.loss_ratio ?? 0) - (a.loss_ratio ?? 0))[0]
  return {
    reply:
      `${cell.name}, ${report.results[0]?.period_end.slice(0, 7)} to ${last?.period_end.slice(0, 7)}, calculated from Aloe’s reported accounts and the cell agreement terms: gross written premium ${rand(report.totals.gross_written_premium)}, ` +
      `loss ratio ${pct(report.totals.loss_ratio)}, expense ratio ${pct(report.totals.expense_ratio)}, combined ratio ${pct(report.totals.combined_ratio)}, underwriting result ${rand(report.totals.underwriting_result)} and net result ${rand(report.totals.net_result)}. ` +
      `Profit share accrued under the agreement: ${rand(report.totals.profit_share_accrued)}. Highest monthly loss ratio: ${worst?.period_end.slice(0, 7)} at ${pct(worst?.loss_ratio ?? null)}. The report is saved as evidence; nothing is sent to the cell owner.`,
    view: { kind: 'links', title: 'Cell captive report', items: [{ label: cell.name, to: `/broker/cells/${cell.id}`, detail: 'Monthly results, ratios and the profit-share accrual' }] },
    suggestions: ['Show financial exceptions', 'Show pending approvals'],
  }
}

const COPILOT_SUGGESTION_FALLBACK = ['Show pending approvals', 'Show financial exceptions']

function growth(repo: Repo): CopilotTurn {
  const items = growthOpportunities(repo)
  return {
    reply: items.length ? `${items.length} opportunities from records already held. These are prompts for a broker to review, not advice.` : 'No opportunities found in the current records.',
    view: { kind: 'links', title: 'Growth opportunities', items: items.map((o) => ({ label: o.label, to: o.to, detail: o.detail, badge: 'open' })) },
    suggestions: LIFE_SUGGESTIONS,
  }
}

function trusteePack(repo: Repo, actor: Actor): CopilotTurn {
  const fund = repo.list('retirement_funds', (f) => f.status === 'active' && repo.list('fund_participations', (p) => p.fund_id === f.id).length > 0)[0]
  if (!fund) return { reply: 'No retirement fund is set up.', view: { kind: 'none' }, suggestions: COPILOT_SUGGESTION_FALLBACK }
  const pack = invokeTool<{ id: string; sections: unknown[] }>('governance.build_pack', { fund_id: fund.id, period_end: new Date().toISOString().slice(0, 10) }, { repo, actor })
  return {
    reply: `Draft trustee pack for ${fund.name} prepared with ${pack.sections.length} sections, each labelled reported or calculated. Review it and issue it yourself; it records information and decisions, it does not make them.`,
    view: { kind: 'links', title: 'Trustee pack', items: [{ label: `${fund.name} pack (draft)`, to: `/broker/governance/packs/${pack.id}`, detail: 'Financial summary, contributions, investments, administration, benefit events, transfers, risks, actions and decisions' }] },
    suggestions: COPILOT_SUGGESTION_FALLBACK,
  }
}

/** Russ's routing. Returns null when the request belongs to the personal or commercial command sets. */
export function russCommand(repo: Repo, actor: Actor, raw: string, t: string): CopilotTurn | null {
  if (/cell captive|\bcell\b.*report/.test(t)) return cellCommand(repo, actor)
  if (/investment performance|benchmark|unusual movement/.test(t)) return performance(repo)
  if (/cross[\s-]?sell|opportunit|growth|underserved|financial review/.test(t)) return growth(repo)
  if (/trustee|meeting pack|governance pack/.test(t)) return trusteePack(repo, actor)
  if (/movement|group life cover/.test(t)) return movements(repo, actor, t)
  if (/section 14|transfer/.test(t) && !/quote/.test(t)) return transfers(repo, actor)
  if (/holding|unit register|investment reconcil|reconcile .*investment/.test(t)) return holdings(repo, actor)
  if (/reconcil/.test(t) && /payroll|contribution/.test(t) && !/outstanding|prioriti/.test(t)) return contributionRecon(repo, actor, t)
  if (/outstanding (contribution )?reconciliation|prioriti[sz]e/.test(t)) return prioritiseEmployers(repo)
  if (/financial exceptions?|exceptions? (dashboard|list)|show (the |all )?exceptions/.test(t)) {
    const count = repo.list('financial_exceptions', (e) => OPEN_EXCEPTION.includes(e.status)).length
    return { reply: `${count} open financial exception${count === 1 ? '' : 's'}.`, view: { kind: 'exceptions', title: 'Financial exceptions', customer_id: null }, suggestions: CONTROLS_SUGGESTIONS }
  }
  if (/\b(life advice|needs analysis|record of advice|advise)\b.*\bfor\b/.test(t) || /\blife (cover|insurance|quote)\b.*\bfor\b/.test(t)) return lifeAdvice(repo, actor, raw)
  if (/servicing|missing beneficiar|anniversar|cover shortfall/.test(t)) return servicing(repo, actor)
  if (/\b(life )?polic(y|ies)\b/.test(t) && !/submission/.test(t)) {
    const name = nameAfter(raw, /\bfor\s+(.+)$/i)
    const customer = name ? findCustomer(repo, actor, name) : null
    const count = repo.list('policies', (p) => p.line === 'individual_life' && (!customer || p.customer_id === customer.id)).length
    return {
      reply: `${count} individual life polic${count === 1 ? 'y' : 'ies'}${customer ? ` for ${customer.full_name}` : ''}. Premiums shown are monthly.`,
      view: { kind: 'policies', title: customer ? `Policies: ${customer.full_name}` : 'Individual life policies', customer_id: customer?.id ?? null },
      suggestions: LIFE_SUGGESTIONS,
    }
  }
  return null
}
