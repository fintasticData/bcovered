import { z } from 'zod'
import { TRANSFER_STAGES, type BenefitEvent, type MemberMovement, type SchemeRules } from '../db/benefitsSchema'
import type { ReconciliationRun } from '../db/controlsSchema'
import type { Repo } from '../db/store'
import { fromCents, fromMicroUnits, toCents, toMicroUnits } from '../domain/controls/money'
import { reconcile, type ReconEntry, type ReconResult } from '../domain/controls/reconcile'
import { ageOn } from '../domain/life/identity'
import { ToolError } from '../lib/errors'
import { registerApprovalSubject, requestApproval } from './approval'
import { captureEvidence, r2, raiseExceptions } from './controls'
import { defineTool, STAFF, type ToolDef } from './registry'
import { createTask } from './task'

const actorRef = (actor: { type: string; id: string }) => (actor.type === 'user' ? { user: actor.id } : { agent: actor.id })
const personName = (repo: Repo, id: string | null) => {
  const p = id ? repo.get('persons', id) : undefined
  return p ? `${p.first_names} ${p.surname}` : 'Unknown member'
}

/** Saves a reconciliation result as a run with items, superseding the previous run for the same scope and period. */
function saveRun(
  repo: Repo,
  actor: { type: string; id: string },
  definitionKey: string,
  result: ReconResult,
  opts: { period: string; customer_id: string | null; scope_ref: ReconciliationRun['scope_ref']; job_id?: string | null; totals?: { left: number; right: number } },
  scale: (field: string | null) => { measure: 'amount' | 'units'; from: (n: number) => number },
): ReconciliationRun {
  const definition = repo.find('reconciliation_definitions', (d) => d.key === definitionKey && d.is_active)
  if (!definition) throw new ToolError('not_found', `Reconciliation definition ${definitionKey} is missing`)
  const sameScope = (r: ReconciliationRun) => JSON.stringify(r.scope_ref) === JSON.stringify(opts.scope_ref) && r.customer_id === opts.customer_id
  repo
    .list('reconciliation_runs', (r) => r.definition_id === definition.id && r.reporting_period === opts.period && r.status === 'completed' && sameScope(r))
    .forEach((r) => repo.update('reconciliation_runs', r.id, { status: 'superseded' }))
  const totals = opts.totals ?? { left: fromCents(result.left_total), right: fromCents(result.right_total) }
  const run = repo.insert('reconciliation_runs', {
    definition_id: definition.id,
    reporting_period: opts.period,
    customer_id: opts.customer_id,
    scope_ref: opts.scope_ref,
    left_batch_id: null,
    right_batch_id: null,
    status: 'completed',
    currency: 'ZAR',
    left_total: r2(totals.left),
    right_total: r2(totals.right),
    difference_total: r2(totals.left - totals.right),
    matched_count: result.matched,
    difference_count: result.differences,
    left_only_count: result.left_only,
    right_only_count: result.right_only,
    job_id: opts.job_id ?? null,
    run_by: actor.type === 'user' ? actor.id : null,
    run_by_agent: actor.type === 'agent' ? actor.id : null,
    completed_at: new Date().toISOString(),
  })
  result.items.forEach((i) => {
    const s = scale(i.field)
    repo.insert('reconciliation_items', {
      run_id: run.id,
      match_key: i.key,
      label: i.label,
      person_id: i.person_id,
      left_row_id: null,
      right_row_id: null,
      outcome: i.outcome,
      field: i.field,
      measure: s.measure,
      left_value: i.left === null ? null : s.from(i.left),
      right_value: i.right === null ? null : s.from(i.right),
      difference: i.difference === null ? null : s.from(i.difference),
      currency: s.measure === 'amount' ? 'ZAR' : null,
    })
  })
  return run
}

const cents = () => ({ measure: 'amount' as const, from: fromCents })

// ---------------------------------------------------------------- group risk movements

