import { z } from 'zod'
import type { ContributionRuleVersion, Employment } from '../db/benefitsSchema'
import type { CorrectionLine, CorrectionSchedule, ExceptionCategory, FinancialException, ImportBatch, ImportRow, ReconciliationRun } from '../db/controlsSchema'
import type { Json } from '../db/schema'
import type { Repo } from '../db/store'
import { expectedContribution } from '../domain/controls/contributions'
import { matchAll, type Candidate } from '../domain/controls/match'
import { fromCents, toCents } from '../domain/controls/money'
import { applyMapping, missingColumns, parseDelimited } from '../domain/controls/parse'
import { reconcile, type ReconEntry } from '../domain/controls/reconcile'
import { isBlocking, validateContributionRow, validateHoldingRow, validatePayrollRow, type Validated } from '../domain/controls/validate'
import { idLookupHash, isValidSaId } from '../domain/life/identity'
import { adapterFor } from '../integrations/adapters'
import { hashPayload } from '../lib/hash'
import { randExact } from '../lib/money'
import { ToolError } from '../lib/errors'
import { registerApprovalSubject, requestApproval, requireApproved } from './approval'
import { resolveOrCreatePerson } from './person'
import { defineTool, STAFF, type ToolDef } from './registry'

export const r2 = (n: number) => Math.round(n * 100) / 100
const dayBefore = (date: string) => new Date(Date.parse(date) - 86_400_000).toISOString().slice(0, 10)

export function captureEvidence(
  repo: Repo,
  e: { entity_table: string; entity_id: string; kind: 'source_file' | 'extract' | 'correspondence' | 'calculation' | 'finding' | 'report'; description: string; content: unknown },
  by: { user?: string | null; agent?: string | null },
) {
  return repo.insert('audit_evidence', {
    entity_table: e.entity_table,
    entity_id: e.entity_id,
    kind: e.kind,
    storage_path: null,
    sha256: hashPayload(e.content),
    description: e.description,
    content: structuredClone(e.content ?? null) as Json,
    captured_by: by.user ?? null,
    captured_by_agent: by.agent ?? null,
  })
}

const actorRef = (actor: { type: string; id: string }) => (actor.type === 'user' ? { user: actor.id } : { agent: actor.id })

// ---------------------------------------------------------------- imports

export function registerBatch(
  repo: Repo,
  actor: { type: string; id: string },
  input: { data_source_id: string; reporting_period: string | null; file_name: string | null; content: string; is_demo_fixture?: boolean },
): { batch: ImportBatch; duplicate: boolean } {
  const source = repo.require('data_sources', input.data_source_id)
  const sha = hashPayload(input.content)
  const existing = repo.find('import_batches', (b) => b.data_source_id === source.id && b.file_sha256 === sha)
  if (existing) return { batch: existing, duplicate: true }
  const parsed = parseDelimited(input.content)
  if (!parsed.rows.length) throw new ToolError('validation', 'The file has no data rows')
  const missing = Object.keys(source.mapping).length ? missingColumns(parsed.headers, source.mapping) : []
  if (missing.length) throw new ToolError('validation', `The file is missing columns this source needs: ${missing.join(', ')}`)
  const previous = repo
    .list('import_batches', (b) => b.data_source_id === source.id && b.reporting_period === input.reporting_period && !['superseded', 'rejected', 'failed'].includes(b.status))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
  const batch = repo.insert('import_batches', {
    data_source_id: source.id,
    reporting_period: input.reporting_period,
    file_name: input.file_name,
    file_sha256: sha,
    storage_path: null,
    row_count: parsed.rows.length,
    valid_count: null,
    error_count: null,
    status: 'uploaded',
    supersedes_batch_id: previous?.id ?? null,
    approval_id: null,
    job_id: null,
    uploaded_by: actor.type === 'user' ? actor.id : null,
    uploaded_by_agent: actor.type === 'agent' ? actor.id : null,
    is_demo_fixture: Boolean(input.is_demo_fixture),
    committed_at: null,
  })
  parsed.rows.forEach((raw, i) =>
    repo.insert('import_rows', { batch_id: batch.id, row_number: i + 1, raw, normalised: null, validation_errors: [], match_status: 'pending', matched_person_id: null, match_confidence: null, match_basis: null }),
  )
  captureEvidence(repo, { entity_table: 'import_batches', entity_id: batch.id, kind: 'source_file', description: `${input.file_name ?? 'Upload'} (${parsed.rows.length} rows) as received`, content: { file_name: input.file_name, rows: parsed.rows.length, sha } }, actorRef(actor))
  return { batch, duplicate: false }
}

const rowsOf = (repo: Repo, batchId: string) => repo.list('import_rows', (r) => r.batch_id === batchId).sort((a, b) => a.row_number - b.row_number)

