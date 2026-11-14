import { z } from 'zod'
import { OPEN_EXCEPTION } from '../db/controlsSchema'
import type { PackSection } from '../db/specialistSchema'
import type { Repo } from '../db/store'
import { cellResults, cellTotals } from '../domain/cells/results'
import { twoPotRulesOn } from '../domain/funds/twoPot'
import { compound, mandateCheck, moneyWeightedReturn, timeWeightedReturn } from '../domain/investments/performance'
import { hashPayload } from '../lib/hash'
import { randWhole } from '../lib/money'
import { ToolError } from '../lib/errors'
import { captureEvidence } from './controls'
import { defineTool, STAFF, type ToolDef } from './registry'

const rand = randWhole
const pct = (n: number | null) => (n === null || !Number.isFinite(n) ? '–' : `${(n * 100).toFixed(1)}%`)
const actorRef = (actor: { type: string; id: string }) => (actor.type === 'user' ? { user: actor.id } : { agent: actor.id })

// ---------------------------------------------------------------- cells

export function cellReport(repo: Repo, cellId: string) {
  const cell = repo.require('cell_arrangements', cellId)
  const periods = repo.list('cell_financial_periods', (p) => p.cell_id === cellId)
  const results = cellResults(periods, cell.terms)
  return { cell, periods, results, totals: cellTotals(results) }
}

// ---------------------------------------------------------------- trustee pack