function schemeRulesOn(repo: Repo, schemeId: string, date: string): SchemeRules | null {
  return (
    repo
      .list('scheme_rule_versions', (r) => r.scheme_id === schemeId && r.effective_from <= date && (!r.effective_to || r.effective_to >= date))
      .sort((a, b) => b.version - a.version)[0]?.rules ?? null
  )
}

const annualSalaryOn = (repo: Repo, employmentId: string, date: string) =>
  repo
    .list('salary_history', (s) => s.employment_id === employmentId && s.effective_from <= date && (!s.effective_to || s.effective_to >= date))
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0]?.annual_amount ?? null

export interface CoverSummary {
  processed: number
  cover_before: number
  cover_after: number
  above_fcl: number
  ineligible: number
}

/** Recalculates salary-linked group life cover for detected movements, using the scheme rules in force on each effective date. */
export function recalculateCover(repo: Repo, employerId: string, agent: string | null, jobId: string | null): CoverSummary {
  const movements = repo.list('member_movements', (m) => m.employer_customer_id === employerId && m.status === 'detected' && m.scheme_id !== null)
  const summary: CoverSummary = { processed: 0, cover_before: 0, cover_after: 0, above_fcl: 0, ineligible: 0 }
  for (const m of movements) {
    const rules = schemeRulesOn(repo, m.scheme_id!, m.effective_date)
    if (!rules || !m.employment_id) continue
    const employment = repo.require('employments', m.employment_id)
    const person = repo.require('persons', employment.person_id)
    const membership = repo.find('scheme_memberships', (s) => s.scheme_id === m.scheme_id && s.employment_id === m.employment_id && s.status === 'active')
    const before = membership?.cover_amount ?? 0
    let after = 0
    if (m.movement_type === 'leaver') {
      if (membership) repo.update('scheme_memberships', membership.id, { status: 'exited', exited_on: m.effective_date })
    } else {
      const age = person.date_of_birth ? ageOn(person.date_of_birth, m.effective_date) : null
      const eligible = age === null || (age >= rules.eligibility_min_age && age <= rules.eligibility_max_age)
      const salary = annualSalaryOn(repo, employment.id, m.effective_date) ?? 0
      const multiple = rules.categories[employment.category]?.multiple ?? rules.categories.general?.multiple ?? 0
      after = eligible ? Math.min(rules.max_cover, Math.round(salary * multiple)) : 0
      if (!eligible) summary.ineligible++
      const aboveFcl = after > rules.free_cover_limit
      if (aboveFcl) {
        summary.above_fcl++
        createTask(repo, agent, jobId, {
          customer_id: employerId,
          subject_table: 'member_movements',
          subject_id: m.id,
          kind: 'information_request',
          audience: 'broker',
          title: `Underwriting needed above the free cover limit: ${person.first_names} ${person.surname}`,
          detail: `Cover of R${after.toLocaleString('en-ZA')} exceeds the free cover limit of R${rules.free_cover_limit.toLocaleString('en-ZA')}. Cover above the limit is subject to the insurer’s underwriting.`,
          due_in_days: 14,
          dedupe_key: `fcl:${m.scheme_id}:${employment.id}`,
        })
      }
      if (membership) {
        repo.update('scheme_memberships', membership.id, { cover_amount: after, above_free_cover_limit: aboveFcl, underwriting_status: aboveFcl && !membership.above_free_cover_limit ? 'required' : membership.underwriting_status })
      } else if (eligible) {
        repo.insert('scheme_memberships', {
          scheme_id: m.scheme_id!,
          employment_id: employment.id,
          employer_customer_id: employerId,
          person_id: person.id,
          status: 'active',
          joined_on: m.effective_date,
          exited_on: null,
          cover_amount: after,
          above_free_cover_limit: aboveFcl,
          underwriting_status: aboveFcl ? 'required' : 'not_required',
        })
      }
    }
    repo.update('member_movements', m.id, { cover_before: before, cover_after: after })
    summary.processed++
    summary.cover_before += before
    summary.cover_after += after
  }
  return summary
}