export function validateBatch(repo: Repo, batchId: string): ImportBatch {
  const batch = repo.require('import_batches', batchId)
  const source = repo.require('data_sources', batch.data_source_id)
  let errors = 0
  rowsOf(repo, batchId).forEach((row) => {
    const mapped = Object.keys(source.mapping).length ? applyMapping(row.raw, source.mapping) : row.raw
    const v: Validated =
      source.dataset === 'payroll_schedule'
        ? validatePayrollRow(mapped, batch.reporting_period)
        : source.dataset === 'contribution_schedule'
          ? validateContributionRow(mapped, batch.reporting_period)
          : source.dataset === 'investment_holdings'
            ? validateHoldingRow(mapped)
            : { normalised: mapped, errors: [] }
    if (isBlocking(v.errors)) errors++
    repo.update('import_rows', row.id, { normalised: v.normalised, validation_errors: v.errors })
  })
  return repo.update('import_batches', batchId, { status: 'validated', valid_count: batch.row_count - errors, error_count: errors })
}

function candidates(repo: Repo, dataset: string, customerId: string | null): Candidate[] {
  if (dataset === 'payroll_schedule') {
    return repo
      .list('employments', (e) => e.employer_customer_id === customerId && e.status === 'active')
      .map((e) => {
        const p = repo.require('persons', e.person_id)
        return { person_id: p.id, id_hash: p.id_lookup_hash, employee_number: e.employee_number, surname: p.surname, date_of_birth: p.date_of_birth }
      })
  }
  if (dataset === 'contribution_schedule') {
    return repo
      .list('fund_memberships', (m) => m.employer_customer_id === customerId)
      .map((m) => {
        const p = repo.require('persons', m.person_id)
        return { person_id: p.id, id_hash: p.id_lookup_hash, member_number: m.member_number, surname: p.surname, date_of_birth: p.date_of_birth }
      })
  }
  return []
}

export function matchBatch(repo: Repo, batchId: string): ImportBatch {
  const batch = repo.require('import_batches', batchId)
  const source = repo.require('data_sources', batch.data_source_id)
  if (!['payroll_schedule', 'contribution_schedule'].includes(source.dataset)) return repo.update('import_batches', batchId, { status: 'matched' })
  const rows = rowsOf(repo, batchId)
  const pool = candidates(repo, source.dataset, source.customer_id)
  const inputs = rows.map((r) => {
    const n = (r.normalised ?? {}) as Record<string, string | null>
    const id = n.id_number && isValidSaId(n.id_number) ? idLookupHash(n.id_number) : null
    return { key: (n.employee_number ?? n.member_number ?? '') as string, id_hash: id, employee_number: n.employee_number, member_number: n.member_number, surname: n.surname, date_of_birth: n.date_of_birth }
  })
  const results = matchAll(inputs, pool)
  rows.forEach((row, i) => {
    let r = results[i]
    if (isBlocking(row.validation_errors)) r = { status: 'excluded', person_id: r.person_id, confidence: r.confidence, basis: 'Excluded: fix the validation errors and re-import' }
    else if (r.status === 'new' && inputs[i].id_hash) {
      const known = repo.find('persons', (p) => p.id_lookup_hash === inputs[i].id_hash)
      if (known) r = { status: 'new', person_id: known.id, confidence: 1, basis: 'Existing person, new to this employer' }
    }
    repo.update('import_rows', row.id, { match_status: r.status, matched_person_id: r.person_id, match_confidence: r.confidence, match_basis: r.basis })
  })
  return repo.update('import_batches', batchId, { status: 'matched' })
}

export interface MemberChange {
  kind: 'joiner' | 'leaver' | 'salary_change' | 'category_change'
  label: string
  employee_number: string
  person_id: string | null
  employment_id: string | null
  row_id: string | null
  current: Record<string, Json> | null
  suggested: Record<string, Json> | null
}

const currentSalary = (repo: Repo, employmentId: string) =>
  repo.list('salary_history', (s) => s.employment_id === employmentId && !s.effective_to).sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0]

/** What committing a payroll batch would change on the membership register. Shown as Current / Suggested. */
export function payrollChanges(repo: Repo, batchId: string): MemberChange[] {
  const batch = repo.require('import_batches', batchId)
  const source = repo.require('data_sources', batch.data_source_id)
  if (source.dataset !== 'payroll_schedule') return []
  const rows = rowsOf(repo, batchId).filter((r) => ['matched', 'probable', 'new'].includes(r.match_status))
  const active = repo.list('employments', (e) => e.employer_customer_id === source.customer_id && e.status === 'active')
  const changes: MemberChange[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    const n = row.normalised as Record<string, string | number | null>
    const name = `${n.first_names} ${n.surname}`.trim()
    const employment = active.find((e) => e.employee_number === n.employee_number) ?? (row.matched_person_id ? active.find((e) => e.person_id === row.matched_person_id) : undefined)
    if (!employment) {
      changes.push({ kind: 'joiner', label: name, employee_number: String(n.employee_number), person_id: row.matched_person_id, employment_id: null, row_id: row.id, current: null, suggested: { employee_number: n.employee_number, category: n.category, monthly_salary: n.monthly_salary, start_date: batch.reporting_period } })
      continue
    }
    seen.add(employment.id)
    const salary = currentSalary(repo, employment.id)
    const monthly = salary ? r2(salary.annual_amount / 12) : null
    if (monthly !== n.monthly_salary) {
      changes.push({ kind: 'salary_change', label: name, employee_number: employment.employee_number, person_id: employment.person_id, employment_id: employment.id, row_id: row.id, current: { monthly_salary: monthly }, suggested: { monthly_salary: n.monthly_salary, effective_from: batch.reporting_period } })
    }
    if (employment.category !== n.category) {
      changes.push({ kind: 'category_change', label: name, employee_number: employment.employee_number, person_id: employment.person_id, employment_id: employment.id, row_id: row.id, current: { category: employment.category }, suggested: { category: n.category } })
    }
  }
  active
    .filter((e: Employment) => !seen.has(e.id))
    .forEach((e) => {
      const p = repo.require('persons', e.person_id)
      changes.push({ kind: 'leaver', label: `${p.first_names} ${p.surname}`, employee_number: e.employee_number, person_id: e.person_id, employment_id: e.id, row_id: null, current: { status: 'active' }, suggested: { status: 'terminated', end_date: batch.reporting_period ? dayBefore(batch.reporting_period) : null } })
    })
  return changes
}