export function buildPackSections(repo: Repo, fundId: string, periodEnd: string): PackSection[] {
  const fund = repo.require('retirement_funds', fundId)
  const valuations = repo.list('administrator_valuations', (v) => v.fund_id === fundId)
  const latest = valuations.map((v) => v.valuation_date).sort().at(-1)
  const current = valuations.filter((v) => v.valuation_date === latest)
  const total = current.reduce((s, v) => s + v.total_value, 0)
  const rules = latest ? twoPotRulesOn(latest) : null
  const statement = repo.list('fund_balance_statements', (s) => s.fund_id === fundId).sort((a, b) => b.period_end.localeCompare(a.period_end))[0]
  const rollRun = statement
    ? repo
        .list('reconciliation_runs', (r) => r.scope_ref.fund_id === fundId && r.status === 'completed' && repo.get('reconciliation_definitions', r.definition_id)?.key === 'fund_balance_rollforward')
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
    : undefined
  const contribRuns = repo.list('reconciliation_runs', (r) => r.scope_ref.fund_id === fundId && r.status === 'completed' && repo.get('reconciliation_definitions', r.definition_id)?.key === 'payroll_vs_admin_contributions')
  const exceptions = repo.list('financial_exceptions', (e) => e.fund_id === fundId && OPEN_EXCEPTION.includes(e.status))
  const aged = exceptions.filter((e) => Date.now() - Date.parse(e.created_at) > 30 * 86_400_000).length
  const events = repo.list('benefit_events', (e) => e.fund_id === fundId && e.broker_status !== 'closed')
  const transfers = repo.list('fund_transfers', (t) => t.transferee_fund_id === fundId || t.transferor_fund_id === fundId)
  const items = repo.list('governance_items', (g) => g.fund_id === fundId)
  const portfolio = repo.find('investment_portfolios', (p) => p.fund_id === fundId)
  const perf = (() => {
    if (!portfolio) return ['No portfolio is linked to this fund.']
    const points = repo
      .list('investment_valuations', (v) => v.portfolio_id === portfolio.id)
      .sort((a, b) => a.valuation_date.localeCompare(b.valuation_date))
      .map((v) => ({ date: v.valuation_date, market_value: v.market_value, net_cash_flow: v.net_cash_flow }))
    if (points.length < 2) return ['Not enough valuations to calculate performance.']
    const twr = timeWeightedReturn(points)
    const mwr = moneyWeightedReturn(points)
    const bench = compound(repo.list('investment_benchmarks', (b) => b.portfolio_id === portfolio.id).map((b) => b.benchmark_return))
    const breaches = mandateCheck(repo.list('investment_holdings', (h) => h.portfolio_id === portfolio.id && h.source_kind === 'investment_manager'), portfolio.mandate.asset_ranges).filter((a) => a.breach)
    return [
      `${portfolio.name}: time-weighted return ${pct(twr.cumulative)} over ${points.length - 1} months against a benchmark of ${pct(bench)} (${pct(twr.cumulative - bench)} relative).`,
      `Money-weighted return ${pct(mwr.annualised)} a year.`,
      breaches.length ? `Mandate breaches: ${breaches.map((b) => `${b.asset_class} at ${b.weight.toFixed(1)}% (range ${b.min}–${b.max}%)`).join('; ')}.` : 'No asset allocation outside the mandate ranges.',
      `Method: ${twr.method}. Source: manager valuations; figures are B-Covered calculations, not official fund returns.`,
    ]
  })()
  const sections: PackSection[] = [
    {
      key: 'financial',
      title: `Fund financial summary to ${periodEnd}`,
      basis: 'reported',
      lines: [
        `${fund.name}: ${current.length} members valued at ${rand(total)} on ${latest ?? '–'} (administrator-reported).`,
        `Two-pot split: vested ${rand(current.reduce((s, v) => s + v.vested_component, 0))}, savings ${rand(current.reduce((s, v) => s + v.savings_component, 0))}, retirement ${rand(current.reduce((s, v) => s + v.retirement_component, 0))}.${rules ? ` Parameters per configuration effective ${rules.effective_from}.` : ''}`,
        statement
          ? `Participation statement ${statement.period_start} to ${statement.period_end}: closing balance ${rand(statement.closing_balance)}. ${rollRun ? (rollRun.difference_total ? `Roll-forward difference of R${Math.abs(rollRun.difference_total).toFixed(2)} under investigation.` : 'Roll-forward reconciles.') : 'Roll-forward not yet checked.'}`
          : 'No balance statement received.',
      ],
    },
    {
      key: 'contributions',
      title: 'Contribution compliance',
      basis: 'calculated',
      lines: contribRuns.length
        ? contribRuns
            .sort((a, b) => b.reporting_period.localeCompare(a.reporting_period))
            .slice(0, 3)
            .map((r) => `${r.reporting_period.slice(0, 7)} · ${repo.get('customers', r.customer_id ?? '')?.full_name ?? 'Employer'}: expected ${rand(r.left_total ?? 0)} vs reported ${rand(r.right_total ?? 0)}, ${r.difference_count + r.left_only_count + r.right_only_count} exceptions.`)
        : ['No contribution reconciliations have been run for this fund.'],
    },
    { key: 'investments', title: 'Investment performance', basis: 'calculated', lines: perf },
    {
      key: 'administration',
      title: 'Administration performance',
      basis: 'calculated',
      lines: [`${exceptions.length} open exceptions, ${aged} older than 30 days.`, `${events.length} benefit events in progress with the administrator or B-Covered.`],
    },
    {
      key: 'benefit_events',
      title: 'Outstanding benefit events',
      basis: 'mixed',
      lines: events.length
        ? events.map((e) => {
            const p = repo.get('persons', e.person_id)
            return `${e.event_type.replace(/_/g, ' ')} · ${p?.first_names} ${p?.surname} · B-Covered: ${e.broker_status.replace(/_/g, ' ')} · administrator: ${(e.provider_decision ?? 'pending').replace(/_/g, ' ')}${e.section_37c ? ' · Section 37C (trustee decision)' : ''}`
          })
        : ['None.'],
    },
    {
      key: 'transfers',
      title: 'Section 14 and other transfers',
      basis: 'mixed',
      lines: transfers.length
        ? transfers.map((t) => {
            const members = repo.list('transfer_members', (m) => m.transfer_id === t.id)
            return `${t.transfer_type === 'section_14' ? 'Section 14' : 'Transfer'} effective ${t.effective_date}: stage ${t.stage.replace(/_/g, ' ')}, ${members.filter((m) => m.status === 'reconciled').length}/${members.length} members reconciled.`
          })
        : ['None.'],
    },
    { key: 'risks', title: 'Risk register', basis: 'reported', lines: items.filter((i) => i.kind === 'risk').map((i) => `${i.title}${i.detail ? `: ${i.detail}` : ''} (${i.status})`) },
    { key: 'actions', title: 'Action items', basis: 'reported', lines: items.filter((i) => i.kind === 'action_item').map((i) => `${i.title} · ${i.owner ?? 'unassigned'} · due ${i.due_date ?? '–'} (${i.status})`) },
    {
      key: 'decisions',
      title: 'Decisions recorded',
      basis: 'reported',
      lines: items.filter((i) => i.kind === 'decision' || i.kind === 'resolution').map((i) => `${i.title}: ${i.decided_by_trustees ?? 'deciding body not recorded'}`),
    },
  ]
  return sections
}