export const submissionPayload = (movements: MemberMovement[]) =>
  movements
    .map((m) => ({ id: m.id, type: m.movement_type, effective: m.effective_date, cover_before: m.cover_before, cover_after: m.cover_after }))
    .sort((a, b) => a.id.localeCompare(b.id))

const submittable = (repo: Repo, schemeId: string) => repo.list('member_movements', (m) => m.scheme_id === schemeId && ['detected', 'awaiting_approval'].includes(m.status) && m.cover_after !== null)

registerApprovalSubject('group_schemes', {
  currentPayload: (repo, id, approval) => (approval.approval_type === 'movement_submission' ? { scheme_id: id, movements: submissionPayload(submittable(repo, id)) } : undefined),
  onRequested: (repo, id, approval) => submittable(repo, id).forEach((m) => repo.update('member_movements', m.id, { status: 'awaiting_approval', approval_id: approval.id })),
  onDecided: (repo, id, decision) =>
    submittable(repo, id).forEach((m) => repo.update('member_movements', m.id, { status: decision === 'approved' ? 'approved' : decision === 'rejected' ? 'rejected' : 'detected' })),
  describe: (repo, a) => {
    const scheme = repo.get('group_schemes', a.subject_id)
    const p = a.proposed_changes as { movements: Array<{ type: string; cover_before: number | null; cover_after: number | null }> }
    const delta = p.movements.reduce((s, m) => s + (m.cover_after ?? 0) - (m.cover_before ?? 0), 0)
    const count = (t: string) => p.movements.filter((m) => m.type === t).length
    return {
      lines: [
        `${scheme?.name ?? 'Scheme'}: ${p.movements.length} movements (${count('joiner')} joiners, ${count('leaver')} leavers, ${count('salary_change')} salary changes, ${count('category_change')} category changes)`,
        `Net change in group life cover ${delta >= 0 ? '+' : '−'}R${Math.abs(delta).toLocaleString('en-ZA')} (calculated from the scheme rules in force)`,
        'Approving marks the insurer submission schedule as ready. B-Covered does not send it; submit through the insurer’s channel.',
      ],
      links: scheme ? [{ label: 'Employer 360', to: `/broker/benefits/employers/${scheme.employer_customer_id}` }] : [],
    }
  },
})

// ---------------------------------------------------------------- benefit events

const REQUIREMENTS: Record<string, string[]> = {
  death: ['Certified death certificate', 'Claimant’s ID and bank confirmation', 'Beneficiary nomination form (a guide for trustees only)'],
  disability: ['Medical reports requested by the insurer', 'Employer statement of duties and last day worked'],
  funeral: ['Certified death certificate', 'Claimant’s bank confirmation'],
  critical_illness: ['Medical reports requested by the insurer'],
  retirement: ['Retirement election form', 'Tax directive application'],
  resignation: ['Withdrawal claim form signed by the member', 'Bank account confirmation'],
  retrenchment: ['Retrenchment letter', 'Withdrawal or preservation election'],
  withdrawal: ['Withdrawal claim form signed by the member', 'Bank account confirmation'],
  preservation: ['Preservation fund application'],
  transfer: ['Transfer election form'],
  savings_withdrawal: ['Savings withdrawal request through the administrator'],
}

// ---------------------------------------------------------------- tools

