// Onboarding rules: which requirements apply, when each is satisfied, the application status machine and readiness.
import type {
  ApplicationStatus,
  BrokerageApplication,
  OnboardingItem,
  OnboardingRequirement,
  OnboardingSection,
  SectionValues,
} from '../db/onboardingSchema'
import type { Json, TableName } from '../db/schema'
import type { Repo } from '../db/store'
import { ToolError } from '../lib/errors'
import type { Actor } from '../tools/registry'
import { applicableRequirements, REQUIREMENT_FIELDS, SECTION_FIELDS, SECTIONS, type FieldDef } from './config'

/** Audit event with the actor scope: platform staff acting on a brokerage are always recorded as platform. */
export function logEvent(
  repo: Repo,
  actor: Actor,
  action: string,
  entity: { table: TableName; id: string } | null,
  change: { before?: unknown; after?: unknown } = {},
  scope: 'tenant' | 'platform' = 'tenant',
) {
  repo.insert('audit_events', {
    actor_type: actor.type,
    actor_id: actor.id,
    action,
    entity_table: entity?.table ?? null,
    entity_id: entity?.id ?? null,
    before: (change.before === undefined ? null : structuredClone(change.before)) as Json,
    after: (change.after === undefined ? null : structuredClone(change.after)) as Json,
    job_id: null,
    actor_scope: scope,
  })
}

const OPEN: ApplicationStatus[] = ['draft', 'submitted', 'under_review', 'information_required', 'approved']

/** The brokerage's current application: the open one, otherwise the most recent. */
export function currentApplication(repo: Repo): BrokerageApplication | undefined {
  const apps = repo.list('brokerage_applications').sort((a, b) => b.created_at.localeCompare(a.created_at))
  return apps.find((a) => OPEN.includes(a.status) || a.status === 'active' || a.status === 'suspended') ?? apps[0]
}

export function requireApplication(repo: Repo, id?: string): BrokerageApplication {
  const app = id ? repo.get('brokerage_applications', id) : currentApplication(repo)
  if (!app) throw new ToolError('not_found', 'There is no onboarding application for this brokerage.')
  return app
}

export const EDITABLE: ApplicationStatus[] = ['draft', 'information_required']

export function requireEditable(app: BrokerageApplication) {
  if (!EDITABLE.includes(app.status)) {
    throw new ToolError('conflict', `The application is ${app.status.replace(/_/g, ' ')}; it can only be changed while in draft or when information is requested.`)
  }
}

export function requirementsFor(repo: Repo, app: BrokerageApplication): OnboardingRequirement[] {
  return applicableRequirements(repo.list('onboarding_requirements'), app.brokerage_type, app.declared_modules)
}

// ------------------------------------------------------------------ field values and validation

export function fieldValue(app: BrokerageApplication, path: string): SectionValues[string] | undefined {
  const [section, field] = path.split('.') as [OnboardingSection, string]
  return app.sections[section]?.[field]
}

const isFilled = (v: SectionValues[string] | undefined) => (Array.isArray(v) ? v.length > 0 : typeof v === 'boolean' ? v : Boolean(v && String(v).trim()))

const FORMATS: Record<NonNullable<FieldDef['format']>, { test: RegExp; message: string }> = {
  email: { test: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Enter a valid email address' },
  phone: { test: /^(\+27|0)\d{9}$/, message: 'Enter a South African phone number, for example 0821234567' },
  company_registration: { test: /^\d{4}\/\d{6}\/\d{2}$/, message: 'Use the CIPC format YYYY/NNNNNN/NN' },
  fsp_number: { test: /^\d{3,6}$/, message: 'An FSP number has 3 to 6 digits' },
}

export function fieldError(def: FieldDef, value: SectionValues[string] | undefined): string | null {
  if (!isFilled(value)) return def.required ? 'Required' : null
  if (def.format && typeof value === 'string') {
    const f = FORMATS[def.format]
    const normalised = def.format === 'phone' ? value.replace(/\s/g, '') : value.trim()
    if (!f.test.test(normalised)) return f.message
  }
  return null
}

export function sectionErrors(app: BrokerageApplication, section: OnboardingSection): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const def of SECTION_FIELDS[section] ?? []) {
    const e = fieldError(def, app.sections[section]?.[def.key])
    if (e) errors[def.key] = e
  }
  return errors
}

const fieldOk = (app: BrokerageApplication, path: string) => {
  const [section, key] = path.split('.') as [OnboardingSection, string]
  const def = SECTION_FIELDS[section]?.find((f) => f.key === key)
  const value = fieldValue(app, path)
  return isFilled(value) && (!def || !fieldError(def, value))
}

