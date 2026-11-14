// Client-book migration: CSV or XLSX rows for clients and policies, shaped like the future client-book-import Edge
// Function. Reuses the controls import tables (data_sources, import_batches, import_rows) with client-book datasets.
// Matching only ever looks inside the importing brokerage; records are never merged across brokerages.
import { principal, type Auth } from './api'
import type { DataSource, ImportBatch, ImportRow } from './db/controlsSchema'
import type { MemberRole } from './db/onboardingSchema'
import type { Json } from './db/schema'
import { db, nowIso, type Repo } from './db/store'
import { toCsv } from './domain/controls/parse'
import { hashPayload } from './lib/hash'
import { ToolError } from './lib/errors'
import { can, ROLE_LABEL } from './onboarding/config'
import { logEvent } from './onboarding/domain'
import type { Actor } from './tools/registry'

export type ClientBookDataset = 'client_book_clients' | 'client_book_policies'

export interface ImportField {
  key: string
  label: string
  required: boolean
  hint: string
  synonyms: string[]
  example: string
}

export const CLIENT_FIELDS: ImportField[] = [
  { key: 'client_ref', label: 'Client reference', required: true, hint: 'Your own system’s client number; kept as the source identifier', synonyms: ['client ref', 'client id', 'client no', 'client number', 'customer id', 'customer no', 'customer number', 'reference', 'ref'], example: 'CL-1001' },
  { key: 'client_type', label: 'Client type', required: true, hint: 'personal or commercial', synonyms: ['type', 'client type', 'customer type', 'entity type'], example: 'personal' },
  { key: 'full_name', label: 'Full name', required: true, hint: 'Person or registered business name', synonyms: ['name', 'full name', 'client name', 'customer name', 'company name'], example: 'Thandi Mokoena' },
  { key: 'email', label: 'Email', required: false, hint: '', synonyms: ['email', 'e-mail', 'email address'], example: 'thandi@example.demo' },
  { key: 'phone', label: 'Phone', required: false, hint: 'South African number', synonyms: ['phone', 'mobile', 'cell', 'cellphone', 'telephone', 'contact number'], example: '0825551234' },
  { key: 'id_number', label: 'ID or registration number', required: false, hint: 'Used only to spot duplicates inside your brokerage', synonyms: ['id number', 'id', 'identity number', 'sa id', 'registration number'], example: '8501015800087' },
  { key: 'region', label: 'Province', required: false, hint: '', synonyms: ['province', 'region'], example: 'Gauteng' },
  { key: 'status', label: 'Status', required: false, hint: 'active, prospect or lapsed (default active)', synonyms: ['status', 'client status'], example: 'active' },
]

export const POLICY_FIELDS: ImportField[] = [
  { key: 'policy_ref', label: 'Policy reference', required: true, hint: 'Your own system’s policy identifier', synonyms: ['policy ref', 'policy id', 'reference', 'ref'], example: 'PL-5001' },
  { key: 'client_ref', label: 'Client reference', required: true, hint: 'Must match a client already imported', synonyms: ['client ref', 'client id', 'client no', 'client number', 'customer id', 'customer no'], example: 'CL-1001' },
  { key: 'insurer', label: 'Insurer', required: true, hint: 'Insurer name as listed on the platform', synonyms: ['insurer', 'insurer name', 'company', 'underwriter'], example: 'Protea Insure' },
  { key: 'line', label: 'Line', required: true, hint: 'personal, commercial or life', synonyms: ['line', 'class', 'product line', 'type'], example: 'personal' },
  { key: 'policy_number', label: 'Insurer policy number', required: false, hint: '', synonyms: ['policy number', 'policy no', 'policy #'], example: 'PRO-MV-220011' },
  { key: 'status', label: 'Status', required: false, hint: 'in_force, lapsed or cancelled (default in_force)', synonyms: ['status', 'policy status'], example: 'in_force' },
  { key: 'premium_amount', label: 'Premium', required: false, hint: 'Rands, no symbol', synonyms: ['premium', 'premium amount', 'monthly premium'], example: '985.50' },
  { key: 'premium_frequency', label: 'Premium frequency', required: false, hint: 'monthly or annually', synonyms: ['frequency', 'premium frequency', 'payment frequency'], example: 'monthly' },
  { key: 'inception_date', label: 'Inception date', required: false, hint: 'YYYY-MM-DD', synonyms: ['inception', 'inception date', 'start date', 'commencement date'], example: '2024-03-01' },
]