export function commitPayload(repo: Repo, batchId: string) {
  const batch = repo.require('import_batches', batchId)
  return {
    batch_id: batch.id,
    file_sha256: batch.file_sha256,
    supersedes: batch.supersedes_batch_id,
    changes: payrollChanges(repo, batchId).map((c) => ({ kind: c.kind, employee_number: c.employee_number, suggested: c.suggested })),
  }
}

/** Applies an approved batch once. A repeated commit is a no-op, and a superseded batch is marked so it never counts twice. */
export function commitBatch(repo: Repo, batchId: string, actorId: string | null): ImportBatch {
  const batch = repo.require('import_batches', batchId)
  if (batch.status === 'committed') return batch
  captureEvidence(repo, { entity_table: 'import_batches', entity_id: batch.id, kind: 'extract', description: 'Member changes committed to the register', content: commitPayload(repo, batchId) }, { user: actorId })
  const source = repo.require('data_sources', batch.data_source_id)
  const period = batch.reporting_period ?? new Date().toISOString().slice(0, 8) + '01'
  const scheme = source.customer_id ? repo.find('group_schemes', (s) => s.employer_customer_id === source.customer_id && s.status === 'active') : undefined
  const participation = source.customer_id ? repo.find('fund_participations', (p) => p.employer_customer_id === source.customer_id && p.status === 'active') : undefined
  const now = new Date().toISOString()
  const movement = (c: MemberChange, employmentId: string | null, personId: string | null) =>
    repo.insert('member_movements', {
      employer_customer_id: source.customer_id!,
      scheme_id: scheme?.id ?? null,
      fund_id: participation?.fund_id ?? null,
      employment_id: employmentId,
      person_id: personId,
      movement_type: c.kind,
      effective_date: c.kind === 'leaver' ? dayBefore(period) : period,
      processing_date: now,
      source_batch_id: batch.id,
      before: c.current,
      after: c.suggested,
      cover_before: null,
      cover_after: null,
      status: 'detected',
      approval_id: null,
    })
  for (const c of payrollChanges(repo, batchId)) {
    const row = c.row_id ? repo.get('import_rows', c.row_id) : undefined
    const n = (row?.normalised ?? {}) as Record<string, string | number | null>
    if (c.kind === 'joiner') {
      const person =
        (c.person_id && repo.get('persons', c.person_id)) ||
        resolveOrCreatePerson(repo, { first_names: String(n.first_names ?? ''), surname: String(n.surname ?? ''), date_of_birth: (n.date_of_birth as string) ?? null, id_number: (n.id_number as string) || null }, true).person!
      const employment = repo.insert('employments', { person_id: person.id, employer_customer_id: source.customer_id!, employee_number: String(n.employee_number), category: String(n.category ?? 'general'), status: 'active', start_date: period, end_date: null })
      repo.insert('salary_history', { employment_id: employment.id, employer_customer_id: source.customer_id!, salary_type: 'pensionable', annual_amount: r2(Number(n.monthly_salary) * 12), effective_from: period, effective_to: null, source_batch_id: batch.id, source: 'declared', value_basis: 'reported' })
      if (participation) {
        repo.insert('fund_memberships', { fund_id: participation.fund_id, participation_id: participation.id, employment_id: employment.id, employer_customer_id: source.customer_id!, person_id: person.id, member_number: `PENDING-${employment.employee_number}`, category: employment.category, status: 'active', joined_on: period, exited_on: null })
      }
      movement(c, employment.id, person.id)
    } else if (c.kind === 'salary_change' && c.employment_id) {
      const current = currentSalary(repo, c.employment_id)
      if (current) repo.update('salary_history', current.id, { effective_to: dayBefore(period) })
      repo.insert('salary_history', { employment_id: c.employment_id, employer_customer_id: source.customer_id!, salary_type: 'pensionable', annual_amount: r2(Number(c.suggested!.monthly_salary) * 12), effective_from: period, effective_to: null, source_batch_id: batch.id, source: 'declared', value_basis: 'reported' })
      movement(c, c.employment_id, c.person_id)
    } else if (c.kind === 'category_change' && c.employment_id) {
      repo.update('employments', c.employment_id, { category: String(c.suggested!.category) })
      repo.list('fund_memberships', (m) => m.employment_id === c.employment_id).forEach((m) => repo.update('fund_memberships', m.id, { category: String(c.suggested!.category) }))
      movement(c, c.employment_id, c.person_id)
    } else if (c.kind === 'leaver' && c.employment_id) {
      repo.update('employments', c.employment_id, { status: 'terminated', end_date: dayBefore(period) })
      movement(c, c.employment_id, c.person_id)
    }
  }
  if (batch.supersedes_batch_id) repo.update('import_batches', batch.supersedes_batch_id, { status: 'superseded' })
  return repo.update('import_batches', batchId, { status: 'committed', committed_at: now })
}