export const fundsTools = [
  defineTool({
    name: 'scheme.recalculate_cover',
    description: 'Recalculate salary-linked group life cover for detected movements from the scheme rules in force on each effective date.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({ employer_customer_id: z.uuid() }),
    run: ({ repo, actor, jobId }, { employer_customer_id }) => recalculateCover(repo, employer_customer_id, actor.type === 'agent' ? actor.id : null, jobId ?? null),
  }),
  defineTool({
    name: 'scheme.prepare_submission',
    description: 'Hold the insurer submission schedule of recalculated movements for approval.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({ employer_customer_id: z.uuid() }),
    run: ({ repo, actor, jobId }, { employer_customer_id }) => {
      const schemes = repo.list('group_schemes', (s) => s.employer_customer_id === employer_customer_id && s.status === 'active')
      const approvals = schemes
        .map((s) => {
          const movements = submittable(repo, s.id)
          if (!movements.length) return null
          return requestApproval(repo, actor.id, jobId ?? null, {
            approval_type: 'movement_submission',
            subject_table: 'group_schemes',
            subject_id: s.id,
            summary: `Approve the ${s.name} movement schedule (${movements.length} movements)`,
            proposed_changes: { scheme_id: s.id, movements: submissionPayload(movements) },
            risk_flags: movements.some((m) => (m.cover_after ?? 0) > (schemeRulesOn(repo, s.id, m.effective_date)?.free_cover_limit ?? Infinity)) ? ['Includes cover above the free cover limit'] : [],
            evidence: [{ label: 'Employer 360', ref: `/broker/benefits/employers/${employer_customer_id}` }],
          })
        })
        .filter((a): a is NonNullable<typeof a> => Boolean(a))
      return { approval_ids: approvals.map((a) => a.id) }
    },
  }),
  defineTool({
    name: 'benefit.log_event',
    description: 'Log a claim or benefit event with the documents it usually needs. Death benefits from a fund are flagged for Section 37C.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({
      arrangement: z.enum(['group_scheme', 'retirement_fund', 'policy']),
      person_id: z.uuid(),
      event_type: z.enum(['death', 'disability', 'funeral', 'critical_illness', 'retirement', 'resignation', 'retrenchment', 'withdrawal', 'preservation', 'transfer', 'savings_withdrawal']),
      event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      scheme_id: z.uuid().nullable().optional(),
      fund_id: z.uuid().nullable().optional(),
      policy_id: z.uuid().nullable().optional(),
      employer_customer_id: z.uuid().nullable().optional(),
      notes: z.string().max(1000).nullable().optional(),
    }),
    run: ({ repo }, input) =>
      repo.insert('benefit_events', {
        arrangement: input.arrangement,
        scheme_id: input.scheme_id ?? null,
        fund_id: input.fund_id ?? null,
        policy_id: input.policy_id ?? null,
        person_id: input.person_id,
        employer_customer_id: input.employer_customer_id ?? null,
        event_type: input.event_type,
        event_date: input.event_date,
        broker_status: 'notified',
        provider_decision: 'pending',
        provider_decision_date: null,
        provider_reference: null,
        amount_claimed: null,
        amount_paid: null,
        section_37c: input.arrangement === 'retirement_fund' && input.event_type === 'death',
        tax_directive_status: ['retirement', 'resignation', 'retrenchment', 'withdrawal', 'savings_withdrawal'].includes(input.event_type) ? 'requested' : 'not_required',
        outstanding_requirements: REQUIREMENTS[input.event_type] ?? [],
        notes: input.arrangement === 'retirement_fund' && input.event_type === 'death' ? 'Trustees decide the distribution under Section 37C; nominations do not bind them.' : (input.notes ?? null),
      }),
    auditEntity: (r) => ({ table: 'benefit_events', id: r.id }),
  }),
  defineTool({
    name: 'benefit.update_broker_status',
    description: 'Update B-Covered’s own progress on a claim or benefit event. This never records the provider’s decision.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({ event_id: z.uuid(), broker_status: z.enum(['notified', 'documents_outstanding', 'submitted', 'with_provider', 'closed']), outstanding_requirements: z.array(z.string().max(200)).max(20).optional() }),
    run: ({ repo }, { event_id, broker_status, outstanding_requirements }) =>
      repo.update('benefit_events', event_id, { broker_status, ...(outstanding_requirements ? { outstanding_requirements } : {}) }),
    auditEntity: (r) => ({ table: 'benefit_events', id: r.id }),
  }),
  defineTool({
    name: 'benefit.record_provider_decision',
    description: 'Record the insurer’s or administrator’s official decision from their communication. Only a person can record it.',
    allow: STAFF,
    sideEffect: true,
    input: z.object({ event_id: z.uuid(), decision: z.enum(['admitted', 'declined', 'paid']), decision_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), provider_reference: z.string().min(3).max(100), amount_paid: z.number().min(0).nullable().optional() }),
    run: ({ repo, actor }, input) => {
      if (actor.type !== 'user') throw new ToolError('forbidden', 'Only a person can record a provider decision')
      const e = repo.require('benefit_events', input.event_id)
      return repo.update('benefit_events', e.id, {
        provider_decision: input.decision,
        provider_decision_date: input.decision_date,
        provider_reference: input.provider_reference,
        amount_paid: input.amount_paid ?? e.amount_paid,
      } as Partial<BenefitEvent>)
    },
    auditEntity: (r) => ({ table: 'benefit_events', id: r.id }),
  }),
  defineTool({
    name: 'fund.reconcile_balances',
    description: 'Roll the administrator’s opening balance forward through the reported flows and compare it with the reported closing balance.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({ statement_id: z.uuid() }),
    run: ({ repo, actor, jobId }, { statement_id }) => {
      const s = repo.require('fund_balance_statements', statement_id)
      const calculated =
        toCents(s.opening_balance) + toCents(s.contributions) + toCents(s.transfers_in) - toCents(s.transfers_out) - toCents(s.withdrawals) - toCents(s.benefit_payments) + toCents(s.investment_returns) - toCents(s.fees)
      const left: ReconEntry[] = [{ key: 'closing_balance', label: 'Closing balance', values: { closing_balance: calculated } }]
      const right: ReconEntry[] = [{ key: 'closing_balance', label: 'Closing balance', values: { closing_balance: toCents(s.closing_balance) } }]
      const definition = repo.find('reconciliation_definitions', (d) => d.key === 'fund_balance_rollforward')!
      const result = reconcile(left, right, ['closing_balance'], definition.tolerances)
      const run = saveRun(repo, actor, 'fund_balance_rollforward', result, { period: s.period_end.slice(0, 8) + '01', customer_id: s.employer_customer_id, scope_ref: { fund_id: s.fund_id }, job_id: jobId ?? null }, cents)
      captureEvidence(
        repo,
        {
          entity_table: 'reconciliation_runs',
          entity_id: run.id,
          kind: 'calculation',
          description: `Roll-forward of ${s.source_reference}`,
          content: { statement_id, components: { opening: s.opening_balance, contributions: s.contributions, transfers_in: s.transfers_in, transfers_out: s.transfers_out, withdrawals: s.withdrawals, benefit_payments: s.benefit_payments, investment_returns: s.investment_returns, fees: s.fees }, calculated_closing: fromCents(calculated), reported_closing: s.closing_balance },
        },
        actorRef(actor),
      )
      const exceptions = raiseExceptions(repo, run.id, actor.type === 'agent' ? actor.id : null, 'rollforward')
      return { run, calculated_closing: fromCents(calculated), difference: r2(fromCents(calculated) - s.closing_balance), exceptions: exceptions.created }
    },
    auditEntity: (r) => ({ table: 'reconciliation_runs', id: r.run.id }),
  }),
  defineTool({
    name: 'investment.reconcile_holdings',
    description: 'Compare the administrator’s unit register with the investment manager’s holdings: units, values and missing prices.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({ portfolio_id: z.uuid(), valuation_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }),
    run: ({ repo, actor, jobId }, { portfolio_id, valuation_date }) => {
      const portfolio = repo.require('investment_portfolios', portfolio_id)
      const all = repo.list('investment_holdings', (h) => h.portfolio_id === portfolio_id)
      const date = valuation_date ?? all.map((h) => h.valuation_date).sort().at(-1)
      if (!date) throw new ToolError('not_found', 'No holdings have been loaded for this portfolio')
      const admin = all.filter((h) => h.valuation_date === date && h.source_kind === 'administrator')
      const manager = all.filter((h) => h.valuation_date === date && h.source_kind === 'investment_manager')
      const missingPrices = admin.filter((h) => h.unit_price === null)
      const managerValue = (instrument: string) => manager.find((m) => m.instrument === instrument)?.market_value ?? 0
      const entry = (h: (typeof admin)[number], side: 'admin' | 'manager'): ReconEntry => ({
        key: h.instrument,
        label: h.instrument,
        values: {
          units: toMicroUnits(h.units),
          market_value: toCents(side === 'admin' && h.market_value === null ? managerValue(h.instrument) : (h.market_value ?? 0)),
        },
      })
      const definition = repo.find('reconciliation_definitions', (d) => d.key === 'admin_vs_manager_holdings')!
      const tolerances = { units: toMicroUnits(definition.tolerances.units ?? 0), market_value: definition.tolerances.market_value ?? 0 }
      const result = reconcile(admin.map((h) => entry(h, 'admin')), manager.map((h) => entry(h, 'manager')), ['units', 'market_value'], tolerances)
      const run = saveRun(
        repo,
        actor,
        'admin_vs_manager_holdings',
        result,
        {
          period: date.slice(0, 8) + '01',
          customer_id: null,
          scope_ref: { portfolio_id, fund_id: portfolio.fund_id },
          job_id: jobId ?? null,
          totals: { left: admin.reduce((s, h) => s + (h.market_value ?? 0), 0), right: manager.reduce((s, h) => s + (h.market_value ?? 0), 0) },
        },
        (field) => (field === 'units' ? { measure: 'units', from: fromMicroUnits } : { measure: 'amount', from: fromCents }),
      )
      // Combined items (matched, one-sided) mix units and cents, so their values are recorded as market values only.
      repo
        .list('reconciliation_items', (i) => i.run_id === run.id && i.field === null)
        .forEach((i) => {
          const a = admin.find((h) => h.instrument === i.match_key)
          const m = manager.find((h) => h.instrument === i.match_key)
          repo.update('reconciliation_items', i.id, { left_value: a?.market_value ?? null, right_value: m?.market_value ?? null, difference: a && m ? r2((a.market_value ?? 0) - (m.market_value ?? 0)) : null })
        })
      const raised = raiseExceptions(repo, run.id, actor.type === 'agent' ? actor.id : null, 'holdings')
      missingPrices.forEach((h) => {
        const dedupe = `holdings:${portfolio_id}:${date}:${h.instrument}:missing_price`
        if (repo.find('financial_exceptions', (e) => e.dedupe_key === dedupe && ['open', 'investigating', 'awaiting_third_party'].includes(e.status))) return
        repo.insert('financial_exceptions', {
          run_id: run.id,
          reconciliation_item_id: null,
          customer_id: null,
          fund_id: portfolio.fund_id,
          portfolio_id,
          category: 'missing_price',
          title: `Missing price on the administrator register: ${h.instrument} at ${date}`,
          amount: managerValue(h.instrument),
          currency: 'ZAR',
          severity: 'medium',
          status: 'open',
          assigned_to: null,
          due_date: new Date(Date.now() + 5 * 86_400_000).toISOString(),
          proposed_by_agent: actor.type === 'agent' ? actor.id : null,
          dedupe_key: dedupe,
        })
      })
      return { run, exceptions: raised.created + missingPrices.length, missing_prices: missingPrices.length }
    },
    auditEntity: (r) => ({ table: 'reconciliation_runs', id: r.run.id }),
  }),
  defineTool({
    name: 'transfer.reconcile',
    description: 'Compare each member’s transfer value from the transferor with the value allocated by the transferee.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({ transfer_id: z.uuid() }),
    run: ({ repo, actor, jobId }, { transfer_id }) => {
      const transfer = repo.require('fund_transfers', transfer_id)
      const members = repo.list('transfer_members', (m) => m.transfer_id === transfer_id)
      const left: ReconEntry[] = members.map((m) => ({ key: m.person_id, label: personName(repo, m.person_id), person_id: m.person_id, values: { value: toCents(m.transfer_value_reported ?? 0) } }))
      const right: ReconEntry[] = members.filter((m) => m.value_received !== null).map((m) => ({ key: m.person_id, label: personName(repo, m.person_id), person_id: m.person_id, values: { value: toCents(m.value_received!) } }))
      const definition = repo.find('reconciliation_definitions', (d) => d.key === 'transfer_values')!
      const result = reconcile(left, right, ['value'], definition.tolerances)
      const run = saveRun(repo, actor, 'transfer_values', result, { period: transfer.effective_date.slice(0, 8) + '01', customer_id: transfer.employer_customer_id, scope_ref: { transfer_id, fund_id: transfer.transferee_fund_id }, job_id: jobId ?? null }, cents)
      members.forEach((m) => {
        const item = result.items.find((i) => i.key === m.person_id)
        const status = !item || item.outcome === 'left_only' ? 'missing' : item.outcome === 'difference' ? 'difference' : 'reconciled'
        repo.update('transfer_members', m.id, { status })
      })
      const raised = raiseExceptions(repo, run.id, actor.type === 'agent' ? actor.id : null, 'transfer')
      return { run, reconciled: result.matched, differences: result.differences, missing: result.left_only, exceptions: raised.created }
    },
    auditEntity: (r) => ({ table: 'reconciliation_runs', id: r.run.id }),
  }),
  defineTool({
    name: 'transfer.record_allocation',
    description: 'Record the value the transferee administrator confirms it allocated to a member.',
    allow: STAFF,
    sideEffect: true,
    input: z.object({ transfer_member_id: z.uuid(), value_received: z.number().min(0) }),
    run: ({ repo }, { transfer_member_id, value_received }) => repo.update('transfer_members', transfer_member_id, { value_received: r2(value_received), status: 'pending' }),
    auditEntity: (r) => ({ table: 'transfer_members', id: r.id }),
  }),
  defineTool({
    name: 'transfer.advance_stage',
    description: 'Complete the current transfer stage with its evidence and move to the next. Stages cannot be skipped.',
    allow: STAFF,
    sideEffect: true,
    input: z.object({ transfer_id: z.uuid(), note: z.string().max(500).nullable().optional(), evidence_ref: z.string().max(200).nullable().optional() }),
    run: ({ repo, actor }, { transfer_id, note, evidence_ref }) => {
      if (actor.type !== 'user') throw new ToolError('forbidden', 'Only a person can complete a transfer stage')
      const t = repo.require('fund_transfers', transfer_id)
      if (t.status !== 'open') throw new ToolError('conflict', `The transfer is ${t.status}`)
      if (['obtain_approvals', 'submit'].includes(t.stage) && !evidence_ref) throw new ToolError('validation', 'Record the approval or submission reference for this stage')
      if (t.stage === 'confirm_allocations') {
        const open = repo.list('transfer_members', (m) => m.transfer_id === transfer_id && m.status !== 'reconciled')
        if (open.length) throw new ToolError('conflict', `${open.length} member allocation${open.length === 1 ? ' is' : 's are'} not reconciled yet`)
      }
      const idx = TRANSFER_STAGES.indexOf(t.stage)
      const user = repo.get('app_users', actor.id)?.full_name ?? 'User'
      const milestones = [...t.milestones, { stage: t.stage, completed_at: new Date().toISOString(), by: user, note: note ?? null, evidence_ref: evidence_ref ?? null }]
      const next = TRANSFER_STAGES[idx + 1]
      return repo.update('fund_transfers', transfer_id, next ? { stage: next, milestones } : { milestones, status: 'closed' })
    },
    auditEntity: (r) => ({ table: 'fund_transfers', id: r.id }),
  }),
] as unknown as ToolDef[]