// ---------------------------------------------------------------- investigations

const SNAPSHOT_DATASETS = ['reconciliation_run', 'import_batch', 'open_exceptions', 'member_movements'] as const

function snapshotRows(repo: Repo, dataset: (typeof SNAPSHOT_DATASETS)[number], refId: string | null | undefined) {
  if (dataset === 'reconciliation_run') {
    if (!refId) throw new ToolError('validation', 'Choose the reconciliation run')
    const run = repo.require('reconciliation_runs', refId)
    return { label: `Reconciliation ${run.reporting_period.slice(0, 7)}`, rows: repo.list('reconciliation_items', (i) => i.run_id === refId).map(({ id: _id, tenant_id: _t, ...rest }) => rest) }
  }
  if (dataset === 'import_batch') {
    if (!refId) throw new ToolError('validation', 'Choose the import batch')
    const batch = repo.require('import_batches', refId)
    return { label: `Import ${batch.file_name}`, rows: repo.list('import_rows', (r) => r.batch_id === refId).map((r) => ({ row: r.row_number, normalised: r.normalised, match: r.match_status, errors: r.validation_errors })) }
  }
  if (dataset === 'open_exceptions') return { label: 'Open financial exceptions', rows: repo.list('financial_exceptions', (e) => OPEN_EXCEPTION.includes(e.status)).map(({ tenant_id: _t, ...rest }) => rest) }
  return { label: 'Member movements', rows: repo.list('member_movements').map(({ tenant_id: _t, ...rest }) => rest) }
}

/** Per-key changes between two reconciliation runs, for historical comparison. */
export function compareRuns(repo: Repo, runA: string, runB: string) {
  const a = repo.list('reconciliation_items', (i) => i.run_id === runA)
  const b = repo.list('reconciliation_items', (i) => i.run_id === runB)
  const keys = [...new Set([...a, ...b].map((i) => `${i.match_key}|${i.field ?? ''}`))]
  return keys
    .map((k) => {
      const x = a.find((i) => `${i.match_key}|${i.field ?? ''}` === k)
      const y = b.find((i) => `${i.match_key}|${i.field ?? ''}` === k)
      return { key: k, label: (x ?? y)!.label, before: x ? { outcome: x.outcome, difference: x.difference } : null, after: y ? { outcome: y.outcome, difference: y.difference } : null }
    })
    .filter((c) => JSON.stringify(c.before) !== JSON.stringify(c.after))
}

// ---------------------------------------------------------------- tools