registerApprovalSubject('import_batches', {
  currentPayload: (repo, id) => commitPayload(repo, id),
  onRequested: (repo, id, approval) => void repo.update('import_batches', id, { status: 'awaiting_approval', approval_id: approval.id }),
  onDecided: (repo, id, decision, actorId) => {
    if (decision === 'approved') commitBatch(repo, id, actorId)
    else repo.update('import_batches', id, { status: decision === 'rejected' ? 'rejected' : 'matched' })
  },
  describe: (repo, a) => {
    const payload = a.proposed_changes as { changes: Array<{ kind: string }> }
    const count = (k: string) => payload.changes.filter((c) => c.kind === k).length
    const batch = repo.get('import_batches', a.subject_id)
    return {
      lines: [
        `${batch?.file_name ?? 'Import'} · ${batch?.row_count ?? 0} rows`,
        `${count('joiner')} joiners, ${count('leaver')} leavers, ${count('salary_change')} salary changes, ${count('category_change')} category changes`,
        'Approving updates the membership register with effective dates. Nothing is sent to the insurer or administrator.',
      ],
      links: [{ label: 'Review the member changes', to: `/broker/controls/imports/${a.subject_id}` }],
    }
  },
})

// ---------------------------------------------------------------- contribution reconciliation

function contributionRules(repo: Repo, customerId: string, period: string): ContributionRuleVersion {
  const rules = repo
    .list('contribution_rule_versions', (r) => r.employer_customer_id === customerId && r.effective_from <= period && (!r.effective_to || r.effective_to >= period))
    .sort((a, b) => b.version - a.version)[0]
  if (!rules) throw new ToolError('not_found', 'No contribution rules are in force for this employer in the period')
  return rules
}

const usable = (r: ImportRow) => !['excluded', 'pending'].includes(r.match_status)

export function runContributionRecon(
  repo: Repo,
  actor: { type: string; id: string },
  input: { employer_customer_id: string; reporting_period: string; payroll_batch_id: string; admin_batch_id: string; job_id?: string | null },
): ReconciliationRun {
  const definition = repo.find('reconciliation_definitions', (d) => d.key === 'payroll_vs_admin_contributions' && d.is_active)
  if (!definition) throw new ToolError('not_found', 'The contribution reconciliation definition is missing')
  const rules = contributionRules(repo, input.employer_customer_id, input.reporting_period)
  const participation = repo.require('fund_participations', rules.participation_id)
  const left: ReconEntry[] = rowsOf(repo, input.payroll_batch_id)
    .filter(usable)
    .map((r) => {
      const n = r.normalised as Record<string, string | number | null>
      const exp = expectedContribution(Number(n.monthly_salary), String(n.category), rules.rules, input.reporting_period)
      return {
        key: r.matched_person_id ?? `new:${n.employee_number}`,
        label: `${n.first_names} ${n.surname} (${n.employee_number})`,
        person_id: r.matched_person_id,
        row_id: r.id,
        values: { employer_contribution: exp.employer_cents, employee_contribution: exp.employee_cents },
      }
    })
  const right: ReconEntry[] = rowsOf(repo, input.admin_batch_id)
    .filter(usable)
    .map((r) => {
      const n = r.normalised as Record<string, string | number | null>
      return {
        key: r.matched_person_id ?? `unmatched:${n.member_number}`,
        label: `${n.surname} (${n.member_number})`,
        person_id: r.matched_person_id,
        row_id: r.id,
        values: { employer_contribution: toCents(Number(n.employer_contribution)), employee_contribution: toCents(Number(n.employee_contribution)) },
      }
    })
  const result = reconcile(left, right, definition.compare_fields, definition.tolerances)
  repo
    .list('reconciliation_runs', (r) => r.definition_id === definition.id && r.customer_id === input.employer_customer_id && r.reporting_period === input.reporting_period && r.status === 'completed')
    .forEach((r) => repo.update('reconciliation_runs', r.id, { status: 'superseded' }))
  const now = new Date().toISOString()
  const run = repo.insert('reconciliation_runs', {
    definition_id: definition.id,
    reporting_period: input.reporting_period,
    customer_id: input.employer_customer_id,
    scope_ref: { fund_id: participation.fund_id },
    left_batch_id: input.payroll_batch_id,
    right_batch_id: input.admin_batch_id,
    status: 'completed',
    currency: 'ZAR',
    left_total: fromCents(result.left_total),
    right_total: fromCents(result.right_total),
    difference_total: fromCents(result.difference_total),
    matched_count: result.matched,
    difference_count: result.differences,
    left_only_count: result.left_only,
    right_only_count: result.right_only,
    job_id: input.job_id ?? null,
    run_by: actor.type === 'user' ? actor.id : null,
    run_by_agent: actor.type === 'agent' ? actor.id : null,
    completed_at: now,
  })
  result.items.forEach((i) =>
    repo.insert('reconciliation_items', {
      run_id: run.id,
      match_key: i.key,
      label: i.label,
      person_id: i.person_id,
      left_row_id: i.left_row_id,
      right_row_id: i.right_row_id,
      outcome: i.outcome,
      field: i.field,
      measure: 'amount',
      left_value: i.left === null ? null : fromCents(i.left),
      right_value: i.right === null ? null : fromCents(i.right),
      difference: i.difference === null ? null : fromCents(i.difference),
      currency: 'ZAR',
    }),
  )
  captureEvidence(
    repo,
    {
      entity_table: 'reconciliation_runs',
      entity_id: run.id,
      kind: 'calculation',
      description: `Expected contributions (${rules.rules.categories.general ? 'rules v' + rules.version : ''}) vs administrator schedule for ${input.reporting_period.slice(0, 7)}`,
      content: { rules_version: rules.version, rules: rules.rules, left_total_cents: result.left_total, right_total_cents: result.right_total, counts: { matched: result.matched, differences: result.differences, left_only: result.left_only, right_only: result.right_only, duplicates: result.duplicates } },
    },
    actorRef(actor),
  )
  return run
}

