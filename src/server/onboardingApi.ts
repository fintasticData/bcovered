// Brokerage onboarding handlers, shaped like the future Supabase RPCs and Edge Functions (accept_invitation,
// switch_workspace, activate_brokerage, send-invitation, document-link, insurer-access). The UI reaches them only via
// src/api/client.ts. Every handler resolves the caller server-side and checks membership capability or platform role.
import { NO_TENANT, principal, requirePlatform, type Auth, type Principal } from './api'
import { documentFixture, hashToken, SAMPLE_FACTS } from './db/onboardingSeed'
import type {
  ApplicationStatus,
  BrokerageApplication,
  BrokerageInvitation,
  BrokerageType,
  Document,
  ExtractedFieldProposal,
  InsurerAccess,
  MemberRole,
  OnboardingFeedback,
  OnboardingInternalNote,
  OnboardingSection,
  OnboardingStatusEvent,
  OrganisationCommercialTerms,
  OrganisationProductModule,
  PlatformRole,
  ProductModule,
  SectionValues,
} from './db/onboardingSchema'
import type { AuditEvent, Json, Organisation } from './db/schema'
import { crossTenant, db, identity, newId, nowIso, Repo } from './db/store'
import { hashPayload } from './lib/hash'
import { ToolError } from './lib/errors'
import {
  can,
  capabilitiesOf,
  DOCUMENT_LINK_TTL_MINUTES,
  INVITATION_TTL_DAYS,
  LEGACY_ROLE,
  MAX_STORED_FILE_BYTES,
  MAX_UPLOAD_BYTES,
  PACKAGES,
  PLATFORM_ROLE_LABEL,
  READ_ONLY_ROLES,
  REQUIREMENTS,
  ROLE_LABEL,
  SECTION_FIELDS,
  SECTIONS,
  TERMS_VERSION,
  type Capability,
} from './onboarding/config'
import {
  activationChecklist,
  currentApplication,
  EDITABLE,
  logEvent,
  markChanged,
  readiness,
  requireApplication,
  requireEditable,
  requirementsForFields,
  sectionErrors,
  syncItems,
  transition,
  type ActivationCheck,
  type Readiness,
} from './onboarding/domain'
import { decodeText, proposeFromDocument } from './onboarding/extraction'
import { integrationFor, maskSecret, UNSUPPORTED_REASON, type InsurerAccessView } from './onboarding/insurers'
import type { Actor } from './tools/registry'

const MEMBER_ROLES: MemberRole[] = ['brokerage_owner', 'brokerage_admin', 'representative', 'operations_admin', 'compliance_reviewer', 'read_only']
const SECTION_KEYS = SECTIONS.map((s) => s.key)
/** Records are kept for this long after suspension or closure; a placeholder until retention rules are agreed. */
const RETENTION_YEARS = 5

// ---------------------------------------------------------------- helpers

interface Member {
  p: Principal
  repo: Repo
  role: MemberRole
  actor: Actor
  org: Organisation
}

function member(auth: Auth): Member {
  const p = principal(auth)
  if (!p.user || !p.membership || !p.organisation) throw new ToolError('forbidden', 'Sign in and open a brokerage workspace first.')
  return { p, repo: p.repo, role: p.membership.role, actor: p.actor, org: p.organisation }
}

function requireCap(m: Member, capability: Capability) {
  if (!can(m.role, capability)) throw new ToolError('forbidden', `${ROLE_LABEL[m.role]}s cannot do this.`)
}

/** Platform staff act on one brokerage through a repository that cannot read its operational records. */
function platformRepo(tenantId: string) {
  if (!identity.organisation(tenantId)) throw new ToolError('not_found', 'That brokerage does not exist.')
  return new Repo(tenantId, { operational: false, platform: true })
}

function platformApp(auth: Auth, applicationId: string, roles?: PlatformRole[]) {
  const p = principal(auth)
  const staff = requirePlatform(p, roles)
  const found = crossTenant.find('brokerage_applications', (a) => a.id === applicationId)
  if (!found) throw new ToolError('not_found', 'That application does not exist.')
  const repo = platformRepo(found.tenant_id)
  return { p, staff, repo, app: repo.require('brokerage_applications', applicationId), actor: p.actor }
}

const REVIEWERS: PlatformRole[] = ['platform_admin', 'onboarding_reviewer']

function randomToken() {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

const userName = (id: string | null | undefined) => (id ? (identity.user(id)?.full_name ?? 'Unknown user') : null)

function slugify(name: string) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'brokerage'
  return `${base}-${randomToken().slice(0, 6)}`
}

function createOrganisation(name: string, type: BrokerageType | null): Organisation {
  const id = newId()
  return new Repo(id).insert('organisations', {
    id,
    name,
    slug: slugify(name),
    fsp_number: null,
    fsp_verified: false,
    is_demo: true,
    kind: 'brokerage',
    legal_name: null,
    trading_name: name,
    registration_number: null,
    brokerage_type: type,
    lifecycle_status: 'onboarding',
    status_reason: null,
    activated_at: null,
    suspended_at: null,
    retention_until: null,
  })
}

function newApplication(repo: Repo, route: BrokerageApplication['route'], type: BrokerageType | null, invitationId: string | null, name: string) {
  return repo.insert('brokerage_applications', {
    route,
    invitation_id: invitationId,
    status: 'draft',
    status_reason: null,
    brokerage_type: type,
    sections: { organisation: { trading_name: name, brokerage_type: type } },
    current_section: 'organisation',
    declared_modules: [],
    migration_choice: null,
    assigned_reviewer: null,
    revision: 0,
    submitted_at: null,
    approved_at: null,
    approved_by: null,
    activated_at: null,
    activated_by: null,
  })
}

/** Re-evaluates the checklist after a change, but only while the brokerage may still edit; decisions are then frozen. */
function refresh(repo: Repo, app: BrokerageApplication | undefined) {
  if (app && EDITABLE.includes(app.status)) syncItems(repo, app)
}

// ---------------------------------------------------------------- local auth stand-in (Supabase Auth)

function hashPassword(password: string, salt: string) {
  let h = `${salt}:${password}`
  for (let i = 0; i < 500; i++) h = hashPayload({ h, salt })
  return h
}

export function signUp(body: { email: string; password: string; full_name: string }): { user_id: string } {
  const email = body.email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ToolError('validation', 'Enter a valid email address.')
  if (body.password.length < 8) throw new ToolError('validation', 'Use a password of at least 8 characters.')
  if (body.full_name.trim().length < 2) throw new ToolError('validation', 'Enter your full name.')
  if (identity.userByEmail(email)) throw new ToolError('conflict', 'An account with this email already exists. Sign in instead.')
  return db.transaction(() => {
    const user = new Repo(NO_TENANT).insert('app_users', { email, full_name: body.full_name.trim(), role: 'visitor', customer_id: null, active_organisation_id: null })
    const salt = randomToken().slice(0, 16)
    new Repo(NO_TENANT).insert('auth_identities', { user_id: user.id, email, password_salt: salt, password_hash: hashPassword(body.password, salt) })
    return { user_id: user.id }
  })
}

export function signIn(body: { email: string; password: string }): { user_id: string } {
  const cred = identity.credentials(body.email)
  if (!cred || cred.password_hash !== hashPassword(body.password, cred.password_salt)) {
    throw new ToolError('forbidden', 'Email or password is incorrect. Seeded demo people sign in with the “Demo as” switcher instead.')
  }
  return { user_id: cred.user_id }
}

export function switchWorkspace(auth: Auth, body: { organisation_id: string }) {
  const p = principal(auth)
  if (!p.user) throw new ToolError('forbidden', 'Sign in first.')
  const membership = identity.memberships(p.user.id).find((m) => m.tenant_id === body.organisation_id && m.status === 'active')
  if (!membership) throw new ToolError('forbidden', 'You are not a member of that brokerage.')
  const repo = new Repo(body.organisation_id)
  db.transaction(() => {
    repo.update('app_users', p.user!.id, { active_organisation_id: body.organisation_id })
    logEvent(repo, p.actor, 'workspace.switched', { table: 'organisations', id: body.organisation_id })
  })
  return { organisation_id: body.organisation_id }
}

// ---------------------------------------------------------------- invitations

export type InvitationState = 'valid' | 'expired' | 'used' | 'revoked'

const invitationState = (i: BrokerageInvitation): InvitationState =>
  i.revoked_at ? 'revoked' : i.accepted_at ? 'used' : i.expires_at <= nowIso() ? 'expired' : 'valid'

export interface InvitationPreview {
  state: InvitationState
  brokerage_name: string
  role: MemberRole
  role_label: string
  kind: BrokerageInvitation['kind']
  email: string
  expires_at: string
}

export function getInvitation(body: { token: string }): InvitationPreview {
  const inv = identity.invitationByHash(hashToken(body.token))
  if (!inv) throw new ToolError('not_found', 'This invitation link is not valid.')
  return {
    state: invitationState(inv),
    brokerage_name: identity.organisation(inv.tenant_id)?.name ?? 'Brokerage',
    role: inv.role,
    role_label: ROLE_LABEL[inv.role],
    kind: inv.kind,
    email: inv.email,
    expires_at: inv.expires_at,
  }
}