export const fieldsFor = (dataset: ClientBookDataset) => (dataset === 'client_book_clients' ? CLIENT_FIELDS : POLICY_FIELDS)

export const TRANSFER_STATEMENT =
  'We confirm that our brokerage is the responsible party for this client information, that we are authorised to transfer it to the B-Covered platform for the purpose of servicing these clients, and that clients were informed in line with POPIA.'
export const TRANSFER_STATEMENT_VERSION = 'transfer-2026-11-draft'

/** CSV template with the expected headers and one example row. */
export function clientBookTemplate(dataset: ClientBookDataset): { file_name: string; csv: string } {
  const fields = fieldsFor(dataset)
  return {
    file_name: dataset === 'client_book_clients' ? 'client-book-clients-template.csv' : 'client-book-policies-template.csv',
    csv: toCsv(
      fields.map((f) => f.key),
      [fields.map((f) => f.example)],
    ),
  }
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

export function suggestMapping(dataset: ClientBookDataset, headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {}
  const used = new Set<string>()
  for (const f of fieldsFor(dataset)) {
    const candidates = [f.key.replace(/_/g, ' '), ...f.synonyms].map(norm)
    const match = headers.find((h) => !used.has(h) && candidates.includes(norm(h)))
    if (match) {
      mapping[f.key] = match
      used.add(match)
    }
  }
  return mapping
}

// ---------------------------------------------------------------- access

interface Importer {
  repo: Repo
  actor: Actor
  role: MemberRole
  userId: string
  active: boolean
  orgName: string
}

function importer(auth: Auth, write = true): Importer {
  const p = principal(auth)
  if (!p.user || !p.membership || !p.organisation) throw new ToolError('forbidden', 'Open a brokerage workspace first.')
  if (write && !can(p.membership.role, 'import_clients')) throw new ToolError('forbidden', `${ROLE_LABEL[p.membership.role]}s cannot import records.`)
  if (p.organisation.lifecycle_status === 'suspended' || p.organisation.lifecycle_status === 'closed') throw new ToolError('forbidden', 'This brokerage is not active.')
  return { repo: p.repo, actor: p.actor, role: p.membership.role, userId: p.user.id, active: p.organisation.lifecycle_status === 'active', orgName: p.organisation.name }
}

function sourceFor(repo: Repo, dataset: ClientBookDataset): DataSource {
  const name = 'Client book import'
  return (
    repo.find('data_sources', (s) => s.dataset === dataset && s.name === name) ??
    repo.insert('data_sources', { name, source_kind: 'brokerage', provider_id: null, customer_id: null, channel: 'csv', dataset, mapping: {}, mapping_version: 1, is_active: true })
  )
}

function clientBatch(repo: Repo, batchId: string) {
  const batch = repo.require('import_batches', batchId)
  const source = repo.require('data_sources', batch.data_source_id)
  if (source.dataset !== 'client_book_clients' && source.dataset !== 'client_book_policies') throw new ToolError('not_found', 'That is not a client-book import.')
  return { batch, source, dataset: source.dataset as ClientBookDataset }
}

// ---------------------------------------------------------------- validation and matching

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE = /^(\+27|0)\d{9}$/
const LINE: Record<string, 'short_term_personal' | 'short_term_commercial' | 'individual_life'> = {
  personal: 'short_term_personal',
  'personal lines': 'short_term_personal',
  commercial: 'short_term_commercial',
  business: 'short_term_commercial',
  life: 'individual_life',
  'individual life': 'individual_life',
}
const POLICY_STATUS: Record<string, 'in_force' | 'lapsed' | 'cancelled'> = { in_force: 'in_force', 'in force': 'in_force', active: 'in_force', lapsed: 'lapsed', cancelled: 'cancelled' }

interface Normalised {
  [k: string]: Json
}

function mapped(row: ImportRow, mapping: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(mapping).map(([field, header]) => [field, (row.raw[header] ?? '').trim()]))
}