const severityFor = (category: ExceptionCategory, amount: number): FinancialException['severity'] =>
  category === 'missing_contribution' || Math.abs(amount) >= 5_000 ? 'high' : Math.abs(amount) >= 1_000 ? 'medium' : 'low'

const FIELD_LABEL: Record<string, string> = { employer_contribution: 'employer contribution', employee_contribution: 'employee contribution', units: 'units', market_value: 'market value', value: 'transfer value', closing_balance: 'closing balance' }

/** One exception per member and problem, deduplicated while it stays open. */
export function raiseExceptions(repo: Repo, runId: string, agent: string | null, prefix = 'recon'): { exceptions: FinancialException[]; created: number } {
  const run = repo.require('reconciliation_runs', runId)
  const items = repo.list('reconciliation_items', (i) => i.run_id === runId && !['matched', 'within_tolerance'].includes(i.outcome))
  const groups = new Map<string, typeof items>()
  items.forEach((i) => groups.set(`${i.match_key}|${i.outcome}`, [...(groups.get(`${i.match_key}|${i.outcome}`) ?? []), i]))
  let created = 0
  const exceptions: FinancialException[] = []
  for (const [, group] of groups) {
    const first = group[0]
    const category: ExceptionCategory =
      prefix === 'transfer' && first.outcome !== 'duplicate'
        ? 'transfer_difference'
        : prefix === 'rollforward'
          ? 'other'
          : first.outcome === 'difference'
            ? prefix === 'holdings'
              ? first.field === 'units'
                ? 'unit_allocation'
                : 'valuation_difference'
              : 'incorrect_amount'
            : first.outcome === 'left_only'
              ? prefix === 'holdings'
                ? 'missing_transaction'
                : 'missing_contribution'
              : first.outcome === 'right_only'
                ? prefix === 'holdings'
                  ? 'missing_transaction'
                  : 'unmatched_member'
                : 'duplicate'
    const amount = r2(group.reduce((s, i) => s + (i.difference ?? i.left_value ?? i.right_value ?? 0), 0))
    const title =
      prefix === 'rollforward'
        ? `Unexplained roll-forward difference of ${randExact(Math.abs(amount))}: the reported closing balance does not equal opening balance plus flows`
        : prefix === 'transfer' && first.outcome === 'left_only'
          ? `Transfer allocation not yet confirmed: ${first.label} (${randExact(first.left_value ?? 0)})`
          : prefix === 'transfer' && first.outcome === 'difference'
            ? `Allocated ${randExact(Math.abs(amount))} ${amount > 0 ? 'less' : 'more'} than the transfer value: ${first.label}`
            : first.outcome === 'difference' && prefix === 'holdings'
              ? `${first.field === 'units' ? 'Unit allocation' : 'Valuation'} difference on ${first.label}: ${first.field === 'units' ? `${Math.abs(amount).toLocaleString('en-ZA')} units` : randExact(Math.abs(amount))}`
              : first.outcome === 'difference'
        ? `${randExact(Math.abs(amount))} ${amount > 0 ? 'short' : 'over'} on the ${group.map((i) => FIELD_LABEL[i.field ?? ''] ?? i.field).join(' and ')}: ${first.label}`
        : first.outcome === 'left_only'
          ? `Missing from the ${prefix === 'holdings' ? 'manager report' : 'administrator schedule'}: ${first.label} (${randExact(first.left_value ?? 0)})`
          : first.outcome === 'right_only'
            ? `On the ${prefix === 'holdings' ? 'manager report' : 'administrator schedule'} but not the ${prefix === 'holdings' ? 'administrator register' : 'payroll'}: ${first.label} (${randExact(first.right_value ?? 0)})`
            : `Duplicate row: ${first.label}`
    const dedupe = `${prefix}:${run.customer_id ?? run.scope_ref.portfolio_id ?? run.scope_ref.transfer_id ?? 'all'}:${run.reporting_period}:${first.match_key}:${category}`
    const open = repo.find('financial_exceptions', (e) => e.dedupe_key === dedupe && ['open', 'investigating', 'awaiting_third_party'].includes(e.status))
    if (open) {
      exceptions.push(repo.update('financial_exceptions', open.id, { run_id: runId, reconciliation_item_id: first.id, amount }))
      continue
    }
    created++
    exceptions.push(
      repo.insert('financial_exceptions', {
        run_id: runId,
        reconciliation_item_id: first.id,
        customer_id: run.customer_id,
        fund_id: run.scope_ref.fund_id ?? null,
        portfolio_id: run.scope_ref.portfolio_id ?? null,
        category,
        title,
        amount,
        currency: 'ZAR',
        severity: severityFor(category, amount),
        status: 'open',
        assigned_to: null,
        due_date: new Date(Date.now() + 10 * 86_400_000).toISOString(),
        proposed_by_agent: agent,
        dedupe_key: dedupe,
      }),
    )
  }
  return { exceptions, created }
}