export function acceptInvitation(auth: Auth, body: { token: string }): { organisation_id: string; home: string } {
  const p = principal(auth)
  if (!p.user) throw new ToolError('forbidden', 'Sign in or create an account with the invited email address first.')
  const inv = identity.invitationByHash(hashToken(body.token))
  if (!inv) throw new ToolError('not_found', 'This invitation link is not valid.')
  const state = invitationState(inv)
  if (state !== 'valid') throw new ToolError('forbidden', `This invitation has ${state === 'used' ? 'already been used' : state === 'expired' ? 'expired' : 'been revoked'}.`)
  if (inv.email.toLowerCase() !== p.user.email.toLowerCase()) throw new ToolError('forbidden', `This invitation was sent to ${inv.email}. Sign in with that address.`)
  const repo = new Repo(inv.tenant_id)
  const user = p.user
  db.transaction(() => {
    repo.update('brokerage_invitations', inv.id, { accepted_at: nowIso(), accepted_by: user.id })
    const existing = repo.find('organisation_memberships', (m) => m.user_id === user.id)
    if (existing) repo.update('organisation_memberships', existing.id, { role: inv.role, status: 'active' })
    else repo.insert('organisation_memberships', { user_id: user.id, role: inv.role, status: 'active', invited_by: inv.invited_by })
    const home = user.tenant_id === NO_TENANT
    repo.update('app_users', user.id, { active_organisation_id: inv.tenant_id, ...(home ? { tenant_id: inv.tenant_id, role: LEGACY_ROLE[inv.role] } : {}) })
    logEvent(repo, { type: 'user', id: user.id, role: LEGACY_ROLE[inv.role] }, 'invitation.accepted', { table: 'brokerage_invitations', id: inv.id }, { after: { role: inv.role } })
    refresh(repo, currentApplication(repo))
  })
  const org = identity.organisation(inv.tenant_id)
  return { organisation_id: inv.tenant_id, home: org?.lifecycle_status === 'active' ? '/broker' : '/onboarding' }
}

export interface CreatedInvitation {
  invitation: BrokerageInvitation
  /** Shown once. Only its hash is stored. */
  token: string
  link: string
  email_preview: { to: string; subject: string; body: string }
}

function issueInvitation(repo: Repo, actor: Actor, values: { email: string; role: MemberRole; kind: BrokerageInvitation['kind']; days: number }, brokerageName: string, scope: 'tenant' | 'platform'): CreatedInvitation {
  const email = values.email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ToolError('validation', 'Enter a valid email address.')
  const token = randomToken()
  for (const old of repo.list('brokerage_invitations', (i) => i.email === email && !i.accepted_at && !i.revoked_at)) {
    repo.update('brokerage_invitations', old.id, { revoked_at: nowIso() })
  }
  const invitation = repo.insert('brokerage_invitations', {
    email,
    role: values.role,
    kind: values.kind,
    token_hash: hashToken(token),
    expires_at: new Date(Date.now() + values.days * 86_400_000).toISOString(),
    accepted_at: null,
    accepted_by: null,
    revoked_at: null,
    invited_by: actor.id,
  })
  logEvent(repo, actor, 'invitation.created', { table: 'brokerage_invitations', id: invitation.id }, { after: { email, role: values.role, kind: values.kind } }, scope)
  const link = `/brokers/invite/${token}`
  return {
    invitation,
    token,
    link,
    email_preview: {
      to: email,
      subject: values.kind === 'owner' ? `You're invited to set up ${brokerageName} on B-Covered` : `Join ${brokerageName} on B-Covered`,
      body: `You have been invited as ${ROLE_LABEL[values.role]}. Open ${link} within ${values.days} days. The link works once. (Preview only: no email is sent in demo mode.)`,
    },
  }
}

/** B-Covered invites the owner of a new brokerage: the workspace, a draft application and an expiring single-use link. */
export function createOwnerInvitation(auth: Auth, body: { brokerage_name: string; email: string; expires_in_days?: number }): CreatedInvitation & { organisation_id: string; application_id: string } {
  const p = principal(auth)
  requirePlatform(p, ['platform_admin'])
  const name = body.brokerage_name.trim()
  if (name.length < 2) throw new ToolError('validation', 'Enter the brokerage name.')
  const days = Math.min(Math.max(body.expires_in_days ?? INVITATION_TTL_DAYS, 1), 30)
  return db.transaction(() => {
    const org = createOrganisation(name, null)
    const repo = new Repo(org.id)
    const created = issueInvitation(repo, p.actor, { email: body.email, role: 'brokerage_owner', kind: 'owner', days }, name, 'platform')
    const app = newApplication(repo, 'invitation', null, created.invitation.id, name)
    repo.insert('onboarding_status_events', { application_id: app.id, from_status: null, to_status: 'draft', reason: 'Owner invited by B-Covered', actor_id: p.user!.id, actor_type: 'platform' })
    syncItems(repo, app)
    return { ...created, organisation_id: org.id, application_id: app.id }
  })
}

export function createTeamInvitation(auth: Auth, body: { email: string; role: MemberRole }): CreatedInvitation {
  const m = member(auth)
  requireCap(m, 'manage_team')
  if (!MEMBER_ROLES.includes(body.role)) throw new ToolError('validation', 'Choose a role.')
  if (body.role === 'brokerage_owner' && m.role !== 'brokerage_owner') throw new ToolError('forbidden', 'Only an owner can invite another owner.')
  if (m.org.lifecycle_status === 'suspended') throw new ToolError('forbidden', 'This brokerage is suspended.')
  const email = body.email.trim().toLowerCase()
  const existing = m.repo.list('organisation_memberships', (x) => x.status === 'active').find((x) => identity.user(x.user_id)?.email.toLowerCase() === email)
  if (existing) throw new ToolError('conflict', 'That person is already on the team.')
  return db.transaction(() => {
    const created = issueInvitation(m.repo, m.actor, { email, role: body.role, kind: 'team', days: INVITATION_TTL_DAYS }, m.org.name, 'tenant')
    refresh(m.repo, currentApplication(m.repo))
    return created
  })
}

export function revokeInvitation(auth: Auth, body: { invitation_id: string }) {
  const p = principal(auth)
  if (p.platform && !p.membership) {
    requirePlatform(p, ['platform_admin'])
    const inv = crossTenant.find('brokerage_invitations', (i) => i.id === body.invitation_id)
    if (!inv) throw new ToolError('not_found', 'That invitation does not exist.')
    const repo = platformRepo(inv.tenant_id)
    return db.transaction(() => {
      const out = repo.update('brokerage_invitations', inv.id, { revoked_at: nowIso() })
      logEvent(repo, p.actor, 'invitation.revoked', { table: 'brokerage_invitations', id: inv.id }, {}, 'platform')
      return out
    })
  }
  const m = member(auth)
  requireCap(m, 'manage_team')
  const inv = m.repo.require('brokerage_invitations', body.invitation_id)
  if (inv.accepted_at) throw new ToolError('conflict', 'That invitation has already been accepted.')
  return db.transaction(() => {
    const out = m.repo.update('brokerage_invitations', inv.id, { revoked_at: nowIso() })
    logEvent(m.repo, m.actor, 'invitation.revoked', { table: 'brokerage_invitations', id: inv.id })
    refresh(m.repo, currentApplication(m.repo))
    return out
  })
}

// ---------------------------------------------------------------- applications (brokerage side)

/** Public "Join as a broker": a signed-in person starts a draft for a new brokerage, or resumes their open one. */
export function startApplication(auth: Auth, body: { brokerage_name: string; brokerage_type?: BrokerageType | null }): { organisation_id: string; application_id: string; resumed: boolean } {
  const p = principal(auth)
  if (!p.user) throw new ToolError('forbidden', 'Create an account or sign in first.')
  if (p.user.role === 'customer') throw new ToolError('forbidden', 'Customer portal accounts cannot apply as a brokerage.')
  const user = p.user
  for (const m of identity.memberships(user.id).filter((x) => x.role === 'brokerage_owner' && x.status === 'active')) {
    const repo = new Repo(m.tenant_id)
    const open = repo.list('brokerage_applications', (a) => a.route === 'application' && EDITABLE.includes(a.status))[0]
    if (open) {
      repo.update('app_users', user.id, { active_organisation_id: m.tenant_id })
      return { organisation_id: m.tenant_id, application_id: open.id, resumed: true }
    }
  }
  const name = body.brokerage_name.trim()
  if (name.length < 2) throw new ToolError('validation', 'Enter your brokerage’s trading name.')
  return db.transaction(() => {
    const org = createOrganisation(name, body.brokerage_type ?? null)
    const repo = new Repo(org.id)
    repo.insert('organisation_memberships', { user_id: user.id, role: 'brokerage_owner', status: 'active', invited_by: null })
    repo.update('app_users', user.id, { active_organisation_id: org.id, ...(user.tenant_id === NO_TENANT ? { tenant_id: org.id, role: 'manager' as const } : {}) })
    const app = newApplication(repo, 'application', body.brokerage_type ?? null, null, name)
    repo.insert('onboarding_status_events', { application_id: app.id, from_status: null, to_status: 'draft', reason: 'Applied through Join as a broker', actor_id: user.id, actor_type: 'user' })
    logEvent(repo, { type: 'user', id: user.id, role: 'manager' }, 'onboarding.started', { table: 'brokerage_applications', id: app.id })
    syncItems(repo, app)
    return { organisation_id: org.id, application_id: app.id, resumed: false }
  })
}