export const specialistTools = [
  defineTool({
    name: 'cell.prepare_report',
    description: 'Calculate cell captive results (earned premium, incurred claims, ratios, underwriting result, profit share) from reported periods and the cell agreement terms.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({ cell_id: z.uuid() }),
    run: ({ repo, actor }, { cell_id }) => {
      const report = cellReport(repo, cell_id)
      captureEvidence(repo, { entity_table: 'cell_arrangements', entity_id: cell_id, kind: 'report', description: `Cell performance report to ${report.results.at(-1)?.period_end ?? '–'}`, content: { terms: report.cell.terms, totals: report.totals, results: report.results } }, actorRef(actor))
      return report
    },
  }),
  defineTool({
    name: 'governance.build_pack',
    description: 'Assemble a trustee pack from validated fund data. Each section states whether it is reported or calculated.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({ fund_id: z.uuid(), period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
    run: ({ repo, actor }, { fund_id, period_end }) =>
      repo.insert('trustee_packs', { fund_id, period_end, sections: buildPackSections(repo, fund_id, period_end), status: 'draft', prepared_by_agent: actor.type === 'agent' ? actor.id : 'russ', issued_by: null, issued_at: null }),
    auditEntity: (r) => ({ table: 'trustee_packs', id: r.id }),
  }),
  defineTool({
    name: 'governance.issue_pack',
    description: 'Issue a reviewed trustee pack to the board. Only a person can issue it; it records, it does not decide.',
    allow: STAFF,
    sideEffect: true,
    input: z.object({ pack_id: z.uuid() }),
    run: ({ repo, actor }, { pack_id }) => {
      if (actor.type !== 'user') throw new ToolError('forbidden', 'Only a person can issue a trustee pack')
      const pack = repo.require('trustee_packs', pack_id)
      if (pack.status === 'issued') return pack
      captureEvidence(repo, { entity_table: 'trustee_packs', entity_id: pack.id, kind: 'report', description: `Trustee pack to ${pack.period_end} as issued`, content: pack.sections }, actorRef(actor))
      return repo.update('trustee_packs', pack_id, { status: 'issued', issued_by: actor.id, issued_at: new Date().toISOString() })
    },
    auditEntity: (r) => ({ table: 'trustee_packs', id: r.id }),
  }),
  defineTool({
    name: 'governance.record_item',
    description: 'Record a meeting, resolution, action item, risk or a decision taken by the trustees.',
    allow: STAFF,
    sideEffect: true,
    input: z.object({
      fund_id: z.uuid(),
      kind: z.enum(['meeting', 'resolution', 'action_item', 'risk', 'decision']),
      title: z.string().min(3).max(300),
      detail: z.string().max(2000).nullable().optional(),
      owner: z.string().max(120).nullable().optional(),
      due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      decided_by_trustees: z.string().max(300).nullable().optional(),
    }),
    run: ({ repo, actor }, input) => {
      if (['decision', 'resolution'].includes(input.kind) && !input.decided_by_trustees) throw new ToolError('validation', 'Record which body took the decision')
      return repo.insert('governance_items', { fund_id: input.fund_id, kind: input.kind, title: input.title, detail: input.detail ?? null, status: input.kind === 'decision' ? 'noted' : 'open', owner: input.owner ?? null, due_date: input.due_date ?? null, decided_by_trustees: input.decided_by_trustees ?? null, recorded_by: actor.type === 'user' ? actor.id : null })
    },
    auditEntity: (r) => ({ table: 'governance_items', id: r.id }),
  }),
  defineTool({
    name: 'governance.update_item',
    description: 'Mark a governance item done or noted.',
    allow: STAFF,
    sideEffect: true,
    input: z.object({ item_id: z.uuid(), status: z.enum(['open', 'done', 'noted']) }),
    run: ({ repo }, { item_id, status }) => repo.update('governance_items', item_id, { status }),
    auditEntity: (r) => ({ table: 'governance_items', id: r.id }),
  }),
  defineTool({
    name: 'investigation.open',
    description: 'Open a forensic investigation workspace.',
    allow: STAFF,
    sideEffect: true,
    input: z.object({ title: z.string().min(3).max(200), scope: z.string().min(3).max(2000) }),
    run: ({ repo, actor }, input) => repo.insert('investigations', { ...input, status: 'open', opened_by: actor.type === 'user' ? actor.id : null }),
    auditEntity: (r) => ({ table: 'investigations', id: r.id }),
  }),
  defineTool({
    name: 'investigation.snapshot',
    description: 'Freeze a dataset as read-only evidence for an investigation, with a content hash.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({ investigation_id: z.uuid(), dataset: z.enum(SNAPSHOT_DATASETS), ref_id: z.uuid().nullable().optional() }),
    run: ({ repo, actor }, { investigation_id, dataset, ref_id }) => {
      const inv = repo.require('investigations', investigation_id)
      if (inv.status !== 'open') throw new ToolError('conflict', 'The investigation is closed')
      const snap = snapshotRows(repo, dataset, ref_id)
      return captureEvidence(repo, { entity_table: 'investigations', entity_id: investigation_id, kind: 'extract', description: `${snap.label} (${snap.rows.length} rows, read-only snapshot)`, content: { dataset, ref_id: ref_id ?? null, rows: snap.rows } }, actorRef(actor))
    },
    auditEntity: (r) => ({ table: 'audit_evidence', id: r.id }),
  }),
  defineTool({
    name: 'investigation.compare_runs',
    description: 'Compare two reconciliation runs item by item.',
    allow: ['agent', ...STAFF],
    sideEffect: false,
    input: z.object({ run_a: z.uuid(), run_b: z.uuid() }),
    run: ({ repo }, { run_a, run_b }) => compareRuns(repo, run_a, run_b),
  }),
  defineTool({
    name: 'investigation.record_finding',
    description: 'Record a finding. “Supported by records” needs evidence from this investigation; agents may only record hypotheses.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({ investigation_id: z.uuid(), title: z.string().min(3).max(300), detail: z.string().min(3).max(4000), basis: z.enum(['record_supported', 'hypothesis']), evidence_ids: z.array(z.uuid()).max(20).default([]) }),
    run: ({ repo, actor }, input) => {
      if (actor.type === 'agent' && input.basis === 'record_supported') throw new ToolError('forbidden', 'Russ may propose hypotheses; a person confirms findings as supported by records')
      if (input.basis === 'record_supported') {
        if (!input.evidence_ids.length) throw new ToolError('validation', 'A finding supported by records must cite evidence')
        const bad = input.evidence_ids.filter((id) => repo.get('audit_evidence', id)?.entity_id !== input.investigation_id)
        if (bad.length) throw new ToolError('validation', 'Cite evidence captured in this investigation')
      }
      return repo.insert('investigation_findings', { ...input, recorded_by: actor.type === 'user' ? actor.id : null, recorded_by_agent: actor.type === 'agent' ? actor.id : null })
    },
    auditEntity: (r) => ({ table: 'investigation_findings', id: r.id }),
  }),
  defineTool({
    name: 'investigation.report',
    description: 'Generate an investigation report that separates findings supported by records from hypotheses, with the evidence chain.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({ investigation_id: z.uuid() }),
    run: ({ repo, actor }, { investigation_id }) => {
      const inv = repo.require('investigations', investigation_id)
      const evidence = repo.list('audit_evidence', (e) => e.entity_id === investigation_id && e.kind !== 'report')
      const findings = repo.list('investigation_findings', (f) => f.investigation_id === investigation_id)
      const ref = (id: string) => {
        const e = evidence.find((x) => x.id === id)
        return e ? `${e.description} [hash ${e.sha256.slice(0, 12)}]` : id
      }
      const text = [
        `# ${inv.title}`,
        `Scope: ${inv.scope}`,
        '',
        '## Evidence (read-only snapshots)',
        ...evidence.map((e) => `- ${e.description} · captured ${e.created_at.slice(0, 16).replace('T', ' ')} · hash ${e.sha256}`),
        '',
        '## Findings supported by records',
        ...(findings.filter((f) => f.basis === 'record_supported').map((f) => `- ${f.title}: ${f.detail} (evidence: ${f.evidence_ids.map(ref).join('; ')})`) || []),
        '',
        '## Hypotheses requiring investigation',
        ...findings.filter((f) => f.basis === 'hypothesis').map((f) => `- ${f.title}: ${f.detail}`),
      ].join('\n')
      const report = captureEvidence(repo, { entity_table: 'investigations', entity_id: investigation_id, kind: 'report', description: `Investigation report (${findings.length} findings)`, content: { text, hash_of_inputs: hashPayload({ evidence: evidence.map((e) => e.sha256), findings }) } }, actorRef(actor))
      return { text, evidence_id: report.id }
    },
  }),
  defineTool({
    name: 'investigation.close',
    description: 'Close an investigation. Evidence and findings remain unchanged.',
    allow: STAFF,
    sideEffect: true,
    input: z.object({ investigation_id: z.uuid() }),
    run: ({ repo }, { investigation_id }) => repo.update('investigations', investigation_id, { status: 'closed' }),
    auditEntity: (r) => ({ table: 'investigations', id: r.id }),
  }),
] as unknown as ToolDef[]