function validateClient(v: Record<string, string>): { normalised: Normalised; errors: string[] } {
  const errors: string[] = []
  const type = v.client_type?.toLowerCase()
  const customerType = type === 'personal' || type === 'individual' ? 'personal' : type === 'commercial' || type === 'business' || type === 'company' ? 'commercial' : null
  if (!v.client_ref) errors.push('Client reference is required')
  if (!v.full_name || v.full_name.length < 2) errors.push('Full name is required')
  if (!customerType) errors.push('Client type must be personal or commercial')
  const email = v.email?.toLowerCase() || null
  if (email && !EMAIL.test(email)) errors.push(`Email "${v.email}" is not valid`)
  const phone = v.phone ? v.phone.replace(/[\s()-]/g, '') : null
  if (phone && !PHONE.test(phone)) errors.push(`Phone "${v.phone}" is not a South African number`)
  const idNumber = v.id_number ? v.id_number.replace(/\s/g, '') : null
  const status = (v.status || 'active').toLowerCase()
  if (!['active', 'prospect', 'lapsed'].includes(status)) errors.push('Status must be active, prospect or lapsed')
  return {
    normalised: {
      client_ref: v.client_ref || null,
      customer_type: customerType,
      full_name: v.full_name || null,
      email,
      phone,
      id_hash: idNumber ? hashPayload({ id: idNumber }) : null,
      id_last4: idNumber ? idNumber.slice(-4) : null,
      region: v.region || null,
      status,
    },
    errors,
  }
}

function validatePolicy(repo: Repo, v: Record<string, string>): { normalised: Normalised; errors: string[] } {
  const errors: string[] = []
  if (!v.policy_ref) errors.push('Policy reference is required')
  if (!v.client_ref) errors.push('Client reference is required')
  const customer = v.client_ref ? repo.find('customers', (c) => c.source_ref === v.client_ref) : undefined
  if (v.client_ref && !customer) errors.push(`Client "${v.client_ref}" has not been imported yet; import clients first`)
  const insurer = v.insurer ? repo.find('insurers', (i) => i.provider_type === 'insurer' && i.name.toLowerCase() === v.insurer.toLowerCase()) : undefined
  if (!v.insurer) errors.push('Insurer is required')
  else if (!insurer) errors.push(`Insurer "${v.insurer}" is not on the platform`)
  const line = LINE[v.line?.toLowerCase() ?? '']
  if (!line) errors.push('Line must be personal, commercial or life')
  const status = POLICY_STATUS[(v.status || 'in_force').toLowerCase()]
  if (!status) errors.push('Status must be in_force, lapsed or cancelled')
  const premium = v.premium_amount ? Number(v.premium_amount.replace(/[R,\s]/g, '')) : null
  if (premium !== null && (!Number.isFinite(premium) || premium < 0)) errors.push(`Premium "${v.premium_amount}" is not a number`)
  const frequency = (v.premium_frequency || 'monthly').toLowerCase()
  if (!['monthly', 'annually', 'quarterly'].includes(frequency)) errors.push('Premium frequency must be monthly, quarterly or annually')
  const inception = v.inception_date || null
  if (inception && (!/^\d{4}-\d{2}-\d{2}$/.test(inception) || Number.isNaN(Date.parse(inception)))) errors.push(`Inception date "${inception}" must be YYYY-MM-DD`)
  return {
    normalised: {
      policy_ref: v.policy_ref || null,
      client_ref: v.client_ref || null,
      customer_id: customer?.id ?? null,
      insurer_id: insurer?.id ?? null,
      line: line ?? null,
      policy_number: v.policy_number || null,
      status: status ?? null,
      premium_amount: premium,
      premium_frequency: frequency,
      inception_date: inception,
    },
    errors,
  }
}