export interface TeamMemberView {
  membership_id: string
  user_id: string
  full_name: string
  email: string
  role: MemberRole
  role_label: string
  status: 'active' | 'suspended' | 'removed'
  is_you: boolean
}

export interface InvitationView {
  id: string
  email: string
  role: MemberRole
  role_label: string
  kind: BrokerageInvitation['kind']
  state: InvitationState
  expires_at: string
  created_at: string
}

export interface TeamView {
  members: TeamMemberView[]
  invitations: InvitationView[]
}

function teamView(repo: Repo, youId: string | null): TeamView {
  return {
    members: repo
      .list('organisation_memberships', (m) => m.status !== 'removed')
      .map((m) => {
        const u = identity.user(m.user_id)
        return { membership_id: m.id, user_id: m.user_id, full_name: u?.full_name ?? 'Unknown', email: u?.email ?? '', role: m.role, role_label: ROLE_LABEL[m.role], status: m.status, is_you: m.user_id === youId }
      })
      .sort((a, b) => MEMBER_ROLES.indexOf(a.role) - MEMBER_ROLES.indexOf(b.role)),
    invitations: repo
      .list('brokerage_invitations')
      .map((i) => ({ id: i.id, email: i.email, role: i.role, role_label: ROLE_LABEL[i.role], kind: i.kind, state: invitationState(i), expires_at: i.expires_at, created_at: i.created_at }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at)),
  }
}

function insurerViews(repo: Repo): InsurerAccessView[] {
  const insurers = repo.list('insurers', (i) => i.provider_type === 'insurer')
  return repo
    .list('insurer_access')
    .map((a) => {
      const insurer = insurers.find((i) => i.id === a.insurer_id)
      const integration = insurer ? integrationFor(insurer, a.product_module) : null
      const cred = repo.find('insurer_access_credentials', (c) => c.insurer_access_id === a.id)
      return { ...a, insurer_name: insurer?.name ?? 'Unknown insurer', supported: Boolean(integration), integration_label: integration?.label ?? null, credential_hint: cred?.masked_hint ?? null }
    })
    .sort((a, b) => a.insurer_name.localeCompare(b.insurer_name))
}

export interface DocumentView extends Document {
  requirement_key: string | null
  has_content: boolean
}

export interface ExtractionProposalView extends ExtractedFieldProposal {
  document_name: string
  field_label: string
}

export interface FeedbackView extends OnboardingFeedback {
  author_name: string
  requirement_label: string | null
}

export interface ApplicationView {
  organisation: Organisation
  application: BrokerageApplication
  readiness: Readiness
  field_errors: Partial<Record<OnboardingSection, Record<string, string>>>
  documents: DocumentView[]
  proposals: ExtractionProposalView[]
  feedback: FeedbackView[]
  history: Array<OnboardingStatusEvent & { actor_name: string | null }>
  team: TeamView
  insurers: InsurerAccessView[]
  terms: OrganisationCommercialTerms | null
  modules: OrganisationProductModule[]
}

export interface OnboardingView extends ApplicationView {
  member_role: MemberRole
  capabilities: Capability[]
  read_only: boolean
}

const fieldLabel = (path: string) => {
  const [section, key] = path.split('.') as [OnboardingSection, string]
  return SECTION_FIELDS[section]?.find((f) => f.key === key)?.label ?? key
}