// ---------------------------------------------------------------- corrections

export const correctionPayload = (s: CorrectionSchedule) => ({ schedule_id: s.id, run_id: s.run_id, lines: s.lines, total: s.total })

export function prepareCorrection(repo: Repo, runId: string, jobId: string | null): CorrectionSchedule {
  const run = repo.require('reconciliation_runs', runId)
  const items = repo.list('reconciliation_items', (i) => i.run_id === runId && ['difference', 'left_only', 'right_only'].includes(i.outcome))
  const byKey = new Map<string, typeof items>()
  items.forEach((i) => byKey.set(i.match_key, [...(byKey.get(i.match_key) ?? []), i]))
  const lines: CorrectionLine[] = [...byKey.values()].map((group) => {
    const first = group[0]
    const expected = r2(first.outcome === 'difference' ? group.reduce((s, i) => s + (i.left_value ?? 0), 0) : (first.left_value ?? 0))
    const reported = r2(first.outcome === 'difference' ? group.reduce((s, i) => s + (i.right_value ?? 0), 0) : (first.right_value ?? 0))
    const employee = first.label.match(/\(([^)]+)\)$/)?.[1] ?? null
    return {
      person_id: first.person_id,
      member: first.label.replace(/\s*\([^)]+\)$/, ''),
      employee_number: employee,
      expected,
      reported,
      difference: r2(expected - reported),
      action:
        first.outcome === 'left_only'
          ? 'Add the member to the administrator schedule and collect the missing contribution'
          : first.outcome === 'right_only'
            ? 'Confirm whether the member left; stop contributions and reverse any not due'
            : `Adjust the ${group.map((i) => FIELD_LABEL[i.field ?? ''] ?? i.field).join(' and ')} to the payroll-based amount`,
    }
  })
  const existing = repo.find('correction_schedules', (s) => s.run_id === runId && ['draft', 'awaiting_approval', 'approved'].includes(s.status))
  if (existing) return existing
  return repo.insert('correction_schedules', {
    run_id: runId,
    customer_id: run.customer_id,
    fund_id: run.scope_ref.fund_id ?? null,
    reporting_period: run.reporting_period,
    lines,
    total: r2(lines.reduce((s, l) => s + l.difference, 0)),
    status: 'draft',
    approval_id: null,
    job_id: jobId,
    released_at: null,
  })
}

registerApprovalSubject('correction_schedules', {
  currentPayload: (repo, id) => correctionPayload(repo.require('correction_schedules', id)),
  onRequested: (repo, id, approval) => void repo.update('correction_schedules', id, { status: 'awaiting_approval', approval_id: approval.id }),
  onDecided: (repo, id, decision) => void repo.update('correction_schedules', id, { status: decision === 'approved' ? 'approved' : decision === 'rejected' ? 'rejected' : 'draft' }),
  describe: (repo, a) => {
    const s = repo.get('correction_schedules', a.subject_id)
    if (!s) return { lines: [], links: [] }
    return {
      lines: [
        `${s.lines.length} correction line${s.lines.length === 1 ? '' : 's'} totalling ${randExact(s.total)} for ${s.reporting_period.slice(0, 7)}`,
        ...s.lines.slice(0, 5).map((l) => `${l.member}: expected ${randExact(l.expected)}, reported ${randExact(l.reported)} → ${l.action}`),
        'Approving releases the schedule as a preview for the administrator. B-Covered does not move money or instruct a payment.',
      ],
      links: [{ label: 'Open the reconciliation', to: `/broker/controls/reconciliations/${s.run_id}` }],
    }
  },
})

registerApprovalSubject('financial_exceptions', {
  currentPayload: (repo, id, approval) => {
    const e = repo.require('financial_exceptions', id)
    return { ...(approval.proposed_changes as object), amount: e.amount, status: e.status }
  },
  onDecided: (repo, id, decision, actorId, approval) => {
    if (decision !== 'approved') return
    const p = approval.proposed_changes as { note: string; amount: number }
    repo.insert('exception_resolutions', { exception_id: id, resolution: 'write_off', note: p.note, amount_resolved: p.amount, approval_id: approval.id, resolved_by: actorId })
    repo.update('financial_exceptions', id, { status: 'written_off' })
  },
  describe: (repo, a) => {
    const e = repo.get('financial_exceptions', a.subject_id)
    const p = a.proposed_changes as { note: string }
    return { lines: [e ? `${e.title}` : 'Exception', `Write off ${randExact(e?.amount ?? 0)}. Reason: ${p.note}`], links: [{ label: 'Financial exceptions', to: '/broker/controls/exceptions' }] }
  },
})