/** Validates every uncommitted row, flags duplicates inside the file and matches against this brokerage only. */
function validateBatch(repo: Repo, batch: ImportBatch, source: DataSource) {
  const dataset = source.dataset as ClientBookDataset
  const missing = fieldsFor(dataset).filter((f) => f.required && !source.mapping[f.key])
  if (missing.length) throw new ToolError('validation', `Map these required fields first: ${missing.map((f) => f.label).join(', ')}`)
  const rows = repo.list('import_rows', (r) => r.batch_id === batch.id).sort((a, b) => a.row_number - b.row_number)
  // Before activation there are no customers to match against, and operational tables are closed.
  const canMatch = repo.options.operational !== false
  const refSeen = new Map<string, number>()
  const idSeen = new Map<string, number>()
  for (const row of rows) {
    if (row.commit_status === 'committed' || row.commit_status === 'skipped') continue
    const values = mapped(row, source.mapping)
    const { normalised, errors } = dataset === 'client_book_clients' ? validateClient(values) : validatePolicy(repo, values)
    const ref = String((dataset === 'client_book_clients' ? normalised.client_ref : normalised.policy_ref) ?? '')
    if (ref) {
      if (refSeen.has(ref)) errors.push(`Reference ${ref} also appears on row ${refSeen.get(ref)}`)
      else refSeen.set(ref, row.row_number)
    }
    const idHash = normalised.id_hash as string | null
    if (idHash) {
      if (idSeen.has(idHash)) errors.push(`The same ID number also appears on row ${idSeen.get(idHash)}`)
      else idSeen.set(idHash, row.row_number)
    }
    let match: Pick<ImportRow, 'match_status' | 'match_basis' | 'match_confidence'> = { match_status: 'new', match_basis: null, match_confidence: null }
    const previous = (row.normalised ?? {}) as Normalised
    const resolution = previous._resolution as string | undefined
    if (!canMatch) {
      // Nothing to match yet; duplicates inside the file are still flagged above.
    } else if (dataset === 'client_book_clients') {
      const existing = ref ? repo.find('customers', (c) => c.source_ref === ref) : undefined
      if (existing) {
        match = { match_status: 'matched', match_basis: `Already imported as ${existing.full_name}`, match_confidence: 1 }
        normalised._candidate_id = existing.id
      } else {
        const email = normalised.email as string | null
        const phone = normalised.phone as string | null
        const name = String(normalised.full_name ?? '').toLowerCase()
        const candidate = repo.find(
          'customers',
          (c) => (Boolean(email) && c.email?.toLowerCase() === email) || (Boolean(phone) && c.phone === phone && c.full_name.toLowerCase() === name),
        )
        if (candidate) {
          normalised._candidate_id = candidate.id
          normalised._candidate_name = candidate.full_name
          if (resolution === 'link') match = { match_status: 'matched', match_basis: `Linked to existing client ${candidate.full_name}`, match_confidence: 0.9 }
          else if (resolution === 'create') match = { match_status: 'new', match_basis: `Kept separate from ${candidate.full_name}`, match_confidence: null }
          else match = { match_status: 'probable', match_basis: `Possible duplicate of ${candidate.full_name} (${email && candidate.email?.toLowerCase() === email ? 'same email' : 'same name and phone'})`, match_confidence: 0.8 }
        }
      }
    } else {
      const existing = ref ? repo.find('policies', (x) => x.source_ref === ref) : undefined
      if (existing) {
        match = { match_status: 'matched', match_basis: 'Already imported', match_confidence: 1 }
        normalised._candidate_id = existing.id
      }
    }
    if (resolution) normalised._resolution = resolution
    repo.update('import_rows', row.id, {
      normalised,
      validation_errors: errors,
      source_ref: ref || null,
      ...match,
      ...(row.commit_status === 'failed' ? { commit_status: 'pending' as const, commit_error: null } : {}),
    })
  }
  const all = repo.list('import_rows', (r) => r.batch_id === batch.id)
  return repo.update('import_batches', batch.id, {
    status: batch.status === 'committed' && all.every((r) => r.commit_status === 'committed' || r.commit_status === 'skipped') ? 'committed' : 'validated',
    valid_count: all.filter((r) => !r.validation_errors.length).length,
    error_count: all.filter((r) => r.validation_errors.length > 0).length,
  })
}

// ---------------------------------------------------------------- views

export interface ClientBookRowView {
  id: string
  row_number: number
  raw: Record<string, string>
  values: Record<string, string>
  errors: string[]
  match_status: ImportRow['match_status']
  match_basis: string | null
  candidate: { id: string; name: string } | null
  resolution: 'link' | 'create' | null
  commit_status: NonNullable<ImportRow['commit_status']>
  commit_error: string | null
  committed_entity_id: string | null
  /** What committing this row would do now. */
  action: 'create' | 'link' | 'needs_decision' | 'fix_errors' | 'done' | 'skip'
}

export interface ImportSummary {
  total: number
  valid: number
  errors: number
  will_create: number
  will_link: number
  possible_duplicates: number
  committed: number
  failed: number
  skipped: number
}