// ------------------------------------------------------------------ requirement satisfaction

export function requirementSatisfied(repo: Repo, app: BrokerageApplication, req: OnboardingRequirement, item?: OnboardingItem): boolean {
  if (REQUIREMENT_FIELDS[req.key]) return REQUIREMENT_FIELDS[req.key].every((p) => fieldOk(app, p))
  switch (req.key) {
    case 'insurer_relationships':
      return repo.list('insurer_access').length > 0
    case 'team_owner': {
      const members = repo.list('organisation_memberships', (m) => m.status === 'active')
      const owner = members.some((m) => m.role === 'brokerage_owner')
      const rep =
        members.some((m) => m.role === 'representative') ||
        repo.list('brokerage_invitations', (i) => i.role === 'representative' && !i.accepted_at && !i.revoked_at && i.expires_at > new Date().toISOString()).length > 0
      return owner && (rep || app.brokerage_type === 'sole_proprietor')
    }
    case 'commercial_terms':
      return repo.list('organisation_commercial_terms', (t) => t.status === 'agreed').length > 0
    case 'popia_transfer':
      return fieldValue(app, 'migration.choice') === 'empty' || fieldValue(app, 'migration.transfer_attestation') === true
  }
  if (req.kind === 'document') {
    const doc = item?.document_id ? repo.get('documents', item.document_id) : undefined
    return Boolean(doc && doc.review_status !== 'rejected' && doc.review_status !== 'superseded')
  }
  return false
}

/**
 * Brings the checklist in line with the brokerage type and declared modules. Items the brokerage has not yet acted on
 * follow their requirement (outstanding or submitted); reviewed items keep the reviewer's decision until the
 * brokerage changes the underlying information (see markChanged).
 */
export function syncItems(repo: Repo, app: BrokerageApplication): OnboardingItem[] {
  const reqs = requirementsFor(repo, app)
  const keys = new Set(reqs.map((r) => r.key))
  for (const item of repo.list('onboarding_items', (i) => i.application_id === app.id)) {
    if (!keys.has(item.requirement_key) && (item.status === 'outstanding' || item.status === 'submitted')) repo.remove('onboarding_items', item.id)
  }
  for (const req of reqs) {
    let item = repo.find('onboarding_items', (i) => i.application_id === app.id && i.requirement_key === req.key)
    if (!item) {
      item = repo.insert('onboarding_items', {
        application_id: app.id,
        requirement_key: req.key,
        status: 'outstanding',
        document_id: null,
        reviewed_by: null,
        reviewed_at: null,
      })
    }
    if (item.status === 'outstanding' || item.status === 'submitted') {
      const next = requirementSatisfied(repo, app, req, item) ? 'submitted' : 'outstanding'
      if (next !== item.status) repo.update('onboarding_items', item.id, { status: next })
    }
  }
  return repo.list('onboarding_items', (i) => i.application_id === app.id)
}

/** The brokerage changed the information behind a reviewed item: it goes back for review. */
export function markChanged(repo: Repo, app: BrokerageApplication, requirementKeys: string[]) {
  for (const item of repo.list('onboarding_items', (i) => i.application_id === app.id && requirementKeys.includes(i.requirement_key))) {
    if (item.status === 'correction_requested' || item.status === 'rejected') {
      repo.update('onboarding_items', item.id, { status: 'submitted', reviewed_by: null, reviewed_at: null })
    }
  }
}

/** Requirement keys affected by a change to fields in one section. */
export function requirementsForFields(section: OnboardingSection, fields: string[]): string[] {
  const paths = fields.map((f) => `${section}.${f}`)
  const keys = Object.entries(REQUIREMENT_FIELDS)
    .filter(([, ps]) => ps.some((p) => paths.includes(p)))
    .map(([k]) => k)
  if (section === 'migration') keys.push('popia_transfer')
  return keys
}

// ------------------------------------------------------------------ status machine

const TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  draft: ['submitted', 'withdrawn'],
  submitted: ['under_review', 'withdrawn', 'declined'],
  under_review: ['information_required', 'approved', 'declined'],
  information_required: ['submitted', 'withdrawn', 'declined'],
  approved: ['active', 'declined'],
  active: ['suspended'],
  suspended: ['active'],
  declined: [],
  withdrawn: [],
}