// ---------------------------------------------------------------- tools

const period = z.string().regex(/^\d{4}-\d{2}-01$/)

export const controlsTools = [
  defineTool({
    name: 'import.register',
    description: 'Register a source file as an import batch. The same file twice is recognised by its hash and not imported again.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({ data_source_id: z.uuid(), reporting_period: period.nullable(), file_name: z.string().max(200).nullable(), content: z.string().min(10).max(5_000_000), is_demo_fixture: z.boolean().optional() }),
    run: ({ repo, actor }, input) => registerBatch(repo, actor, input),
    auditEntity: (r) => ({ table: 'import_batches', id: r.batch.id }),
  }),
  defineTool({
    name: 'import.validate',
    description: 'Normalise and validate every row of a batch against its data source mapping.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({ batch_id: z.uuid() }),
    run: ({ repo }, { batch_id }) => validateBatch(repo, batch_id),
    auditEntity: (r) => ({ table: 'import_batches', id: r.id }),
  }),
  defineTool({
    name: 'import.match',
    description: 'Match rows to members by ID number, member or employee number, then surname and date of birth. Repeats are duplicates.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({ batch_id: z.uuid() }),
    run: ({ repo }, { batch_id }) => matchBatch(repo, batch_id),
    auditEntity: (r) => ({ table: 'import_batches', id: r.id }),
  }),
  defineTool({
    name: 'import.request_commit',
    description: 'Ask a person to approve the member changes a payroll batch would make.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({ batch_id: z.uuid() }),
    run: ({ repo, actor, jobId }, { batch_id }) => {
      const batch = repo.require('import_batches', batch_id)
      if (batch.status === 'committed') throw new ToolError('conflict', 'This batch is already committed')
      if (!['matched', 'awaiting_approval'].includes(batch.status)) throw new ToolError('conflict', 'Validate and match the batch first')
      const source = repo.require('data_sources', batch.data_source_id)
      return requestApproval(repo, actor.id, jobId ?? null, {
        approval_type: 'import_commit',
        subject_table: 'import_batches',
        subject_id: batch_id,
        summary: `Commit ${source.name} for ${batch.reporting_period?.slice(0, 7) ?? 'the period'} to the membership register`,
        proposed_changes: commitPayload(repo, batch_id),
        risk_flags: batch.error_count ? [`${batch.error_count} rows excluded for validation errors`] : [],
        evidence: [{ label: 'Import batch', ref: `/broker/controls/imports/${batch_id}` }],
      })
    },
    auditEntity: (r) => ({ table: 'approval_requests', id: r.id }),
  }),
  defineTool({
    name: 'import.commit',
    description: 'Apply an approved batch to the register. Idempotent.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({ batch_id: z.uuid() }),
    run: ({ repo, actor }, { batch_id }) => {
      const batch = repo.require('import_batches', batch_id)
      if (batch.status === 'committed') return batch
      requireApproved(repo, 'import_commit', batch_id, commitPayload(repo, batch_id), 'The import')
      return commitBatch(repo, batch_id, actor.type === 'user' ? actor.id : null)
    },
    auditEntity: (r) => ({ table: 'import_batches', id: r.id }),
  }),
  defineTool({
    name: 'recon.run_contributions',
    description: 'Calculate expected contributions from the payroll and the rules in force, and reconcile them with the administrator schedule.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({ employer_customer_id: z.uuid(), reporting_period: period, payroll_batch_id: z.uuid(), admin_batch_id: z.uuid() }),
    run: ({ repo, actor, jobId }, input) => runContributionRecon(repo, actor, { ...input, job_id: jobId ?? null }),
    auditEntity: (r) => ({ table: 'reconciliation_runs', id: r.id }),
  }),
  defineTool({
    name: 'exception.raise_from_run',
    description: 'Create one exception per member and problem from a reconciliation run, deduplicated while open.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({ run_id: z.uuid(), kind: z.enum(['recon', 'holdings', 'transfer', 'rollforward']).default('recon') }),
    run: ({ repo, actor }, { run_id, kind }) => raiseExceptions(repo, run_id, actor.type === 'agent' ? actor.id : null, kind),
  }),
  defineTool({
    name: 'exception.update',
    description: 'Assign an exception or move it to investigating or awaiting a third party.',
    allow: STAFF,
    sideEffect: true,
    input: z.object({ exception_id: z.uuid(), status: z.enum(['open', 'investigating', 'awaiting_third_party']).optional(), assigned_to: z.uuid().nullable().optional() }),
    run: ({ repo }, { exception_id, ...patch }) => repo.update('financial_exceptions', exception_id, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined))),
    auditEntity: (r) => ({ table: 'financial_exceptions', id: r.id }),
  }),
  defineTool({
    name: 'exception.resolve',
    description: 'Resolve an exception with a reason. Write-offs need a second person’s approval.',
    allow: STAFF,
    sideEffect: true,
    input: z.object({
      exception_id: z.uuid(),
      resolution: z.enum(['corrected_at_source', 'correction_schedule', 'payment_received', 'write_off', 'explained', 'false_positive']),
      note: z.string().min(5).max(1000),
      amount_resolved: z.number().nullable().optional(),
    }),
    run: ({ repo, actor, jobId }, { exception_id, resolution, note, amount_resolved }) => {
      const e = repo.require('financial_exceptions', exception_id)
      if (!['open', 'investigating', 'awaiting_third_party'].includes(e.status)) throw new ToolError('conflict', `This exception is already ${e.status.replace(/_/g, ' ')}`)
      if (resolution === 'write_off') {
        const approval = requestApproval(repo, actor.id, jobId ?? null, {
          approval_type: 'exception_write_off',
          subject_table: 'financial_exceptions',
          subject_id: exception_id,
          summary: `Write off ${randExact(e.amount ?? 0)}: ${e.title}`,
          proposed_changes: { exception_id, note, amount: e.amount, status: e.status },
          risk_flags: Math.abs(e.amount ?? 0) >= 5_000 ? ['Write-off of R5 000 or more'] : [],
          evidence: [],
        })
        return { exception: e, approval_id: approval.id }
      }
      repo.insert('exception_resolutions', { exception_id, resolution, note, amount_resolved: amount_resolved ?? e.amount, approval_id: null, resolved_by: actor.type === 'user' ? actor.id : null })
      return { exception: repo.update('financial_exceptions', exception_id, { status: resolution === 'false_positive' ? 'false_positive' : 'resolved' }), approval_id: null }
    },
    auditEntity: (r) => ({ table: 'financial_exceptions', id: r.exception.id }),
  }),
  defineTool({
    name: 'correction.prepare',
    description: 'Prepare a correction schedule from a reconciliation and request approval to release it.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({ run_id: z.uuid() }),
    run: ({ repo, actor, jobId }, { run_id }) => {
      const schedule = prepareCorrection(repo, run_id, jobId ?? null)
      if (schedule.status === 'approved' || !schedule.lines.length) return { schedule, approval_id: null }
      const approval = requestApproval(repo, actor.id, jobId ?? schedule.job_id, {
        approval_type: 'correction_schedule',
        subject_table: 'correction_schedules',
        subject_id: schedule.id,
        summary: `Release a ${schedule.lines.length}-line contribution correction schedule (${randExact(schedule.total)})`,
        proposed_changes: correctionPayload(schedule),
        risk_flags: schedule.lines.some((l) => l.action.startsWith('Add the member')) ? ['Includes a member missing from the administrator schedule'] : [],
        evidence: [{ label: 'Reconciliation', ref: `/broker/controls/reconciliations/${run_id}` }],
      })
      return { schedule: repo.require('correction_schedules', schedule.id), approval_id: approval.id }
    },
    auditEntity: (r) => ({ table: 'correction_schedules', id: r.schedule.id }),
  }),
  defineTool({
    name: 'correction.release',
    description: 'Release an approved correction schedule as a preview for the administrator. Nothing is sent and no money moves.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({ schedule_id: z.uuid() }),
    run: ({ repo, actor }, { schedule_id }) => {
      const s = repo.require('correction_schedules', schedule_id)
      if (s.status === 'released') return s
      requireApproved(repo, 'correction_schedule', schedule_id, correctionPayload(s), 'The correction schedule')
      captureEvidence(repo, { entity_table: 'correction_schedules', entity_id: s.id, kind: 'report', description: 'Correction schedule released for the administrator (preview only)', content: correctionPayload(s) }, actorRef(actor))
      return repo.update('correction_schedules', schedule_id, { status: 'released', released_at: new Date().toISOString() })
    },
    auditEntity: (r) => ({ table: 'correction_schedules', id: r.id }),
  }),
  defineTool({
    name: 'integration.fetch',
    description: 'Pull a file from a provider adapter into the import pipeline. Refuses any adapter that is not live.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({ adapter_key: z.string(), data_source_id: z.uuid(), reporting_period: period.nullable() }),
    run: ({ repo }, { adapter_key, data_source_id }) => {
      const adapter = adapterFor(adapter_key)
      if (!adapter) throw new ToolError('not_found', `Unknown adapter ${adapter_key}`)
      const source = repo.require('data_sources', data_source_id)
      if (adapter.status !== 'live') throw new ToolError('conflict', `${adapter.label} is not available: it needs ${adapter.requires.join(', ')}. Upload the file as CSV instead.`)
      if (adapter.channel === 'csv' || adapter.channel === 'excel') throw new ToolError('validation', `${adapter.label} takes a file from a person; use the Imports screen for ${source.name}.`)
      throw new ToolError('internal', `${adapter.label} has no fetch implementation`)
    },
  }),
  defineTool({
    name: 'evidence.capture',
    description: 'Capture append-only evidence with a content hash. Evidence can never be changed or deleted.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({ entity_table: z.string(), entity_id: z.uuid(), kind: z.enum(['source_file', 'extract', 'correspondence', 'calculation', 'finding', 'report']), description: z.string().min(3).max(500), content: z.unknown() }),
    run: ({ repo, actor }, input) => captureEvidence(repo, input, actorRef(actor)),
    auditEntity: (r) => ({ table: 'audit_evidence', id: r.id }),
  }),
] as unknown as ToolDef[]