export interface ClientBookBatchView {
  batch: ImportBatch
  dataset: ClientBookDataset
  fields: ImportField[]
  headers: string[]
  mapping: Record<string, string>
  rows: ClientBookRowView[]
  summary: ImportSummary
  attested: boolean
  transfer_statement: string
  can_import: boolean
  brokerage_active: boolean
}

function rowView(r: ImportRow, mapping: Record<string, string>): ClientBookRowView {
  const n = (r.normalised ?? {}) as Normalised
  const commit = r.commit_status ?? 'pending'
  const action: ClientBookRowView['action'] =
    commit === 'committed' ? 'done' : commit === 'skipped' ? 'skip' : r.validation_errors.length ? 'fix_errors' : r.match_status === 'probable' ? 'needs_decision' : r.match_status === 'matched' ? 'link' : 'create'
  return {
    id: r.id,
    row_number: r.row_number,
    raw: r.raw,
    values: mapped(r, mapping),
    errors: r.validation_errors,
    match_status: r.match_status,
    match_basis: r.match_basis,
    candidate: n._candidate_id ? { id: String(n._candidate_id), name: String(n._candidate_name ?? '') } : null,
    resolution: (n._resolution as 'link' | 'create' | undefined) ?? null,
    commit_status: commit,
    commit_error: r.commit_error ?? null,
    committed_entity_id: r.committed_entity_id ?? null,
    action,
  }
}

function summarise(rows: ClientBookRowView[]): ImportSummary {
  return {
    total: rows.length,
    valid: rows.filter((r) => !r.errors.length).length,
    errors: rows.filter((r) => r.errors.length && r.commit_status !== 'committed').length,
    will_create: rows.filter((r) => r.action === 'create').length,
    will_link: rows.filter((r) => r.action === 'link').length,
    possible_duplicates: rows.filter((r) => r.action === 'needs_decision').length,
    committed: rows.filter((r) => r.commit_status === 'committed').length,
    failed: rows.filter((r) => r.commit_status === 'failed').length,
    skipped: rows.filter((r) => r.commit_status === 'skipped').length,
  }
}

function batchView(i: Importer, batchId: string): ClientBookBatchView {
  const { batch, source, dataset } = clientBatch(i.repo, batchId)
  const rows = i.repo
    .list('import_rows', (r) => r.batch_id === batch.id)
    .sort((a, b) => a.row_number - b.row_number)
    .map((r) => rowView(r, source.mapping))
  const headers = [...new Set(i.repo.list('import_rows', (r) => r.batch_id === batch.id).flatMap((r) => Object.keys(r.raw)))]
  return {
    batch,
    dataset,
    fields: fieldsFor(dataset),
    headers,
    mapping: source.mapping,
    rows,
    summary: summarise(rows),
    attested: Boolean(batch.attested_at),
    transfer_statement: TRANSFER_STATEMENT,
    can_import: can(i.role, 'import_clients'),
    brokerage_active: i.active,
  }
}

export interface ClientBookBatchRow {
  id: string
  dataset: ClientBookDataset
  file_name: string | null
  status: ImportBatch['status']
  row_count: number
  committed: number
  failed: number
  created_at: string
  uploaded_by: string | null
}