export function transition(
  repo: Repo,
  app: BrokerageApplication,
  to: ApplicationStatus,
  actor: Actor,
  actorType: 'user' | 'platform' | 'system',
  reason: string | null = null,
  patch: Partial<BrokerageApplication> = {},
): BrokerageApplication {
  if (!TRANSITIONS[app.status].includes(to)) {
    throw new ToolError('conflict', `An application that is ${app.status.replace(/_/g, ' ')} cannot move to ${to.replace(/_/g, ' ')}.`)
  }
  const updated = repo.update('brokerage_applications', app.id, { ...patch, status: to, status_reason: reason })
  repo.insert('onboarding_status_events', {
    application_id: app.id,
    from_status: app.status,
    to_status: to,
    reason,
    actor_id: actor.type === 'user' ? actor.id : null,
    actor_type: actorType,
  })
  logEvent(repo, actor, `onboarding.${to}`, { table: 'brokerage_applications', id: app.id }, { before: { status: app.status }, after: { status: to, reason } }, actorType === 'platform' ? 'platform' : 'tenant')
  return updated
}

// ------------------------------------------------------------------ readiness

export interface ChecklistEntry {
  item_id: string
  requirement_key: string
  label: string
  section: OnboardingSection
  kind: OnboardingRequirement['kind']
  required: boolean
  status: OnboardingItem['status']
  guidance: string | null
  document_id: string | null
}

export interface SectionProgress {
  key: OnboardingSection
  label: string
  total: number
  done: number
  attention: number
  errors: number
}

export interface Readiness {
  checklist: ChecklistEntry[]
  outstanding: ChecklistEntry[]
  attention: ChecklistEntry[]
  sections: SectionProgress[]
  required_total: number
  required_done: number
  can_submit: boolean
  blockers: string[]
}

export function readiness(repo: Repo, app: BrokerageApplication): Readiness {
  const reqs = new Map(repo.list('onboarding_requirements').map((r) => [r.key, r]))
  const checklist: ChecklistEntry[] = repo
    .list('onboarding_items', (i) => i.application_id === app.id)
    .flatMap((i) => {
      const r = reqs.get(i.requirement_key)
      return r
        ? [{ item_id: i.id, requirement_key: r.key, label: r.label, section: r.section, kind: r.kind, required: r.is_required, status: i.status, guidance: r.guidance, document_id: i.document_id }]
        : []
    })
    .sort((a, b) => SECTIONS.findIndex((s) => s.key === a.section) - SECTIONS.findIndex((s) => s.key === b.section))
  const outstanding = checklist.filter((c) => c.required && c.status === 'outstanding')
  const attention = checklist.filter((c) => c.status === 'correction_requested' || c.status === 'rejected')
  const sections = SECTIONS.map((s) => {
    const own = checklist.filter((c) => c.section === s.key)
    return {
      key: s.key,
      label: s.label,
      total: own.length,
      done: own.filter((c) => c.status !== 'outstanding' && c.status !== 'correction_requested' && c.status !== 'rejected').length,
      attention: own.filter((c) => c.status === 'correction_requested' || c.status === 'rejected').length,
      errors: Object.keys(sectionErrors(app, s.key)).length,
    }
  })
  const required = checklist.filter((c) => c.required)
  const blockers = [
    ...outstanding.map((c) => `${c.label} is outstanding`),
    ...attention.map((c) => `${c.label} needs the correction the reviewer asked for`),
    ...sections.filter((s) => s.errors > 0).map((s) => `${s.label} has fields to fix`),
  ]
  if (!EDITABLE.includes(app.status)) blockers.unshift(`The application is ${app.status.replace(/_/g, ' ')}`)
  return {
    checklist,
    outstanding,
    attention,
    sections,
    required_total: required.length,
    required_done: required.filter((c) => c.status !== 'outstanding' && c.status !== 'correction_requested' && c.status !== 'rejected').length,
    can_submit: blockers.length === 0,
    blockers,
  }
}

export interface ActivationCheck {
  label: string
  ok: boolean
}

/** Everything activation needs. Approval is one check among several, never a shortcut. */
export function activationChecklist(repo: Repo, app: BrokerageApplication): ActivationCheck[] {
  const reqs = new Map(repo.list('onboarding_requirements').map((r) => [r.key, r]))
  const items = repo.list('onboarding_items', (i) => i.application_id === app.id)
  const members = repo.list('organisation_memberships', (m) => m.status === 'active')
  return [
    { label: 'Application approved by a B-Covered reviewer', ok: app.status === 'approved' || app.status === 'active' },
    { label: 'Every required item accepted or waived', ok: items.every((i) => !reqs.get(i.requirement_key)?.is_required || i.status === 'accepted' || i.status === 'waived') },
    { label: 'Commercial terms agreed', ok: repo.list('organisation_commercial_terms', (t) => t.status === 'agreed').length > 0 },
    { label: 'An active brokerage owner', ok: members.some((m) => m.role === 'brokerage_owner') },
    { label: 'At least one product module declared', ok: app.declared_modules.length > 0 },
  ]
}