function applicationView(repo: Repo, app: BrokerageApplication, youId: string | null): ApplicationView {
  const org = repo.require('organisations', app.tenant_id)
  const items = repo.list('onboarding_items', (i) => i.application_id === app.id)
  const docs = repo.list('documents', (d) => d.owner_table === 'brokerage_applications' && d.owner_id === app.id)
  const labels = new Map(REQUIREMENTS.map((r) => [r.key, r.label]))
  return {
    organisation: org,
    application: app,
    readiness: readiness(repo, app),
    field_errors: Object.fromEntries(SECTION_KEYS.map((s) => [s, sectionErrors(app, s)]).filter(([, e]) => Object.keys(e as object).length)),
    documents: docs
      .map((d) => ({
        ...d,
        requirement_key: items.find((i) => i.document_id === d.id)?.requirement_key ?? d.doc_type,
        has_content: Boolean(repo.find('storage_objects', (o) => o.path === d.storage_path)?.content_base64),
      }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    proposals: repo
      .list('extracted_field_proposals')
      .filter((x) => docs.some((d) => d.id === x.document_id))
      .map((x) => ({ ...x, document_name: docs.find((d) => d.id === x.document_id)?.file_name ?? 'Document', field_label: fieldLabel(x.target_field) }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    feedback: repo
      .list('onboarding_feedback', (f) => f.application_id === app.id)
      .map((f) => {
        const item = f.item_id ? items.find((i) => i.id === f.item_id) : undefined
        return { ...f, author_name: userName(f.author_id) ?? 'B-Covered', requirement_label: item ? (labels.get(item.requirement_key) ?? null) : null }
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    history: repo
      .list('onboarding_status_events', (e) => e.application_id === app.id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((e) => ({ ...e, actor_name: userName(e.actor_id) })),
    team: teamView(repo, youId),
    insurers: insurerViews(repo),
    terms: repo.list('organisation_commercial_terms', (t) => t.status === 'agreed').sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null,
    modules: repo.list('organisation_product_modules'),
  }
}

export function getOnboarding(auth: Auth): OnboardingView {
  const m = member(auth)
  const app = requireApplication(m.repo)
  return {
    ...applicationView(m.repo, app, m.p.user!.id),
    member_role: m.role,
    capabilities: capabilitiesOf(m.role),
    read_only: READ_ONLY_ROLES.includes(m.role),
  }
}

function sanitise(section: OnboardingSection, values: SectionValues): SectionValues {
  const defs = SECTION_FIELDS[section]
  if (!defs) throw new ToolError('validation', 'This section has no editable fields.')
  const out: SectionValues = {}
  for (const [key, raw] of Object.entries(values)) {
    const def = defs.find((d) => d.key === key)
    if (!def) throw new ToolError('validation', `Unknown field ${key}`)
    if (def.type === 'checkbox') out[key] = raw === true
    else if (def.type === 'multi') {
      const list = Array.isArray(raw) ? raw.map(String) : []
      const allowed = new Set(def.options?.map((o) => o.value))
      out[key] = list.filter((v) => allowed.has(v))
    } else if (def.type === 'select') {
      out[key] = raw === null || raw === '' ? null : def.options?.some((o) => o.value === raw) ? String(raw) : null
    } else out[key] = raw === null ? null : String(raw).slice(0, 2000)
  }
  return out
}

/** Autosave for one section. Values are stored even when invalid; validation errors come back for the editor. */
function applySectionValues(m: Member, app: BrokerageApplication, section: OnboardingSection, values: SectionValues, via: string) {
  const clean = sanitise(section, values)
  const before = app.sections[section] ?? {}
  const changedKeys = Object.keys(clean).filter((k) => JSON.stringify(before[k] ?? null) !== JSON.stringify(clean[k] ?? null))
  if (!changedKeys.length) return app
  const sections = { ...app.sections, [section]: { ...before, ...clean } }
  const patch: Partial<BrokerageApplication> = { sections }
  if (section === 'organisation' && 'brokerage_type' in clean) patch.brokerage_type = (clean.brokerage_type as BrokerageType | null) ?? null
  if (section === 'products' && 'modules' in clean) patch.declared_modules = clean.modules as ProductModule[]
  if (section === 'migration' && 'choice' in clean) patch.migration_choice = (clean.choice as 'import' | 'empty' | null) ?? null
  const updated = m.repo.update('brokerage_applications', app.id, patch)
  if (section === 'organisation') {
    const o = sections.organisation ?? {}
    m.repo.update('organisations', m.org.id, {
      name: String(o.trading_name || m.org.name),
      trading_name: (o.trading_name as string) || null,
      legal_name: (o.legal_name as string) || null,
      registration_number: (o.registration_number as string) || null,
      brokerage_type: updated.brokerage_type,
    })
  }
  if (section === 'profile' && 'fsp_number' in clean) m.repo.update('organisations', m.org.id, { fsp_number: (clean.fsp_number as string) || null, fsp_verified: false })
  if (section === 'products') {
    const declared = updated.declared_modules
    for (const row of m.repo.list('organisation_product_modules')) {
      if (!declared.includes(row.module) && row.status === 'declared') m.repo.remove('organisation_product_modules', row.id)
    }
    for (const module of declared) {
      if (!m.repo.find('organisation_product_modules', (r) => r.module === module)) {
        m.repo.insert('organisation_product_modules', { module, status: 'declared', decided_by: null, decided_at: null })
      }
    }
  }
  markChanged(m.repo, updated, requirementsForFields(section, changedKeys))
  logEvent(m.repo, m.actor, via, { table: 'brokerage_applications', id: app.id }, { before: { section, values: pick(before, changedKeys) }, after: { section, values: pick(clean, changedKeys) } })
  syncItems(m.repo, updated)
  return m.repo.require('brokerage_applications', app.id)
}

const pick = (o: SectionValues, keys: string[]) => Object.fromEntries(keys.map((k) => [k, o[k] ?? null]))

export function saveSection(auth: Auth, body: { section: OnboardingSection; values: SectionValues }) {
  const m = member(auth)
  requireCap(m, body.section === 'migration' ? 'import_clients' : 'edit_setup')
  const app = requireApplication(m.repo)
  requireEditable(app)
  return db.transaction(() => {
    const updated = applySectionValues(m, app, body.section, body.values, 'onboarding.section_saved')
    return { application: updated, errors: sectionErrors(updated, body.section), saved_at: updated.updated_at }
  })
}

/** Remembers where the person was, so the journey resumes there. Read-only members browse without saving. */
export function setCurrentSection(auth: Auth, body: { section: OnboardingSection }) {
  const m = member(auth)
  if (!SECTION_KEYS.includes(body.section)) throw new ToolError('validation', 'Unknown section.')
  const app = requireApplication(m.repo)
  if (READ_ONLY_ROLES.includes(m.role) || app.current_section === body.section) return { current_section: app.current_section }
  m.repo.update('brokerage_applications', app.id, { current_section: body.section })
  return { current_section: body.section }
}

export function submitApplication(auth: Auth) {
  const m = member(auth)
  requireCap(m, 'submit')
  const app = requireApplication(m.repo)
  requireEditable(app)
  return db.transaction(() => {
    syncItems(m.repo, app)
    const r = readiness(m.repo, app)
    if (!r.can_submit) throw new ToolError('validation', `Not ready to submit: ${r.blockers.slice(0, 3).join('; ')}${r.blockers.length > 3 ? '…' : ''}`, r.blockers)
    for (const f of m.repo.list('onboarding_feedback', (x) => x.application_id === app.id && !x.resolved_at)) {
      m.repo.update('onboarding_feedback', f.id, { resolved_at: nowIso() })
    }
    const resubmission = app.status === 'information_required'
    return transition(m.repo, app, 'submitted', m.actor, 'user', resubmission ? 'Resubmitted with corrections' : null, {
      submitted_at: nowIso(),
      revision: app.revision + 1,
    })
  })
}

export function withdrawApplication(auth: Auth, body: { reason: string }) {
  const m = member(auth)
  if (m.role !== 'brokerage_owner') throw new ToolError('forbidden', 'Only the owner can withdraw the application.')
  const app = requireApplication(m.repo)
  if (!body.reason?.trim()) throw new ToolError('validation', 'Give a reason for withdrawing.')
  return db.transaction(() => {
    const out = transition(m.repo, app, 'withdrawn', m.actor, 'user', body.reason.trim())
    m.repo.update('organisations', m.org.id, { lifecycle_status: 'closed', status_reason: 'Application withdrawn' })
    return out
  })
}

export function agreeTerms(auth: Auth, body: { package_key: string; accept: boolean }) {
  const m = member(auth)
  requireCap(m, 'agree_terms')
  const pkg = PACKAGES.find((x) => x.key === body.package_key)
  if (!pkg) throw new ToolError('validation', 'Choose a platform package.')
  if (!body.accept) throw new ToolError('validation', 'Accept the platform terms to continue.')
  const app = currentApplication(m.repo)
  if (app && !EDITABLE.includes(app.status) && app.status !== 'active') requireEditable(app)
  return db.transaction(() => {
    for (const t of m.repo.list('organisation_commercial_terms', (x) => x.status !== 'superseded')) m.repo.update('organisation_commercial_terms', t.id, { status: 'superseded' })
    const terms = m.repo.insert('organisation_commercial_terms', {
      package_key: pkg.key,
      terms: { version: TERMS_VERSION, package: pkg.label, monthly_fee: pkg.monthly_fee, note: 'Indicative until B-Covered agrees its commercial model' },
      status: 'agreed',
      agreed_by: m.p.user!.id,
      agreed_at: nowIso(),
    })
    logEvent(m.repo, m.actor, 'onboarding.terms_agreed', { table: 'organisation_commercial_terms', id: terms.id }, { after: { package_key: pkg.key, version: TERMS_VERSION } })
    if (app) {
      markChanged(m.repo, app, ['commercial_terms'])
      refresh(m.repo, app)
    }
    return terms
  })
}

// ---------------------------------------------------------------- documents (tenant-documents bucket stand-in)

function storeDocument(m: Member, app: BrokerageApplication, requirementKey: string, file: { file_name: string; mime_type: string | null; size: number; content_base64: string | null }, origin: Document['data_origin']) {
  const req = m.repo.get('onboarding_requirements', requirementKey)
  if (!req || req.kind !== 'document') throw new ToolError('validation', 'Choose which document this is.')
  const item = m.repo.find('onboarding_items', (i) => i.application_id === app.id && i.requirement_key === requirementKey)
  if (!item) throw new ToolError('validation', 'That document is not required for this brokerage.')
  if (item.status === 'accepted') throw new ToolError('conflict', 'This document has already been accepted.')
  if (file.size > MAX_UPLOAD_BYTES) throw new ToolError('validation', 'Files must be smaller than 5 MB.')
  const id = newId()
  const safeName = file.file_name.replace(/[^\w.\- ()]+/g, '_').slice(0, 120) || 'document'
  const path = `${m.org.id}/brokerage_applications/${app.id}/${id}-${safeName}`
  const content = file.content_base64 && file.size <= MAX_STORED_FILE_BYTES ? file.content_base64 : null
  if (item.document_id) m.repo.update('documents', item.document_id, { review_status: 'superseded' })
  const doc = m.repo.insert('documents', {
    id,
    owner_table: 'brokerage_applications',
    owner_id: app.id,
    doc_type: requirementKey,
    file_name: safeName,
    mime_type: file.mime_type,
    file_size: file.size,
    sha256: hashPayload(file.content_base64 ?? `${safeName}:${file.size}`),
    storage_path: path,
    review_status: 'uploaded',
    data_origin: origin,
    uploaded_by: m.p.user!.id,
  })
  m.repo.insert('storage_objects', { path, mime_type: file.mime_type, size: file.size, content_base64: content })
  m.repo.update('onboarding_items', item.id, { document_id: doc.id, status: 'submitted', reviewed_by: null, reviewed_at: null })
  logEvent(m.repo, m.actor, 'document.uploaded', { table: 'documents', id: doc.id }, { after: { file_name: safeName, requirement_key: requirementKey, size: file.size } })
  const proposals = proposeFromDocument(m.repo, app, doc, decodeText(content, file.mime_type))
  syncItems(m.repo, m.repo.require('brokerage_applications', app.id))
  return { document: doc, proposals }
}

export function uploadDocument(auth: Auth, body: { requirement_key: string; file_name: string; mime_type: string | null; size: number; content_base64: string | null }) {
  const m = member(auth)
  requireCap(m, 'upload_documents')
  const app = requireApplication(m.repo)
  requireEditable(app)
  return db.transaction(() => storeDocument(m, app, body.requirement_key, body, 'live'))
}

/** Demo helper: uploads a fictional sample of the document so the review and extraction flow can be tried. */
export function useSampleDocument(auth: Auth, body: { requirement_key: string }) {
  const m = member(auth)
  requireCap(m, 'upload_documents')
  const app = requireApplication(m.repo)
  requireEditable(app)
  // The sample repeats the brokerage's own draft where it has one, and fills gaps with the fictional sample brokerage.
  const o = app.sections.organisation ?? {}
  const pr = app.sections.profile ?? {}
  const own = (v: unknown, fallback: string) => (typeof v === 'string' && v.trim() ? v : fallback)
  const fixture = documentFixture(body.requirement_key, {
    legal_name: own(o.legal_name, own(o.trading_name, SAMPLE_FACTS.legal_name)),
    registration_number: own(o.registration_number, SAMPLE_FACTS.registration_number),
    fsp_number: own(pr.fsp_number, SAMPLE_FACTS.fsp_number),
    key_individual: own(pr.key_individual, SAMPLE_FACTS.key_individual),
    address: own(o.registered_address, SAMPLE_FACTS.address),
    compliance_officer: own(pr.compliance_officer, SAMPLE_FACTS.compliance_officer),
  })
  if (!fixture) throw new ToolError('validation', 'There is no sample for this document.')
  const content = btoa(String.fromCharCode(...new TextEncoder().encode(fixture.text)))
  return db.transaction(() => storeDocument(m, app, body.requirement_key, { file_name: `SAMPLE ${fixture.file_name}`, mime_type: 'text/plain', size: fixture.text.length, content_base64: content }, 'demo'))
}

/** Issues a short-lived link to one document, the stand-in for a signed Storage URL. Every issue is audited. */
export function getDocumentLink(auth: Auth, body: { document_id: string }): { token: string; expires_at: string } {
  const p = principal(auth)
  if (!p.user) throw new ToolError('forbidden', 'Sign in first.')
  let repo: Repo
  let scope: 'tenant' | 'platform' = 'tenant'
  if (p.membership) {
    repo = p.repo
    if (!repo.get('documents', body.document_id) && p.platform) repo = platformDocRepo(p, body.document_id)
  } else {
    repo = platformDocRepo(p, body.document_id)
    scope = 'platform'
  }
  const doc = repo.require('documents', body.document_id)
  if (scope === 'platform' && doc.owner_table !== 'brokerage_applications') throw new ToolError('forbidden', 'Platform staff can only open onboarding documents.')
  const token = randomToken()
  const expires_at = new Date(Date.now() + DOCUMENT_LINK_TTL_MINUTES * 60_000).toISOString()
  db.transaction(() => {
    repo.insert('document_links', { document_id: doc.id, token, issued_to: p.user!.id, expires_at })
    logEvent(repo, p.actor, 'document.link_issued', { table: 'documents', id: doc.id }, { after: { expires_at } }, scope)
  })
  return { token, expires_at }
}

function platformDocRepo(p: Principal, documentId: string) {
  requirePlatform(p)
  const doc = crossTenant.find('documents', (d) => d.id === documentId)
  if (!doc) throw new ToolError('not_found', 'That document does not exist.')
  return platformRepo(doc.tenant_id)
}

export function openDocumentLink(auth: Auth, body: { token: string }): { file_name: string; mime_type: string | null; content_base64: string | null } {
  const p = principal(auth)
  const link = identity.documentLink(body.token)
  if (!link || !p.user || link.issued_to !== p.user.id) throw new ToolError('forbidden', 'This document link is not valid for you.')
  if (link.expires_at <= nowIso()) throw new ToolError('forbidden', 'This document link has expired. Open the document again.')
  const repo = new Repo(link.tenant_id, { operational: false })
  const doc = repo.require('documents', link.document_id)
  const object = repo.find('storage_objects', (o) => o.path === doc.storage_path)
  logEvent(repo, p.actor, 'document.opened', { table: 'documents', id: doc.id }, {}, p.membership?.tenant_id === link.tenant_id ? 'tenant' : 'platform')
  return { file_name: doc.file_name, mime_type: doc.mime_type, content_base64: object?.content_base64 ?? null }
}

/** Current, Suggested, Apply to draft: only a person applies an extracted value, and the source stays recorded. */
export function decideProposal(auth: Auth, body: { proposal_id: string; decision: 'apply' | 'dismiss' }) {
  const m = member(auth)
  requireCap(m, 'edit_setup')
  const proposal = m.repo.require('extracted_field_proposals', body.proposal_id)
  if (proposal.status !== 'suggested') throw new ToolError('conflict', 'This suggestion has already been decided.')
  const app = requireApplication(m.repo)
  requireEditable(app)
  return db.transaction(() => {
    if (body.decision === 'apply') {
      const [section, field] = proposal.target_field.split('.') as [OnboardingSection, string]
      applySectionValues(m, app, section, { [field]: proposal.suggested_value as string }, 'onboarding.proposal_applied')
    }
    const out = m.repo.update('extracted_field_proposals', proposal.id, { status: body.decision === 'apply' ? 'applied' : 'dismissed', decided_by: m.p.user!.id, decided_at: nowIso() })
    if (body.decision === 'dismiss') logEvent(m.repo, m.actor, 'onboarding.proposal_dismissed', { table: 'extracted_field_proposals', id: proposal.id })
    return out
  })
}

// ---------------------------------------------------------------- team

export function getTeam(auth: Auth): TeamView & { capabilities: Capability[]; member_role: MemberRole } {
  const m = member(auth)
  return { ...teamView(m.repo, m.p.user!.id), capabilities: capabilitiesOf(m.role), member_role: m.role }
}

function guardOwners(repo: Repo, membershipId: string, nextRole: MemberRole | null) {
  const target = repo.require('organisation_memberships', membershipId)
  if (target.role !== 'brokerage_owner' || nextRole === 'brokerage_owner') return target
  const owners = repo.list('organisation_memberships', (m) => m.role === 'brokerage_owner' && m.status === 'active')
  if (owners.length <= 1) throw new ToolError('conflict', 'A brokerage needs at least one active owner.')
  return target
}

export function changeMemberRole(auth: Auth, body: { membership_id: string; role: MemberRole }) {
  const m = member(auth)
  requireCap(m, 'manage_team')
  if (!MEMBER_ROLES.includes(body.role)) throw new ToolError('validation', 'Choose a role.')
  const target = guardOwners(m.repo, body.membership_id, body.role)
  if ((target.role === 'brokerage_owner' || body.role === 'brokerage_owner') && m.role !== 'brokerage_owner') throw new ToolError('forbidden', 'Only an owner can change owners.')
  return db.transaction(() => {
    const out = m.repo.update('organisation_memberships', target.id, { role: body.role })
    logEvent(m.repo, m.actor, 'membership.role_changed', { table: 'organisation_memberships', id: target.id }, { before: { role: target.role }, after: { role: body.role } })
    refresh(m.repo, currentApplication(m.repo))
    return out
  })
}

export function removeMember(auth: Auth, body: { membership_id: string }) {
  const m = member(auth)
  requireCap(m, 'manage_team')
  const target = guardOwners(m.repo, body.membership_id, null)
  if (target.role === 'brokerage_owner' && m.role !== 'brokerage_owner') throw new ToolError('forbidden', 'Only an owner can remove an owner.')
  return db.transaction(() => {
    const out = m.repo.update('organisation_memberships', target.id, { status: 'removed' })
    logEvent(m.repo, m.actor, 'membership.removed', { table: 'organisation_memberships', id: target.id }, { before: { role: target.role } })
    refresh(m.repo, currentApplication(m.repo))
    return out
  })
}

// ---------------------------------------------------------------- insurer access (insurer-access Edge Function stand-in)

export interface InsurerAccessPage {
  rows: InsurerAccessView[]
  insurers: Array<{ id: string; name: string; supported_modules: ProductModule[] }>
  can_manage: boolean
  brokerage_active: boolean
  modules: ProductModule[]
}

export function listInsurerAccess(auth: Auth): InsurerAccessPage {
  const m = member(auth)
  const app = currentApplication(m.repo)
  const enabledModules = m.repo.list('organisation_product_modules', (x) => x.status !== 'disabled').map((x) => x.module)
  return {
    rows: insurerViews(m.repo),
    insurers: m.repo
      .list('insurers', (i) => i.provider_type === 'insurer')
      .map((i) => ({ id: i.id, name: i.name, supported_modules: (['personal_lines', 'commercial', 'individual_life', 'group_risk', 'retirement'] as ProductModule[]).filter((mod) => integrationFor(i, mod)) })),
    can_manage: can(m.role, 'manage_insurers'),
    brokerage_active: m.org.lifecycle_status === 'active',
    modules: enabledModules.length ? enabledModules : (app?.declared_modules ?? []),
  }
}

function accessFor(m: Member, accessId: string) {
  requireCap(m, 'manage_insurers')
  if (m.org.lifecycle_status === 'suspended') throw new ToolError('forbidden', 'This brokerage is suspended.')
  return m.repo.require('insurer_access', accessId)
}

/** Records the relationship and intermediary code. Setting it up never enables quoting on its own. */
export function declareInsurerAccess(auth: Auth, body: { insurer_id: string; product_module: ProductModule; intermediary_code: string; mandate_note?: string }) {
  const m = member(auth)
  requireCap(m, 'manage_insurers')
  const insurer = m.repo.get('insurers', body.insurer_id)
  if (!insurer || insurer.provider_type !== 'insurer') throw new ToolError('validation', 'Choose an insurer.')
  const code = body.intermediary_code.trim()
  if (code.length < 3) throw new ToolError('validation', 'Enter your intermediary code with this insurer.')
  const integration = integrationFor(insurer, body.product_module)
  return db.transaction(() => {
    const existing = m.repo.find('insurer_access', (a) => a.insurer_id === insurer.id && a.product_module === body.product_module)
    const values: Partial<InsurerAccess> = {
      intermediary_code: code,
      mandate: { note: body.mandate_note?.trim() || null },
      integration_key: integration?.key ?? null,
      status: integration ? 'awaiting_credentials' : 'not_configured',
      status_reason: integration ? 'Add the API credentials the insurer issued to your brokerage' : UNSUPPORTED_REASON,
    }
    const row = existing
      ? existing.status === 'enabled'
        ? m.repo.update('insurer_access', existing.id, { intermediary_code: code, mandate: values.mandate! })
        : m.repo.update('insurer_access', existing.id, values)
      : m.repo.insert('insurer_access', {
          insurer_id: insurer.id,
          product_module: body.product_module,
          intermediary_code: code,
          mandate: values.mandate!,
          integration_key: values.integration_key!,
          status: values.status!,
          status_reason: values.status_reason!,
          last_test_at: null,
          last_test_result: null,
          enabled_by: null,
          enabled_at: null,
        })
    logEvent(m.repo, m.actor, 'insurer_access.declared', { table: 'insurer_access', id: row.id }, { after: { insurer: insurer.name, product_module: body.product_module, intermediary_code: code } })
    refresh(m.repo, currentApplication(m.repo))
    return row
  })
}

/** Credentials go to the vault stand-in; only a masked hint is kept beside the access row or returned. */
export function submitInsurerCredentials(auth: Auth, body: { access_id: string; api_key: string }) {
  const m = member(auth)
  const access = accessFor(m, body.access_id)
  const secret = body.api_key.trim()
  if (secret.length < 8) throw new ToolError('validation', 'The credential looks too short.')
  return db.transaction(() => {
    const vault = m.repo.insert('vault_secrets', { secret })
    const hint = maskSecret(secret)
    const existing = m.repo.find('insurer_access_credentials', (c) => c.insurer_access_id === access.id)
    if (existing) {
      m.repo.remove('vault_secrets', existing.vault_secret_id)
      m.repo.update('insurer_access_credentials', existing.id, { vault_secret_id: vault.id, masked_hint: hint, rotated_at: nowIso() })
    } else {
      m.repo.insert('insurer_access_credentials', { insurer_access_id: access.id, vault_secret_id: vault.id, masked_hint: hint, rotated_at: nowIso() })
    }
    const supported = Boolean(access.integration_key)
    const row = m.repo.update('insurer_access', access.id, {
      status: supported ? 'testing' : access.status,
      status_reason: supported ? 'Credentials stored. Run a connection test.' : UNSUPPORTED_REASON,
      last_test_result: null,
    })
    logEvent(m.repo, m.actor, 'insurer_access.credentials_stored', { table: 'insurer_access', id: access.id }, { after: { credential: hint } })
    return { ...row, credential_hint: hint }
  })
}

export function testInsurerAccess(auth: Auth, body: { access_id: string }) {
  const m = member(auth)
  const access = accessFor(m, body.access_id)
  if (m.org.lifecycle_status !== 'active') throw new ToolError('forbidden', 'Insurer connections can be tested once the brokerage is active.')
  const cred = m.repo.find('insurer_access_credentials', (c) => c.insurer_access_id === access.id)
  const result: InsurerAccess['last_test_result'] = !access.integration_key ? 'unsupported' : cred && m.repo.get('vault_secrets', cred.vault_secret_id) ? 'passed' : 'failed'
  return db.transaction(() => {
    const row = m.repo.update('insurer_access', access.id, {
      last_test_at: nowIso(),
      last_test_result: result,
      status: result === 'passed' ? 'testing' : access.status,
      status_reason: result === 'passed' ? 'Connection test passed. Enable when ready.' : result === 'unsupported' ? UNSUPPORTED_REASON : 'Connection test failed: add valid credentials.',
    })
    logEvent(m.repo, m.actor, 'insurer_access.tested', { table: 'insurer_access', id: access.id }, { after: { result } })
    return row
  })
}

export function enableInsurerAccess(auth: Auth, body: { access_id: string }) {
  const m = member(auth)
  const access = accessFor(m, body.access_id)
  if (m.org.lifecycle_status !== 'active') throw new ToolError('forbidden', 'Insurer access can only be enabled for an active brokerage.')
  if (!access.integration_key) throw new ToolError('conflict', UNSUPPORTED_REASON)
  if (access.last_test_result !== 'passed') throw new ToolError('conflict', 'Run a successful connection test before enabling.')
  const module = m.repo.find('organisation_product_modules', (x) => x.module === access.product_module)
  if (module?.status !== 'enabled') throw new ToolError('conflict', 'This product module is not enabled for the brokerage.')
  return db.transaction(() => {
    const row = m.repo.update('insurer_access', access.id, { status: 'enabled', status_reason: null, enabled_by: m.p.user!.id, enabled_at: nowIso() })
    logEvent(m.repo, m.actor, 'insurer_access.enabled', { table: 'insurer_access', id: access.id })
    return row
  })
}

export function disableInsurerAccess(auth: Auth, body: { access_id: string; reason: string }) {
  const p = principal(auth)
  let repo: Repo
  let scope: 'tenant' | 'platform' = 'tenant'
  if (p.membership && can(p.membership.role, 'manage_insurers') && p.repo.get('insurer_access', body.access_id)) repo = p.repo
  else {
    requirePlatform(p, ['platform_admin'])
    const row = crossTenant.find('insurer_access', (a) => a.id === body.access_id)
    if (!row) throw new ToolError('not_found', 'That insurer access does not exist.')
    repo = platformRepo(row.tenant_id)
    scope = 'platform'
  }
  if (!body.reason?.trim()) throw new ToolError('validation', 'Give a reason for disabling.')
  return db.transaction(() => {
    const row = repo.update('insurer_access', body.access_id, { status: 'disabled', status_reason: body.reason.trim() })
    logEvent(repo, p.actor, 'insurer_access.disabled', { table: 'insurer_access', id: body.access_id }, { after: { reason: body.reason.trim() } }, scope)
    return row
  })
}

// ---------------------------------------------------------------- platform review and administration

export interface QueueRow {
  application_id: string
  organisation_id: string
  brokerage: string
  owner: { name: string; email: string } | null
  route: BrokerageApplication['route']
  status: ApplicationStatus
  submitted_at: string | null
  updated_at: string
  outstanding: number
  attention: number
  required_done: number
  required_total: number
  assigned_reviewer: string | null
  brokerage_type: BrokerageType | null
  modules: ProductModule[]
}

export function listOnboardingQueue(auth: Auth, body: { status?: ApplicationStatus[] } = {}): QueueRow[] {
  requirePlatform(principal(auth))
  return crossTenant
    .list('brokerage_applications', (a) => !body.status?.length || body.status.includes(a.status))
    .map((app) => {
      const repo = platformRepo(app.tenant_id)
      const r = readiness(repo, app)
      const owner = repo.list('organisation_memberships', (m) => m.role === 'brokerage_owner' && m.status === 'active')[0]
      const ownerUser = owner ? identity.user(owner.user_id) : undefined
      const invite = !ownerUser ? repo.list('brokerage_invitations', (i) => i.kind === 'owner').sort((a, b) => b.created_at.localeCompare(a.created_at))[0] : undefined
      return {
        application_id: app.id,
        organisation_id: app.tenant_id,
        brokerage: repo.require('organisations', app.tenant_id).name,
        owner: ownerUser ? { name: ownerUser.full_name, email: ownerUser.email } : invite ? { name: 'Invited, not yet accepted', email: invite.email } : null,
        route: app.route,
        status: app.status,
        submitted_at: app.submitted_at,
        updated_at: app.updated_at,
        outstanding: r.outstanding.length,
        attention: r.attention.length,
        required_done: r.required_done,
        required_total: r.required_total,
        assigned_reviewer: userName(app.assigned_reviewer),
        brokerage_type: app.brokerage_type,
        modules: app.declared_modules,
      }
    })
    .sort((a, b) => (b.submitted_at ?? b.updated_at).localeCompare(a.submitted_at ?? a.updated_at))
}

export interface ReviewView extends ApplicationView {
  internal_notes: Array<OnboardingInternalNote & { author_name: string; requirement_label: string | null }>
  activation: ActivationCheck[]
  reviewer: { id: string; name: string } | null
  reviewers: Array<{ id: string; name: string; role_label: string }>
  audit: Array<AuditEvent & { actor_name: string }>
  platform_role: PlatformRole
}

/** Onboarding, membership and access actions only: platform staff never see business payloads from the audit log. */
const PLATFORM_AUDIT = /^(onboarding|brokerage|invitation|workspace|membership|insurer_access|document)\./

function platformAudit(tenantId: string) {
  return crossTenant
    .list('audit_events', (e) => e.tenant_id === tenantId && PLATFORM_AUDIT.test(e.action))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 60)
    .map((e) => ({ ...e, before: null, after: e.action === 'onboarding.section_saved' ? null : e.after, actor_name: userName(e.actor_id) ?? e.actor_id }))
}

export function getOnboardingReview(auth: Auth, body: { application_id: string }): ReviewView {
  const { staff, repo, app } = platformApp(auth, body.application_id)
  const items = repo.list('onboarding_items', (i) => i.application_id === app.id)
  const labels = new Map(REQUIREMENTS.map((r) => [r.key, r.label]))
  return {
    ...applicationView(repo, app, null),
    internal_notes: repo
      .list('onboarding_internal_notes', (n) => n.application_id === app.id)
      .map((n) => {
        const item = n.item_id ? items.find((i) => i.id === n.item_id) : undefined
        return { ...n, author_name: userName(n.author_id) ?? 'Staff', requirement_label: item ? (labels.get(item.requirement_key) ?? null) : null }
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    activation: activationChecklist(repo, app),
    reviewer: app.assigned_reviewer ? { id: app.assigned_reviewer, name: userName(app.assigned_reviewer)! } : null,
    reviewers: identity
      .activePlatformStaff()
      .filter((s) => REVIEWERS.includes(s.role))
      .map((s) => ({ id: s.user_id, name: userName(s.user_id) ?? 'Staff', role_label: PLATFORM_ROLE_LABEL[s.role] })),
    audit: platformAudit(app.tenant_id),
    platform_role: staff.role,
  }
}

export function assignReviewer(auth: Auth, body: { application_id: string; reviewer_id: string | null }) {
  const { repo, app, actor } = platformApp(auth, body.application_id, REVIEWERS)
  if (body.reviewer_id && !identity.platformStaff(body.reviewer_id)) throw new ToolError('validation', 'Choose a B-Covered reviewer.')
  return db.transaction(() => {
    const out = repo.update('brokerage_applications', app.id, { assigned_reviewer: body.reviewer_id })
    logEvent(repo, actor, 'onboarding.reviewer_assigned', { table: 'brokerage_applications', id: app.id }, { after: { reviewer: userName(body.reviewer_id) } }, 'platform')
    return out
  })
}

export function startReview(auth: Auth, body: { application_id: string }) {
  const { p, repo, app, actor } = platformApp(auth, body.application_id, REVIEWERS)
  return db.transaction(() => {
    for (const d of repo.list('documents', (x) => x.owner_id === app.id && x.review_status === 'uploaded')) repo.update('documents', d.id, { review_status: 'in_review' })
    return transition(repo, app, 'under_review', actor, 'platform', null, { assigned_reviewer: app.assigned_reviewer ?? p.user!.id })
  })
}

export type ItemDecision = 'accept' | 'request_correction' | 'reject' | 'waive'

/** One decision on one checklist item. Corrections and rejections must tell the brokerage what to fix. */
export function decideItem(auth: Auth, body: { item_id: string; decision: ItemDecision; feedback?: string; internal_note?: string }) {
  const p = principal(auth)
  requirePlatform(p, REVIEWERS)
  const found = crossTenant.find('onboarding_items', (i) => i.id === body.item_id)
  if (!found) throw new ToolError('not_found', 'That checklist item does not exist.')
  const { repo, app, actor } = platformApp(auth, found.application_id, REVIEWERS)
  if (app.status !== 'under_review') throw new ToolError('conflict', 'Start the review before deciding items.')
  const item = repo.require('onboarding_items', found.id)
  const feedback = body.feedback?.trim()
  if ((body.decision === 'request_correction' || body.decision === 'reject') && !feedback) throw new ToolError('validation', 'Tell the brokerage what needs to change.')
  if (body.decision === 'accept' && item.status === 'outstanding') throw new ToolError('conflict', 'Nothing has been provided for this item yet.')
  const status = { accept: 'accepted', request_correction: 'correction_requested', reject: 'rejected', waive: 'waived' } as const
  return db.transaction(() => {
    const out = repo.update('onboarding_items', item.id, { status: status[body.decision], reviewed_by: p.user!.id, reviewed_at: nowIso() })
    if (item.document_id) {
      const docStatus = body.decision === 'accept' ? 'accepted' : body.decision === 'waive' ? 'in_review' : 'rejected'
      repo.update('documents', item.document_id, { review_status: docStatus })
    }
    if (feedback) repo.insert('onboarding_feedback', { application_id: app.id, item_id: item.id, body: feedback, author_id: p.user!.id, resolved_at: null })
    if (body.internal_note?.trim()) repo.insert('onboarding_internal_notes', { application_id: app.id, item_id: item.id, body: body.internal_note.trim(), author_id: p.user!.id })
    logEvent(repo, actor, 'onboarding.item_decided', { table: 'onboarding_items', id: item.id }, { before: { status: item.status }, after: { status: status[body.decision], requirement: item.requirement_key, feedback: feedback ?? null } }, 'platform')
    return out
  })
}

export function addFeedback(auth: Auth, body: { application_id: string; item_id?: string | null; body: string }) {
  const { p, repo, app, actor } = platformApp(auth, body.application_id, REVIEWERS)
  if (!body.body.trim()) throw new ToolError('validation', 'Write the feedback.')
  return db.transaction(() => {
    const out = repo.insert('onboarding_feedback', { application_id: app.id, item_id: body.item_id ?? null, body: body.body.trim(), author_id: p.user!.id, resolved_at: null })
    logEvent(repo, actor, 'onboarding.feedback_added', { table: 'onboarding_feedback', id: out.id }, {}, 'platform')
    return out
  })
}

export function addInternalNote(auth: Auth, body: { application_id: string; item_id?: string | null; body: string }) {
  const { p, repo, app, actor } = platformApp(auth, body.application_id)
  if (p.platform!.role === 'platform_read_only') throw new ToolError('forbidden', 'Read-only platform staff cannot add notes.')
  if (!body.body.trim()) throw new ToolError('validation', 'Write the note.')
  return db.transaction(() => {
    const out = repo.insert('onboarding_internal_notes', { application_id: app.id, item_id: body.item_id ?? null, body: body.body.trim(), author_id: p.user!.id })
    logEvent(repo, actor, 'onboarding.internal_note_added', { table: 'onboarding_internal_notes', id: out.id }, {}, 'platform')
    return out
  })
}

export function requestInformation(auth: Auth, body: { application_id: string; reason: string }) {
  const { repo, app, actor } = platformApp(auth, body.application_id, REVIEWERS)
  const reason = body.reason?.trim()
  if (!reason) throw new ToolError('validation', 'Summarise what the brokerage needs to provide.')
  const r = readiness(repo, app)
  const unresolved = repo.list('onboarding_feedback', (f) => f.application_id === app.id && !f.resolved_at)
  if (!r.attention.length && !unresolved.length) throw new ToolError('validation', 'Request a correction on at least one item, or add feedback, first.')
  return db.transaction(() => transition(repo, app, 'information_required', actor, 'platform', reason))
}

/** Approves the application only. The workspace stays inactive until a separate activation. */
export function approveApplication(auth: Auth, body: { application_id: string; note?: string }) {
  const { p, repo, app, actor } = platformApp(auth, body.application_id, REVIEWERS)
  const reqs = new Map(repo.list('onboarding_requirements').map((r) => [r.key, r]))
  const pending = repo.list('onboarding_items', (i) => i.application_id === app.id && Boolean(reqs.get(i.requirement_key)?.is_required) && i.status !== 'accepted' && i.status !== 'waived')
  if (pending.length) throw new ToolError('conflict', `${pending.length} required item(s) are not yet accepted or waived.`)
  return db.transaction(() => {
    for (const mod of repo.list('organisation_product_modules', (x) => x.status === 'declared')) {
      repo.update('organisation_product_modules', mod.id, { status: 'approved', decided_by: p.user!.id, decided_at: nowIso() })
    }
    if (body.note?.trim()) repo.insert('onboarding_internal_notes', { application_id: app.id, item_id: null, body: body.note.trim(), author_id: p.user!.id })
    return transition(repo, app, 'approved', actor, 'platform', 'Application approved. Platform approval is not regulatory authorisation.', { approved_at: nowIso(), approved_by: p.user!.id })
  })
}

export function declineApplication(auth: Auth, body: { application_id: string; reason: string }) {
  const { repo, app, actor } = platformApp(auth, body.application_id, REVIEWERS)
  if (!body.reason?.trim()) throw new ToolError('validation', 'Give the reason for declining.')
  return db.transaction(() => {
    const out = transition(repo, app, 'declined', actor, 'platform', body.reason.trim())
    repo.update('organisations', app.tenant_id, {
      lifecycle_status: 'closed',
      status_reason: 'Application declined',
      retention_until: new Date(Date.now() + RETENTION_YEARS * 365 * 86_400_000).toISOString().slice(0, 10),
    })
    return out
  })
}

/** The separate activation step: every check must pass. Insurer access still has to be enabled per insurer afterwards. */
export function activateBrokerage(auth: Auth, body: { application_id: string }) {
  const { p, repo, app, actor } = platformApp(auth, body.application_id, REVIEWERS)
  if (app.status !== 'approved') throw new ToolError('conflict', 'The application must be approved before activation.')
  const failed = activationChecklist(repo, app).filter((c) => !c.ok)
  if (failed.length) throw new ToolError('conflict', `Activation is blocked: ${failed.map((c) => c.label.toLowerCase()).join('; ')}.`)
  return db.transaction(() => {
    for (const mod of repo.list('organisation_product_modules', (x) => x.status === 'approved')) repo.update('organisation_product_modules', mod.id, { status: 'enabled' })
    repo.update('organisations', app.tenant_id, { lifecycle_status: 'active', activated_at: nowIso(), status_reason: null })
    const out = transition(repo, app, 'active', actor, 'platform', null, { activated_at: nowIso(), activated_by: p.user!.id })
    logEvent(repo, actor, 'brokerage.activated', { table: 'organisations', id: app.tenant_id }, {}, 'platform')
    return out
  })
}

export interface BrokerageRow {
  organisation: Organisation
  application_status: ApplicationStatus | null
  application_id: string | null
  members: number
  owner: string | null
  insurers_enabled: number
  modules_enabled: ProductModule[]
}

export function listBrokerages(auth: Auth): BrokerageRow[] {
  requirePlatform(principal(auth))
  return crossTenant
    .list('organisations', (o) => o.kind === 'brokerage')
    .map((org) => {
      const repo = platformRepo(org.id)
      const app = currentApplication(repo)
      const members = repo.list('organisation_memberships', (m) => m.status === 'active')
      const owner = members.find((m) => m.role === 'brokerage_owner')
      return {
        organisation: org,
        application_status: app?.status ?? null,
        application_id: app?.id ?? null,
        members: members.length,
        owner: userName(owner?.user_id),
        insurers_enabled: repo.list('insurer_access', (a) => a.status === 'enabled').length,
        modules_enabled: repo.list('organisation_product_modules', (x) => x.status === 'enabled').map((x) => x.module),
      }
    })
    .sort((a, b) => a.organisation.name.localeCompare(b.organisation.name))
}

export interface BrokerageAdminView {
  organisation: Organisation
  application: BrokerageApplication | null
  team: TeamView
  insurers: InsurerAccessView[]
  modules: OrganisationProductModule[]
  terms: OrganisationCommercialTerms | null
  audit: Array<AuditEvent & { actor_name: string }>
  platform_role: PlatformRole
}

export function getBrokerageAdmin(auth: Auth, body: { organisation_id: string }): BrokerageAdminView {
  const staff = requirePlatform(principal(auth))
  const repo = platformRepo(body.organisation_id)
  const org = repo.require('organisations', body.organisation_id)
  if (org.kind !== 'brokerage') throw new ToolError('not_found', 'That is not a brokerage.')
  return {
    organisation: org,
    application: currentApplication(repo) ?? null,
    team: teamView(repo, null),
    insurers: insurerViews(repo),
    modules: repo.list('organisation_product_modules'),
    terms: repo.list('organisation_commercial_terms', (t) => t.status === 'agreed')[0] ?? null,
    audit: platformAudit(org.id),
    platform_role: staff.role,
  }
}

/** Suspension blocks operational access for every member while keeping all records for the retention period. */
export function suspendBrokerage(auth: Auth, body: { organisation_id: string; reason: string }) {
  const p = principal(auth)
  requirePlatform(p, ['platform_admin'])
  const repo = platformRepo(body.organisation_id)
  const org = repo.require('organisations', body.organisation_id)
  if (org.lifecycle_status !== 'active') throw new ToolError('conflict', 'Only an active brokerage can be suspended.')
  if (!body.reason?.trim()) throw new ToolError('validation', 'Give the reason for suspending.')
  return db.transaction(() => {
    const app = currentApplication(repo)
    if (app?.status === 'active') transition(repo, app, 'suspended', p.actor, 'platform', body.reason.trim())
    const out = repo.update('organisations', org.id, {
      lifecycle_status: 'suspended',
      status_reason: body.reason.trim(),
      suspended_at: nowIso(),
      retention_until: new Date(Date.now() + RETENTION_YEARS * 365 * 86_400_000).toISOString().slice(0, 10),
    })
    logEvent(repo, p.actor, 'brokerage.suspended', { table: 'organisations', id: org.id }, { after: { reason: body.reason.trim() } }, 'platform')
    return out
  })
}

export function reinstateBrokerage(auth: Auth, body: { organisation_id: string; reason: string }) {
  const p = principal(auth)
  requirePlatform(p, ['platform_admin'])
  const repo = platformRepo(body.organisation_id)
  const org = repo.require('organisations', body.organisation_id)
  if (org.lifecycle_status !== 'suspended') throw new ToolError('conflict', 'Only a suspended brokerage can be reinstated.')
  if (!body.reason?.trim()) throw new ToolError('validation', 'Give the reason for reinstating.')
  return db.transaction(() => {
    const app = currentApplication(repo)
    if (app?.status === 'suspended') transition(repo, app, 'active', p.actor, 'platform', body.reason.trim())
    const out = repo.update('organisations', org.id, { lifecycle_status: 'active', status_reason: null, suspended_at: null, retention_until: null })
    logEvent(repo, p.actor, 'brokerage.reinstated', { table: 'organisations', id: org.id }, { after: { reason: body.reason.trim() } }, 'platform')
    return out
  })
}

// ---------------------------------------------------------------- first-use brokerage home

export interface HomeTask {
  key: string
  label: string
  detail: string
  to: string
  tone: 'info' | 'warning'
}

export interface BrokerageHome {
  organisation: Organisation
  application_status: ApplicationStatus | null
  setup: { done: number; total: number }
  team: { active: number; by_role: Array<{ role: MemberRole; label: string; count: number }>; pending_invitations: number }
  clients: { demo: number; imported: number; live: number }
  policies: { demo: number; imported: number; live: number }
  quotation: Array<{ insurer: string; module: ProductModule; status: InsurerAccess['status'] }>
  tasks: HomeTask[]
  capabilities: Capability[]
  member_role: MemberRole
}

const originOf = (row: { data_origin?: 'demo' | 'imported' | 'live'; is_synthetic?: boolean }) => row.data_origin ?? (row.is_synthetic ? 'demo' : 'live')

function count<T>(rows: T[], f: (r: T) => 'demo' | 'imported' | 'live') {
  const out = { demo: 0, imported: 0, live: 0 }
  rows.forEach((r) => out[f(r)]++)
  return out
}

export function homeTasks(repo: Repo, role: MemberRole): HomeTask[] {
  const tasks: HomeTask[] = []
  const team = teamView(repo, null)
  const reps = team.members.filter((x) => x.status === 'active' && x.role === 'representative').length
  if (can(role, 'manage_team') && reps === 0) tasks.push({ key: 'invite', label: 'Invite my team', detail: 'No representatives yet', to: '/broker/settings/team', tone: 'warning' })
  const insurers = insurerViews(repo)
  const waiting = insurers.filter((a) => a.status === 'awaiting_credentials' || (a.status === 'testing' && a.supported))
  if (can(role, 'manage_insurers') && waiting.length) tasks.push({ key: 'insurers', label: 'Finish insurer access', detail: `${waiting.length} insurer connection(s) not yet enabled`, to: '/broker/settings/insurers', tone: 'warning' })
  if (!insurers.some((a) => a.status === 'enabled')) tasks.push({ key: 'no_quotes', label: 'No quotation products enabled', detail: 'Quoting is blocked until an insurer is enabled', to: '/broker/settings/insurers', tone: 'warning' })
  const failed = repo.list('import_rows', (r) => r.commit_status === 'failed' || (r.validation_errors.length > 0 && r.commit_status !== 'committed' && r.commit_status !== 'skipped'))
  const batches = new Set(failed.map((r) => r.batch_id))
  const clientBatches = repo.list('import_batches').filter((b) => batches.has(b.id) && repo.get('data_sources', b.data_source_id)?.dataset.startsWith('client_book'))
  if (can(role, 'import_clients') && clientBatches.length) tasks.push({ key: 'import_errors', label: 'Correct failed import rows', detail: `${clientBatches.length} client-book import(s) have rows to fix`, to: `/broker/imports/client-book/${clientBatches[0].id}`, tone: 'warning' })
  const app = currentApplication(repo)
  const pending = app ? repo.list('onboarding_items', (i) => i.application_id === app.id && i.status === 'outstanding').length : 0
  if (pending) tasks.push({ key: 'onboarding', label: 'Outstanding onboarding items', detail: `${pending} item(s) still outstanding`, to: '/onboarding/readiness', tone: 'info' })
  return tasks
}

export function getBrokerageHome(auth: Auth): BrokerageHome {
  const m = member(auth)
  const app = currentApplication(m.repo)
  const items = app ? m.repo.list('onboarding_items', (i) => i.application_id === app.id) : []
  const team = teamView(m.repo, null)
  const active = team.members.filter((x) => x.status === 'active')
  const operational = m.org.lifecycle_status === 'active'
  return {
    organisation: m.org,
    application_status: app?.status ?? null,
    setup: { done: items.filter((i) => i.status === 'accepted' || i.status === 'waived').length, total: items.length },
    team: {
      active: active.length,
      by_role: MEMBER_ROLES.map((role) => ({ role, label: ROLE_LABEL[role], count: active.filter((x) => x.role === role).length })).filter((r) => r.count),
      pending_invitations: team.invitations.filter((i) => i.state === 'valid').length,
    },
    clients: operational ? count(m.repo.list('customers'), originOf) : { demo: 0, imported: 0, live: 0 },
    policies: operational ? count(m.repo.list('policies'), (r) => r.data_origin ?? 'live') : { demo: 0, imported: 0, live: 0 },
    quotation: insurerViews(m.repo).map((a) => ({ insurer: a.insurer_name, module: a.product_module, status: a.status })),
    tasks: homeTasks(m.repo, m.role),
    capabilities: capabilitiesOf(m.role),
    member_role: m.role,
  }
}

export const DOCUMENT_REQUIREMENTS = REQUIREMENTS.filter((r) => r.kind === 'document').map((r) => r.key)
export const SAMPLE_AVAILABLE = (key: string) => Boolean(documentFixture(key, SAMPLE_FACTS))
export type { Json }