export function listClientBookImports(auth: Auth): { batches: ClientBookBatchRow[]; can_import: boolean; brokerage_active: boolean } {
  const i = importer(auth, false)
  const sources = new Map(i.repo.list('data_sources', (s) => s.dataset === 'client_book_clients' || s.dataset === 'client_book_policies').map((s) => [s.id, s]))
  const batches = i.repo
    .list('import_batches', (b) => sources.has(b.data_source_id))
    .map((b) => {
      const rows = i.repo.list('import_rows', (r) => r.batch_id === b.id)
      return {
        id: b.id,
        dataset: sources.get(b.data_source_id)!.dataset as ClientBookDataset,
        file_name: b.file_name,
        status: b.status,
        row_count: b.row_count,
        committed: rows.filter((r) => r.commit_status === 'committed').length,
        failed: rows.filter((r) => r.commit_status === 'failed' || (r.validation_errors.length > 0 && r.commit_status !== 'committed' && r.commit_status !== 'skipped')).length,
        created_at: b.created_at,
        uploaded_by: b.uploaded_by,
      }
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
  return { batches, can_import: can(i.role, 'import_clients'), brokerage_active: i.active }
}

export function getClientBookImport(auth: Auth, body: { batch_id: string }): ClientBookBatchView {
  return batchView(importer(auth, false), body.batch_id)
}

// ---------------------------------------------------------------- steps

/** Step 1: upload. Rows arrive already parsed from CSV or XLSX in the browser; the server never trusts the mapping. */
export function uploadClientBook(auth: Auth, body: { dataset: ClientBookDataset; file_name: string; headers: string[]; rows: Array<Record<string, string>> }): ClientBookBatchView {
  const i = importer(auth)
  if (body.dataset !== 'client_book_clients' && body.dataset !== 'client_book_policies') throw new ToolError('validation', 'Choose clients or policies.')
  if (body.dataset === 'client_book_policies' && !i.active) throw new ToolError('forbidden', 'Policies are imported after activation, once your clients are in. You can preview a client file now.')
  if (!body.rows.length) throw new ToolError('validation', 'The file has no data rows.')
  if (body.rows.length > 5000) throw new ToolError('validation', 'Import at most 5 000 rows at a time in demo mode.')
  const sha = hashPayload({ headers: body.headers, rows: body.rows })
  const batchId = db.transaction(() => {
    const source = sourceFor(i.repo, body.dataset)
    const duplicate = i.repo.find('import_batches', (b) => b.data_source_id === source.id && b.file_sha256 === sha && b.status !== 'rejected')
    if (duplicate) throw new ToolError('conflict', `This file was already uploaded (${duplicate.file_name ?? 'earlier batch'}). Open that import to correct and retry rows.`, { batch_id: duplicate.id })
    const mapping = suggestMapping(body.dataset, body.headers)
    i.repo.update('data_sources', source.id, { mapping, mapping_version: source.mapping_version + 1 })
    const batch = i.repo.insert('import_batches', {
      data_source_id: source.id,
      reporting_period: null,
      file_name: body.file_name.slice(0, 160),
      file_sha256: sha,
      storage_path: null,
      row_count: body.rows.length,
      valid_count: null,
      error_count: null,
      status: 'uploaded',
      supersedes_batch_id: null,
      approval_id: null,
      job_id: null,
      uploaded_by: i.userId,
      uploaded_by_agent: null,
      is_demo_fixture: false,
      committed_at: null,
      transfer_attestation: null,
      attested_by: null,
      attested_at: null,
    })
    body.rows.forEach((raw, idx) =>
      i.repo.insert('import_rows', {
        batch_id: batch.id,
        row_number: idx + 2,
        raw: Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, String(v ?? '').slice(0, 500)])),
        normalised: null,
        validation_errors: [],
        match_status: 'pending',
        matched_person_id: null,
        match_confidence: null,
        match_basis: null,
        source_ref: null,
        commit_status: 'pending',
        commit_error: null,
        committed_entity_id: null,
      }),
    )
    logEvent(i.repo, i.actor, 'import.client_book_uploaded', { table: 'import_batches', id: batch.id }, { after: { dataset: body.dataset, rows: body.rows.length } })
    if (fieldsFor(body.dataset).every((f) => !f.required || mapping[f.key])) validateBatch(i.repo, batch, i.repo.require('data_sources', source.id))
    return batch.id
  })
  return batchView(i, batchId)
}

/** Steps 2–4: map columns, validate, find duplicates inside this brokerage and preview. */
export function mapClientBook(auth: Auth, body: { batch_id: string; mapping: Record<string, string> }): ClientBookBatchView {
  const i = importer(auth)
  const { batch, source, dataset } = clientBatch(i.repo, body.batch_id)
  const known = new Set(fieldsFor(dataset).map((f) => f.key))
  const mapping = Object.fromEntries(Object.entries(body.mapping).filter(([k, v]) => known.has(k) && v))
  db.transaction(() => {
    const updated = i.repo.update('data_sources', source.id, { mapping, mapping_version: source.mapping_version + 1 })
    validateBatch(i.repo, batch, updated)
  })
  return batchView(i, batch.id)
}

/** Correct a row in place. Committed rows are fixed in the record itself, never re-imported. */
export function correctClientBookRow(auth: Auth, body: { row_id: string; values: Record<string, string> }): ClientBookBatchView {
  const i = importer(auth)
  const row = i.repo.require('import_rows', body.row_id)
  if (row.commit_status === 'committed') throw new ToolError('conflict', 'This row is already imported; change the client record instead.')
  const { batch, source } = clientBatch(i.repo, row.batch_id)
  db.transaction(() => {
    const raw = { ...row.raw }
    for (const [field, value] of Object.entries(body.values)) {
      const header = source.mapping[field] ?? field
      raw[header] = String(value ?? '').slice(0, 500)
    }
    i.repo.update('import_rows', row.id, { raw, commit_status: 'pending', commit_error: null })
    logEvent(i.repo, i.actor, 'import.row_corrected', { table: 'import_rows', id: row.id }, { after: { row_number: row.row_number, fields: Object.keys(body.values) } })
    validateBatch(i.repo, batch, source)
  })
  return batchView(i, batch.id)
}

export function resolveClientBookDuplicate(auth: Auth, body: { row_id: string; resolution: 'link' | 'create' | 'skip' }): ClientBookBatchView {
  const i = importer(auth)
  const row = i.repo.require('import_rows', body.row_id)
  if (row.commit_status === 'committed') throw new ToolError('conflict', 'This row is already imported.')
  const { batch, source } = clientBatch(i.repo, row.batch_id)
  db.transaction(() => {
    if (body.resolution === 'skip') i.repo.update('import_rows', row.id, { commit_status: 'skipped', match_status: 'excluded' })
    else i.repo.update('import_rows', row.id, { normalised: { ...((row.normalised ?? {}) as Normalised), _resolution: body.resolution }, commit_status: 'pending', match_status: 'pending' })
    logEvent(i.repo, i.actor, 'import.duplicate_resolved', { table: 'import_rows', id: row.id }, { after: { resolution: body.resolution } })
    validateBatch(i.repo, batch, source)
  })
  return batchView(i, batch.id)
}

export function attestClientBook(auth: Auth, body: { batch_id: string; confirmed: boolean }): ClientBookBatchView {
  const i = importer(auth)
  if (!body.confirmed) throw new ToolError('validation', 'Confirm that you are authorised to transfer this information.')
  const { batch } = clientBatch(i.repo, body.batch_id)
  db.transaction(() => {
    i.repo.update('import_batches', batch.id, { transfer_attestation: { statement: TRANSFER_STATEMENT, version: TRANSFER_STATEMENT_VERSION }, attested_by: i.userId, attested_at: nowIso() })
    logEvent(i.repo, i.actor, 'import.transfer_attested', { table: 'import_batches', id: batch.id }, { after: { version: TRANSFER_STATEMENT_VERSION } })
  })
  return batchView(i, batch.id)
}

/**
 * Step 5: commit every valid, decided row that is not yet committed. Each row commits on its own, so one bad row
 * never blocks the rest; a retry only touches rows still pending or failed, and source references make it idempotent.
 */
export function commitClientBook(auth: Auth, body: { batch_id: string }): ClientBookBatchView & { result: { committed: number; failed: number; linked: number } } {
  const i = importer(auth)
  if (!i.active) throw new ToolError('forbidden', 'Imports are committed after your brokerage is activated. You can upload and preview now.')
  const { batch, source, dataset } = clientBatch(i.repo, body.batch_id)
  if (!batch.attested_at) throw new ToolError('validation', 'Confirm that you are authorised to transfer this information before importing.')
  validateBatch(i.repo, batch, source)
  const migration = source.name
  const result = { committed: 0, failed: 0, linked: 0 }
  for (const row of i.repo.list('import_rows', (r) => r.batch_id === batch.id && (r.commit_status === 'pending' || r.commit_status === 'failed'))) {
    const fresh = i.repo.require('import_rows', row.id)
    const n = (fresh.normalised ?? {}) as Normalised
    const fail = (message: string) => {
      i.repo.update('import_rows', fresh.id, { commit_status: 'failed', commit_error: message })
      result.failed++
    }
    if (fresh.validation_errors.length) {
      fail(fresh.validation_errors.join('; '))
      continue
    }
    if (fresh.match_status === 'probable') {
      fail('Possible duplicate: choose link, keep separate or skip')
      continue
    }
    try {
      db.transaction(() => {
        if (dataset === 'client_book_clients') {
          const ref = String(n.client_ref)
          const already = i.repo.find('customers', (c) => c.source_ref === ref)
          const linkTo = already ?? (n._resolution === 'link' && n._candidate_id ? i.repo.get('customers', String(n._candidate_id)) : undefined)
          if (linkTo) {
            if (!linkTo.source_ref) i.repo.update('customers', linkTo.id, { source_system: migration, source_ref: ref })
            i.repo.update('import_rows', fresh.id, { commit_status: 'committed', commit_error: null, committed_entity_id: linkTo.id })
            result.linked++
            return
          }
          const created = i.repo.insert('customers', {
            customer_type: n.customer_type as 'personal' | 'commercial',
            full_name: String(n.full_name),
            email: (n.email as string) ?? null,
            phone: (n.phone as string) ?? null,
            region: (n.region as string) ?? null,
            status: n.status as 'active' | 'prospect' | 'lapsed',
            is_synthetic: false,
            created_by: i.userId,
            source_system: migration,
            source_ref: ref,
            import_batch_id: batch.id,
            data_origin: 'imported',
          })
          i.repo.update('import_rows', fresh.id, { commit_status: 'committed', commit_error: null, committed_entity_id: created.id })
        } else {
          const ref = String(n.policy_ref)
          const already = i.repo.find('policies', (x) => x.source_ref === ref)
          if (already) {
            i.repo.update('import_rows', fresh.id, { commit_status: 'committed', commit_error: null, committed_entity_id: already.id })
            result.linked++
            return
          }
          const inception = (n.inception_date as string) ?? null
          const created = i.repo.insert('policies', {
            customer_id: String(n.customer_id),
            line: n.line as 'short_term_personal' | 'short_term_commercial' | 'individual_life',
            provider_id: String(n.insurer_id),
            product_version_id: null,
            record_of_advice_id: null,
            adviser_id: null,
            policy_number: (n.policy_number as string) ?? null,
            origin: 'existing_imported',
            status: n.status as 'in_force' | 'lapsed' | 'cancelled',
            underwriting_status: null,
            premium_amount: (n.premium_amount as number) ?? null,
            premium_frequency: n.premium_frequency as 'monthly' | 'quarterly' | 'annually',
            inception_date: inception,
            anniversary_month: inception ? Number(inception.slice(5, 7)) : null,
            source: 'declared',
            job_id: null,
            source_ref: ref,
            import_batch_id: batch.id,
            data_origin: 'imported',
          })
          i.repo.update('import_rows', fresh.id, { commit_status: 'committed', commit_error: null, committed_entity_id: created.id })
        }
        result.committed++
      })
    } catch (e) {
      fail(e instanceof Error ? e.message : 'Could not import this row')
    }
  }
  db.transaction(() => {
    const rows = i.repo.list('import_rows', (r) => r.batch_id === batch.id)
    const done = rows.every((r) => r.commit_status === 'committed' || r.commit_status === 'skipped')
    i.repo.update('import_batches', batch.id, { status: done ? 'committed' : 'validated', committed_at: batch.committed_at ?? (result.committed + result.linked ? nowIso() : null) })
    logEvent(i.repo, i.actor, 'import.client_book_committed', { table: 'import_batches', id: batch.id }, { after: result })
  })
  return { ...batchView(i, batch.id), result }
}

/** Step 6: rows that are invalid or failed, with their errors, as CSV. */
export function clientBookErrorReport(auth: Auth, body: { batch_id: string }): { file_name: string; csv: string } {
  const i = importer(auth, false)
  const view = batchView(i, body.batch_id)
  const bad = view.rows.filter((r) => r.commit_status === 'failed' || (r.errors.length && r.commit_status !== 'committed') || r.action === 'needs_decision')
  return {
    file_name: `${(view.batch.file_name ?? 'import').replace(/\.[^.]+$/, '')}-errors.csv`,
    csv: toCsv(
      ['row_number', 'source_ref', 'problem', ...view.headers],
      bad.map((r) => [r.row_number, r.values.client_ref ?? r.values.policy_ref ?? '', r.commit_error ?? (r.errors.join('; ') || r.match_basis || ''), ...view.headers.map((h) => r.raw[h] ?? '')]),
    ),
  }
}
