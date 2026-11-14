// Request handlers shaped like the future FastAPI routes (/api/v1/...). The UI reaches them only via src/api/client.ts.
import './tools'
import { agentLabel } from './agents/catalog'
import { COMMERCIAL_COPILOT_SUGGESTIONS, COPILOT_SUGGESTIONS, handleCopilotCommand, type CopilotMode, type CopilotView } from './agents/copilotCommands'
import { CONTROLS_SUGGESTIONS, LIFE_SUGGESTIONS } from './agents/russ'
import { startMotorLeadWorkflow } from './agents/orchestrator'
import { startCommercialReview } from './agents/commercialOrchestrator'
import { commercialTurn, initialCommercialState, type CommercialIntakeState } from './llm/commercialIntake'
import type {
  AgentRun,
  AgentToolCall,
  AppUser,
  ApprovalRequest,
  AuditEvent,
  Channel,
  Communication,
  Conversation,
  ConversationMessage,
  Customer,
  CustomerConsent,
  Insurer,
  Job,
  JobStep,
  Json,
  Lead,
  Quote,
  QuoteOption,
  Role,
  TableName,
} from './db/schema'
import { approvalSubjectHandler, type ApprovalDetail } from './tools/approval'
import { TENANT_ID } from './db/seed'
import type { ApplicationStatus, MemberRole, OrganisationMembership, PlatformRole, PlatformStaff } from './db/onboardingSchema'
import type { Organisation } from './db/schema'
import { db, identity, Repo, ScopedRepo, type Grants } from './db/store'
import { capabilitiesOf, LEGACY_ROLE, READ_ONLY_ROLES, ROLE_LABEL, type Capability } from './onboarding/config'
import type { QuoteAnswer } from './domain/quotes'
import type { CommercialSubmission } from './db/commercialSchema'
import { hashPayload } from './lib/hash'
import { assessmentReviewPayload } from './tools/assessmentPayload'
import { ToolError } from './lib/errors'
import { ADAPTERS, getAssistantAdapter, initialIntakeState, PRIVACY_NOTICE_VERSION, type IntakeState } from './llm'
import { getWorkflow, onApprovalResolved, recoverJobs } from './jobs/runner'
import { invokeTool, listTools, type Actor } from './tools/registry'

export interface Auth {
  userId: string | null
}

export interface Principal {
  repo: Repo
  user: AppUser | null
  /** Role the broker modules check: the legacy demo role, or the one mapped from the active membership. */
  role: Role
  actor: Actor
  /** The active brokerage, or null for platform staff outside any brokerage and for people with no valid membership. */
  organisation: Organisation | null
  membership: OrganisationMembership | null
  platform: PlatformStaff | null
}

export const STAFF_ROLES: Role[] = ['broker', 'manager', 'admin']

/** A tenant id that owns nothing: people without a valid membership get a repository that sees no rows. */
export const NO_TENANT = '00000000-0000-4000-8000-000000000000'

/** Active access grants for a portal user, by scope type. */
export function grantsFor(repo: Repo, userId: string): Grants {
  const grants: Grants = new Map()
  repo
    .list('access_grants', (g) => g.user_id === userId && !g.revoked_at)
    .forEach((g) => grants.set(g.scope_type, (grants.get(g.scope_type) ?? new Set()).add(g.scope_id)))
  return grants
}

const isOperational = (org: Organisation | null | undefined) => org?.lifecycle_status === 'active'

/**
 * Resolves who is calling and which brokerage they act in. Staff act in the brokerage they explicitly switched to
 * (app_users.active_organisation_id, the tenant claim in the target login token) and only while their membership
 * there is active. Read-only roles get a repository that refuses writes; brokerages that are onboarding, suspended
 * or closed get one that refuses operational tables.
 */
export function principal(auth: Auth): Principal {
  const user = auth.userId ? (identity.user(auth.userId) ?? null) : null
  if (auth.userId && !user) throw new ToolError('forbidden', 'Session is no longer valid. Sign in or choose a demo identity again.')
  const platform = user ? (identity.platformStaff(user.id) ?? null) : null
  const result = (repo: Repo, role: Role, organisation: Organisation | null, membership: OrganisationMembership | null): Principal => ({
    repo,
    user,
    role,
    organisation,
    membership,
    platform,
    actor: { type: user ? 'user' : 'system', id: user?.id ?? 'visitor', role },
  })

  if (!user) return result(new Repo(TENANT_ID), 'visitor', identity.organisation(TENANT_ID) ?? null, null)

  if (user.role === 'customer') {
    const org = identity.organisation(user.tenant_id) ?? null
    const base = new Repo(user.tenant_id, { operational: isOperational(org) })
    const grants = grantsFor(base, user.id)
    return result(grants.size ? new ScopedRepo(user.tenant_id, grants) : base, 'customer', org, null)
  }

  const memberships = identity.memberships(user.id)
  const activeId = user.active_organisation_id ?? user.tenant_id
  const membership = memberships.find((m) => m.tenant_id === activeId && m.status === 'active') ?? null
  if (membership) {
    const org = identity.organisation(membership.tenant_id) ?? null
    const repo = new Repo(membership.tenant_id, { readOnly: READ_ONLY_ROLES.includes(membership.role), operational: isOperational(org) })
    return result(repo, LEGACY_ROLE[membership.role], org, membership)
  }
  // Staff created before memberships existed keep their demo role in their home brokerage.
  if (!memberships.length && !platform && STAFF_ROLES.includes(user.role)) {
    const org = identity.organisation(user.tenant_id) ?? null
    return result(new Repo(user.tenant_id, { operational: isOperational(org) }), user.role, org, null)
  }
  return result(new Repo(NO_TENANT, { readOnly: true }), 'visitor', null, null)
}

/**
 * Ava and the Business Discovery Agent are always available. When the caller's own brokerage is onboarding, suspended
 * or closed, their public and portal conversations run in the public B-Covered workspace as a visitor, with no link to
 * the caller's records. Broker-channel copilots keep the caller's principal, so brokerage rules still apply there.
 */
function conversationPrincipal(auth: Auth, channel?: Channel): Principal {
  const p = principal(auth)
  if (channel === 'broker' || p.repo.options.operational !== false) return p
  return {
    repo: new Repo(TENANT_ID),
    user: null,
    role: 'visitor',
    organisation: identity.organisation(TENANT_ID) ?? null,
    membership: null,
    platform: p.platform,
    actor: { type: 'system', id: 'visitor', role: 'visitor' },
  }
}

export function requirePlatform(p: Principal, roles: PlatformRole[] = ['platform_admin', 'onboarding_reviewer', 'platform_read_only']): PlatformStaff {
  if (!p.platform || !roles.includes(p.platform.role)) throw new ToolError('forbidden', 'This needs a B-Covered platform role.')
  return p.platform
}

export function requireRole(p: Principal, roles: Role[]) {
  if (!roles.includes(p.role)) throw new ToolError('forbidden', 'Your current demo role cannot open this.')
}

const isStaff = (p: Principal) => STAFF_ROLES.includes(p.role)

// ---------------------------------------------------------------- demo

export interface DemoIdentity {
  user_id: string | null
  customer_id: string | null
  full_name: string
  role: Role
  description: string
  /** Organisation heading in the switcher. */
  group: string
  /** Where the role switcher lands this identity. */
  home: string
}

/** Where a staff member lands: the onboarding journey until their brokerage is active. */
function staffHome(p: Principal): string {
  if (!p.membership) return p.platform ? '/platform/onboarding' : '/'
  return p.organisation?.lifecycle_status === 'active' ? '/broker' : '/onboarding'
}

function bcoveredIdentities(): DemoIdentity[] {
  const repo = new Repo(TENANT_ID)
  const order: Role[] = ['broker', 'manager', 'admin', 'customer']
  return repo
    .list('app_users', (u) => u.tenant_id === TENANT_ID)
    .sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role))
    .map((u) => {
      const business = u.role === 'customer' && u.customer_id ? repo.find('business_profiles', (b) => b.customer_id === u.customer_id) : undefined
      const grants = u.role === 'customer' ? grantsFor(repo, u.id) : new Map()
      const org = u.customer_id ? repo.get('customers', u.customer_id)?.full_name : undefined
      const longTerm = repo.list('adviser_authorisations', (a) => a.user_id === u.id && a.status === 'active' && a.product_category.startsWith('lt_')).length > 0
      const description =
        u.role === 'customer'
          ? grants.has('employer')
            ? `Employer HR portal · ${org ?? 'employer'}`
            : grants.has('cell')
              ? `Cell owner portal · ${org ?? 'cell owner'}`
              : business
                ? `Business portal · ${business.trading_name ?? business.registered_name}`
                : 'Customer portal'
          : u.role === 'manager'
            ? 'Brokerage manager and key individual'
            : longTerm
              ? 'Licensed adviser · life, group risk and retirement'
              : 'Licensed broker · short-term'
      const home =
        u.role !== 'customer'
          ? '/broker'
          : grants.has('employer')
            ? '/portal/employer'
            : grants.has('cell')
              ? '/portal/cell'
              : business
                ? '/portal/business'
                : '/portal'
      return { user_id: u.id, customer_id: u.customer_id, full_name: u.full_name, role: u.role, description, group: 'BCovered (first brokerage)', home }
    })
}

export function listIdentities(): DemoIdentity[] {
  const others = identity
    .allUsers()
    .filter((u) => u.tenant_id !== TENANT_ID)
    .map((u): DemoIdentity => {
      const p = principal({ userId: u.id })
      const org = p.organisation ?? identity.organisation(u.tenant_id)
      const memberships = identity.memberships(u.id).filter((m) => m.status === 'active')
      const description = p.platform
        ? 'B-Covered platform staff'
        : p.membership
          ? `${ROLE_LABEL[p.membership.role]}${memberships.length > 1 ? ` · ${memberships.length} brokerages` : ''}${org && org.lifecycle_status !== 'active' ? ` · ${org.lifecycle_status}` : ''}`
          : 'No active membership'
      return {
        user_id: u.id,
        customer_id: u.customer_id,
        full_name: u.full_name,
        role: p.role,
        description,
        group: p.platform ? 'B-Covered platform' : (identity.organisation(u.tenant_id)?.name ?? 'Other'),
        home: staffHome(p),
      }
    })
  return [
    { user_id: null, customer_id: null, full_name: 'Public visitor', role: 'visitor' as Role, description: 'Public website', group: 'Public', home: '/' },
    ...bcoveredIdentities(),
    ...others,
  ]
}

/** True when the demo identity still exists, for example after a data reset removed it. */
export function sessionExists(userId: string) {
  return Boolean(identity.user(userId))
}

export interface WorkspaceOption {
  organisation_id: string
  name: string
  role: MemberRole
  role_label: string
  lifecycle_status: Organisation['lifecycle_status']
  active: boolean
}

export interface SessionView extends AppUser {
  member_role: MemberRole | null
  platform_role: PlatformRole | null
  organisation: Pick<Organisation, 'id' | 'name' | 'kind' | 'lifecycle_status' | 'is_demo' | 'status_reason'> | null
  workspaces: WorkspaceOption[]
  capabilities: Capability[]
  read_only: boolean
  application_status: ApplicationStatus | null
  home: string
}

export function getSessionUser(auth: Auth): SessionView | null {
  const p = principal(auth)
  if (!p.user) return null
  const activeId = p.organisation?.id ?? null
  const workspaces = identity
    .memberships(p.user.id)
    .filter((m) => m.status === 'active')
    .flatMap((m) => {
      const org = identity.organisation(m.tenant_id)
      return org ? [{ organisation_id: org.id, name: org.name, role: m.role, role_label: ROLE_LABEL[m.role], lifecycle_status: org.lifecycle_status, active: org.id === activeId && Boolean(p.membership) }] : []
    })
  const application = p.membership ? p.repo.list('brokerage_applications').sort((a, b) => b.created_at.localeCompare(a.created_at))[0] : undefined
  const org = p.organisation
  return {
    ...p.user,
    role: p.role,
    member_role: p.membership?.role ?? null,
    platform_role: p.platform?.role ?? null,
    organisation: org ? { id: org.id, name: org.name, kind: org.kind, lifecycle_status: org.lifecycle_status, is_demo: org.is_demo, status_reason: org.status_reason } : null,
    workspaces,
    capabilities: p.user.role === 'customer' ? [] : capabilitiesOf(p.membership?.role ?? null),
    read_only: Boolean(p.repo.options.readOnly),
    application_status: application?.status ?? null,
    home: p.user.role === 'customer' ? '/portal' : staffHome(p),
  }
}

export function resetDemo() {
  db.reset()
  return { ok: true }
}

export function getPlatformInfo() {
  const repo = new Repo(TENANT_ID)
  const org = repo.require('organisations', TENANT_ID)
  const adapter = getAssistantAdapter()
  return {
    organisation: org,
    licence_configured: Boolean(org.fsp_number && org.fsp_verified),
    adapter: { id: adapter.id, label: adapter.label },
    adapters: ADAPTERS.map((a) => ({ id: a.id, label: a.label, available: a.available, reason: a.unavailableReason ?? null })),
    tools: listTools(),
    privacy_notice_version: PRIVACY_NOTICE_VERSION,
  }
}

// ---------------------------------------------------------------- conversations

export interface MessageView extends ConversationMessage {
  quick_replies: string[]
  links: Array<{ label: string; to: string }>
  view: CopilotView | null
}

export interface ConversationView {
  conversation: Conversation
  messages: MessageView[]
  intake: IntakeState | null
  commercial_intake: CommercialIntakeState | null
  job_id: string | null
}

/** Assistants a conversation can be started with, per channel. */
export type AssistantKind = 'ava' | 'business_discovery' | 'broker_copilot' | 'commercial_copilot' | 'russ_life' | 'russ_controls'

const BROKER_ASSISTANTS: AssistantKind[] = ['commercial_copilot', 'russ_life', 'russ_controls']

const COPILOT_MODE: Record<string, CopilotMode> = { commercial_copilot: 'commercial', russ_life: 'life', russ_controls: 'controls' }

function toMessageView(m: ConversationMessage): MessageView {
  const s = (m.structured ?? {}) as { quick_replies?: string[]; links?: MessageView['links']; view?: CopilotView }
  return { ...m, quick_replies: s.quick_replies ?? [], links: s.links ?? [], view: s.view ?? null }
}

function canSeeConversation(p: Principal, c: Conversation) {
  if (isStaff(p)) return true
  if (c.channel === 'broker') return false
  if (p.role === 'customer') return !c.customer_id || c.customer_id === p.user?.customer_id
  return c.channel === 'public'
}

function conversationView(repo: Repo, c: Conversation): ConversationView {
  const messages = repo
    .list('conversation_messages', (m) => m.conversation_id === c.id)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map(toMessageView)
  return {
    conversation: c,
    messages,
    intake: (c.context.intake as unknown as IntakeState) ?? null,
    commercial_intake: (c.context.commercial_intake as unknown as CommercialIntakeState) ?? null,
    job_id: (c.context.job_id as string) ?? null,
  }
}

const COMMERCIAL_GREETING =
  'Hi, I’m BCovered’s Business Discovery Agent. Tell me how your business operates, in your own words, and I’ll only ask for what’s missing. Our agents then map potential risks and a licensed broker reviews everything. I don’t give financial advice.'

const COMMERCIAL_COPILOT_GREETING =
  'I’m Russ, working with the commercial agents. Ask me to review a business, show commercial clients or draft submissions. Results open on the right and every review runs as a job you can monitor.'

const GREETING: Record<Channel, string> = {
  public:
    'Hi, I’m Ava, BCovered’s AI assistant. Tell me what you’d like to insure and I’ll gather what our brokers need. I’m not a licensed adviser: a broker reviews every recommendation before you see it.',
  portal: 'Hi, I’m Ava. I can help with a new motor comparison from here.',
  broker:
    'I’m Russ, B-Covered’s assistant. Ask me about work queues, comparisons, life advice, employee movements, contribution reconciliations, transfers, investments or cell captives. Results open on the right and every piece of work runs as a job you can monitor. I prepare; a licensed person approves.',
}

export function startConversation(
  auth: Auth,
  body: { channel: Channel; context?: Record<string, Json>; assistant?: AssistantKind },
): ConversationView {
  const p = conversationPrincipal(auth, body.channel)
  // A visitor only sees public conversations, so a portal chat that fell back to the public workspace becomes public.
  const channel: Channel = body.channel === 'portal' && !p.user ? 'public' : body.channel
  if (channel === 'broker') requireRole(p, STAFF_ROLES)
  const assistant: AssistantKind =
    channel === 'broker'
      ? body.assistant && BROKER_ASSISTANTS.includes(body.assistant)
        ? body.assistant
        : 'broker_copilot'
      : body.assistant === 'business_discovery'
        ? 'business_discovery'
        : 'ava'
  const intake: Record<string, Json> =
    assistant === 'business_discovery'
      ? { commercial_intake: initialCommercialState() as unknown as Json }
      : assistant === 'ava'
        ? { intake: initialIntakeState() as unknown as Json }
        : {}
  const opening: Record<AssistantKind, { content: string; quick_replies: string[] }> = {
    ava: { content: GREETING[channel], quick_replies: ['I’ve just bought a car', 'I want to compare my car insurance', 'Someone hit my parked car'] },
    broker_copilot: { content: GREETING.broker, quick_replies: COPILOT_SUGGESTIONS },
    commercial_copilot: { content: COMMERCIAL_COPILOT_GREETING, quick_replies: COMMERCIAL_COPILOT_SUGGESTIONS },
    russ_life: {
      content:
        'I’m Russ, working with the Life Sales, Underwriting and Servicing agents. I prepare needs analyses, simulated quotes and draft Records of Advice for an authorised adviser to review and sign off. I never give advice myself.',
      quick_replies: LIFE_SUGGESTIONS,
    },
    russ_controls: {
      content:
        'I’m Russ, working with the Group Membership, Contribution and Investment agents. I validate and match source files, reconcile them, quantify the differences and prepare corrections for your approval. I never authorise a payment or a correction.',
      quick_replies: CONTROLS_SUGGESTIONS,
    },
    business_discovery: { content: COMMERCIAL_GREETING, quick_replies: ['We operate three restaurants around Johannesburg and want better insurance.'] },
  }
  return db.transaction(() => {
    const c = p.repo.insert('conversations', {
      customer_id: p.user?.customer_id ?? null,
      channel,
      assistant,
      context: { ...(body.context ?? {}), ...intake },
    })
    p.repo.insert('conversation_messages', {
      conversation_id: c.id,
      role: 'assistant',
      content: opening[assistant].content,
      structured: { quick_replies: opening[assistant].quick_replies },
    })
    return conversationView(p.repo, c)
  })
}

export function getConversation(auth: Auth, body: { conversation_id: string }): ConversationView {
  const p = conversationPrincipal(auth)
  const c = p.repo.require('conversations', body.conversation_id)
  if (!canSeeConversation(p, c)) throw new ToolError('forbidden', 'This conversation belongs to someone else.')
  return conversationView(p.repo, c)
}

export async function sendMessage(auth: Auth, body: { conversation_id: string; text: string }): Promise<ConversationView> {
  const p = conversationPrincipal(auth)
  const text = body.text.trim()
  if (!text) throw new ToolError('validation', 'Message is empty')
  if (text.length > 2000) throw new ToolError('validation', 'Message is too long')
  const c = p.repo.require('conversations', body.conversation_id)
  if (!canSeeConversation(p, c)) throw new ToolError('forbidden', 'This conversation belongs to someone else.')

  p.repo.insert('conversation_messages', { conversation_id: c.id, role: 'user', content: text, structured: null })

  if (c.channel === 'broker') {
    requireRole(p, STAFF_ROLES)
    if (c.assistant === 'commercial_copilot' && c.context.broker_discovery) return brokerDiscoveryTurn(p, c, text)
    const out = handleCopilotCommand(p.repo, p.actor, text, COPILOT_MODE[c.assistant] ?? 'personal')
    p.repo.insert('conversation_messages', {
      conversation_id: c.id,
      role: 'assistant',
      content: out.reply,
      structured: { quick_replies: out.suggestions, view: out.view } as unknown as Json,
    })
    const v = out.view
    const jobId = v.kind === 'job' || v.kind === 'business' || v.kind === 'twin' || v.kind === 'life_case' || v.kind === 'reconciliation' || v.kind === 'movements' ? v.job_id : null
    const context: Record<string, Json> = { ...c.context }
    if (jobId) context.job_id = jobId
    if (out.discovery) {
      const intake = initialCommercialState()
      intake.facts.registered_name = out.discovery.business_name
      context.broker_discovery = { business_name: out.discovery.business_name, intake: intake as unknown as Json }
    }
    if (jobId || out.discovery) p.repo.update('conversations', c.id, { context })
    return conversationView(p.repo, p.repo.require('conversations', c.id))
  }

  if (c.assistant === 'business_discovery') {
    const state = (c.context.commercial_intake as unknown as CommercialIntakeState) ?? initialCommercialState()
    const out = commercialTurn(state, text, p.repo.list('industry_risk_templates', (t) => t.is_active))
    return db.transaction(() => {
      p.repo.insert('conversation_messages', {
        conversation_id: c.id,
        role: 'assistant',
        content: out.reply,
        structured: { quick_replies: out.quick_replies, links: out.links ?? [] } as unknown as Json,
      })
      const context: Record<string, Json> = { ...c.context, commercial_intake: out.state as unknown as Json }
      if (out.submit && !c.context.job_id) {
        const job = startCommercialReview(
          p.repo,
          { type: 'agent', id: 'orchestrator', role: 'agent' },
          {
            source: 'business_discovery',
            facts: out.state.facts,
            contact: out.state.contact,
            consent: {
              processing: Boolean(out.state.consent.processing),
              marketing: Boolean(out.state.consent.marketing),
              notice_version: PRIVACY_NOTICE_VERSION,
            },
            conversation_id: c.id,
          },
          `conversation:${c.id}:commercial_review`,
        )
        context.job_id = job.id
      }
      p.repo.update('conversations', c.id, { context })
      return conversationView(p.repo, p.repo.require('conversations', c.id))
    })
  }

  const state = (c.context.intake as unknown as IntakeState) ?? initialIntakeState()
  const turn = await getAssistantAdapter().intakeTurn(state, text)
  return db.transaction(() => {
    p.repo.insert('conversation_messages', {
      conversation_id: c.id,
      role: 'assistant',
      content: turn.reply,
      structured: { quick_replies: turn.quick_replies, links: turn.links ?? [] } as unknown as Json,
    })
    const context: Record<string, Json> = { ...c.context, intake: turn.state as unknown as Json }
    if (turn.submit && !c.context.job_id) {
      const job = startMotorLeadWorkflow(
        p.repo,
        { type: 'agent', id: 'orchestrator', role: 'agent' },
        {
          source: 'ava',
          details: turn.state.details,
          contact: turn.state.contact,
          consent: {
            processing: Boolean(turn.state.consent.processing),
            marketing: Boolean(turn.state.consent.marketing),
            notice_version: PRIVACY_NOTICE_VERSION,
          },
          conversation_id: c.id,
        },
        `conversation:${c.id}:motor_new_lead`,
      )
      context.job_id = job.id
    }
    p.repo.update('conversations', c.id, { context })
    return conversationView(p.repo, p.repo.require('conversations', c.id))
  })
}

interface BrokerDiscovery {
  business_name: string
  intake: CommercialIntakeState
}

/** A broker interviewed by the Business Discovery Agent about a business with no profile yet, inside the Commercial Copilot chat. */
function brokerDiscoveryTurn(p: Principal, c: Conversation, text: string): ConversationView {
  const discovery = c.context.broker_discovery as unknown as BrokerDiscovery
  const { broker_discovery: _ended, ...rest } = c.context
  const reply = (content: string, quick_replies: string[], view: CopilotView, context: Record<string, Json>) =>
    db.transaction(() => {
      p.repo.insert('conversation_messages', { conversation_id: c.id, role: 'assistant', content, structured: { quick_replies, view } as unknown as Json })
      p.repo.update('conversations', c.id, { context })
      return conversationView(p.repo, p.repo.require('conversations', c.id))
    })

  if (/^\s*(cancel|stop|exit|quit)\b/i.test(text)) {
    return reply(`Discovery for ${discovery.business_name} cancelled. Nothing was saved.`, COMMERCIAL_COPILOT_SUGGESTIONS, { kind: 'none' }, rest)
  }
  const out = commercialTurn(discovery.intake, text, p.repo.list('industry_risk_templates', (t) => t.is_active))
  if (!out.submit) {
    return reply(out.reply, out.quick_replies, { kind: 'none' }, { ...c.context, broker_discovery: { ...discovery, intake: out.state } as unknown as Json })
  }
  const job = startCommercialReview(
    p.repo,
    p.actor,
    {
      source: 'broker_copilot',
      facts: out.state.facts,
      contact: out.state.contact,
      consent: {
        processing: Boolean(out.state.consent.processing),
        marketing: Boolean(out.state.consent.marketing),
        notice_version: PRIVACY_NOTICE_VERSION,
      },
    },
    `conversation:${c.id}:broker_discovery:${discovery.business_name.toLowerCase()}`,
  )
  return reply(
    `Discovery for ${discovery.business_name} is complete. The agents are now creating the business profile, building its Risk Twin, identifying ` +
      'potential exposures, requesting missing documents and drafting a submission pack for your approval. Nothing is sent to an insurer.',
    ['Show running jobs', 'Which Risk Twins need attention?'],
    { kind: 'job', title: `Risk Twin: ${discovery.business_name}`, job_id: job.id },
    { ...rest, job_id: job.id },
  )
}

// ---------------------------------------------------------------- jobs

export interface JobSummary extends Job {
  title: string
  customer_name: string | null
  steps_total: number
  steps_done: number
  current_step: string | null
}

export function summariseJob(repo: Repo, job: Job): JobSummary {
  const steps = repo.list('job_steps', (s) => s.job_id === job.id).sort((a, b) => a.seq - b.seq)
  const current = steps.find((s) => s.status === 'running' || s.status === 'pending' || s.status === 'failed')
  let title = job.workflow_type
  try {
    title = getWorkflow(job.workflow_type).title
  } catch {
    /* unknown workflow keeps its type as title */
  }
  return {
    ...job,
    title,
    customer_name: job.customer_id ? (repo.get('customers', job.customer_id)?.full_name ?? null) : null,
    steps_total: steps.length,
    steps_done: steps.filter((s) => s.status === 'completed' || s.status === 'skipped').length,
    current_step: current?.name ?? null,
  }
}

export function listJobs(auth: Auth, body: { include_archived?: boolean } = {}): JobSummary[] {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  return p.repo
    .list('jobs', (j) => body.include_archived || !j.archived_at)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((j) => summariseJob(p.repo, j))
}

export interface StepView extends JobStep {
  agent_label: string
  runs: Array<AgentRun & { tool_calls: AgentToolCall[] }>
}

export interface JobDetail {
  job: JobSummary
  steps: StepView[]
  approvals: ApprovalRequest[]
  audit: AuditEvent[]
  customer: Customer | null
  lead: Lead | null
}

function jobDetail(repo: Repo, jobId: string): JobDetail {
  const job = repo.require('jobs', jobId)
  const runs = repo.list('agent_runs', (r) => r.job_id === jobId)
  const calls = repo.list('agent_tool_calls', (c) => runs.some((r) => r.id === c.agent_run_id))
  return {
    job: summariseJob(repo, job),
    steps: repo
      .list('job_steps', (s) => s.job_id === jobId)
      .sort((a, b) => a.seq - b.seq)
      .map((s) => ({
        ...s,
        agent_label: agentLabel(s.agent),
        runs: runs
          .filter((r) => r.job_step_id === s.id)
          .sort((a, b) => a.started_at.localeCompare(b.started_at))
          .map((r) => ({ ...r, tool_calls: calls.filter((c) => c.agent_run_id === r.id).sort((a, b) => a.created_at.localeCompare(b.created_at)) })),
      })),
    approvals: repo.list('approval_requests', (a) => a.job_id === jobId),
    audit: repo.list('audit_events', (e) => e.job_id === jobId).sort((a, b) => a.created_at.localeCompare(b.created_at)),
    customer: job.customer_id ? (repo.get('customers', job.customer_id) ?? null) : null,
    lead: job.lead_id ? (repo.get('leads', job.lead_id) ?? null) : null,
  }
}

export function getJob(auth: Auth, body: { job_id: string }): JobDetail {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  return jobDetail(p.repo, body.job_id)
}

/** Public progress for the Ava panel: step names and statuses only, scoped to the caller's own conversation. */
export function getConversationJobProgress(auth: Auth, body: { conversation_id: string }) {
  const p = conversationPrincipal(auth)
  const c = p.repo.require('conversations', body.conversation_id)
  if (!canSeeConversation(p, c)) throw new ToolError('forbidden', 'This conversation belongs to someone else.')
  const jobId = c.context.job_id as string | undefined
  if (!jobId) return null
  const job = p.repo.require('jobs', jobId)
  const steps = p.repo.list('job_steps', (s) => s.job_id === jobId).sort((a, b) => a.seq - b.seq)
  return {
    job_id: job.id,
    status: job.status,
    customer_id: job.customer_id,
    steps: steps.map((s) => ({
      key: s.key,
      name: s.name,
      agent_label: agentLabel(s.agent),
      status: s.status,
      summary: ((s.output as { summary?: string } | null)?.summary ?? null) as string | null,
    })),
  }
}

export type JobAction = 'pause' | 'resume' | 'cancel' | 'retry' | 'archive'

export function controlJob(auth: Auth, body: { job_id: string; action: JobAction }): JobDetail {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  invokeTool(`job.${body.action}`, { job_id: body.job_id }, { repo: p.repo, actor: p.actor })
  return jobDetail(p.repo, body.job_id)
}

// ---------------------------------------------------------------- leads

export interface LeadRow extends Lead {
  customer_name: string
  latest_quote_id: string | null
}

export function listLeads(auth: Auth): LeadRow[] {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  return p.repo
    .list('leads')
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((l) => ({
      ...l,
      customer_name: p.repo.get('customers', l.customer_id)?.full_name ?? 'Unknown',
      latest_quote_id:
        p.repo.list('quotes', (q) => q.lead_id === l.id).sort((a, b) => b.created_at.localeCompare(a.created_at))[0]?.id ?? null,
    }))
}

export interface LeadDetail {
  lead: Lead
  customer: Customer
  consents: CustomerConsent[]
  quotes: Quote[]
  jobs: JobSummary[]
  messages: ConversationMessage[]
}

export function getLead(auth: Auth, body: { lead_id: string }): LeadDetail {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  const lead = p.repo.require('leads', body.lead_id)
  return {
    lead,
    customer: p.repo.require('customers', lead.customer_id),
    consents: p.repo.list('customer_consents', (c) => c.customer_id === lead.customer_id),
    quotes: p.repo.list('quotes', (q) => q.lead_id === lead.id),
    jobs: p.repo.list('jobs', (j) => j.lead_id === lead.id).map((j) => summariseJob(p.repo, j)),
    messages: lead.conversation_id
      ? p.repo
          .list('conversation_messages', (m) => m.conversation_id === lead.conversation_id)
          .sort((a, b) => a.created_at.localeCompare(b.created_at))
      : [],
  }
}

// ---------------------------------------------------------------- quotes

export interface OptionView extends QuoteOption {
  insurer: Insurer
}

export interface QuoteDetail {
  quote: Quote
  options: OptionView[]
  customer: Customer
  lead: Lead | null
  approvals: ApprovalRequest[]
  job_id: string | null
}

function quoteDetail(repo: Repo, quoteId: string): QuoteDetail {
  const quote = repo.require('quotes', quoteId)
  const insurers = repo.list('insurers')
  return {
    quote,
    options: repo
      .list('quote_options', (o) => o.quote_id === quoteId)
      .sort((a, b) => a.option_label.localeCompare(b.option_label))
      .map((o) => ({ ...o, insurer: insurers.find((i) => i.id === o.insurer_id)! })),
    customer: repo.require('customers', quote.customer_id),
    lead: quote.lead_id ? (repo.get('leads', quote.lead_id) ?? null) : null,
    approvals: repo
      .list('approval_requests', (a) => a.subject_id === quoteId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    job_id: repo.find('jobs', (j) => j.quote_id === quoteId)?.id ?? null,
  }
}

export function getQuote(auth: Auth, body: { quote_id: string }): QuoteDetail {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  return quoteDetail(p.repo, body.quote_id)
}

export function askQuote(auth: Auth, body: { quote_id: string; question: string }): QuoteAnswer {
  const p = principal(auth)
  const quote = p.repo.require('quotes', body.quote_id)
  if (!isStaff(p) && !(p.role === 'customer' && p.user?.customer_id === quote.customer_id && quote.status === 'released')) {
    throw new ToolError('forbidden', 'You cannot ask about this quote.')
  }
  return invokeTool<QuoteAnswer>('quote.answer_question', body, { repo: p.repo, actor: p.actor })
}

// ---------------------------------------------------------------- approvals

export interface ApprovalSubmissionView {
  submission: CommercialSubmission
  profile_id: string
  business_name: string
  current_pack_matches: boolean
}

export interface ApprovalRiskView {
  kind: 'assessment' | 'investigation'
  profile_id: string
  business_name: string
  /** For sign-offs: whether the findings on screen still match what the request was raised for. */
  current_matches: boolean
  assessment_id: string | null
}

export interface ApprovalView {
  approval: ApprovalRequest
  customer: Customer | null
  quote: QuoteDetail | null
  submission: ApprovalSubmissionView | null
  risk: ApprovalRiskView | null
  /** Life, controls and funds approvals describe themselves through their subject handler. */
  detail: (ApprovalDetail & { current_matches: boolean }) | null
  job: JobSummary | null
  requested_by_label: string
}

function approvalDetail(repo: Repo, a: ApprovalRequest): ApprovalView['detail'] {
  const handler = approvalSubjectHandler(a.subject_table)
  if (!handler?.describe) return null
  let current_matches = true
  try {
    const current = handler.currentPayload?.(repo, a.subject_id, a)
    current_matches = current === undefined || hashPayload(current) === a.payload_hash
  } catch {
    current_matches = false
  }
  return { ...handler.describe(repo, a), current_matches }
}

function subjectCustomer(repo: Repo, a: ApprovalRequest): Customer | null {
  try {
    const row = repo.get(a.subject_table as TableName, a.subject_id) as { customer_id?: string | null } | undefined
    return row?.customer_id ? (repo.get('customers', row.customer_id) ?? null) : null
  } catch {
    return null
  }
}

function approvalRisk(repo: Repo, a: ApprovalRequest): ApprovalRiskView | null {
  const profileOf = (id: string | undefined) => (id ? repo.get('business_profiles', id) : undefined)
  if (a.subject_table === 'risk_assessments') {
    const assessment = repo.get('risk_assessments', a.subject_id)
    const profile = profileOf(assessment?.business_profile_id)
    if (!assessment || !profile) return null
    return {
      kind: 'assessment',
      profile_id: profile.id,
      business_name: profile.trading_name ?? profile.registered_name,
      current_matches: hashPayload(assessmentReviewPayload(repo, assessment.id)) === a.payload_hash,
      assessment_id: assessment.id,
    }
  }
  if (a.subject_table === 'jobs' && a.approval_type === 'risk_investigation_review') {
    const job = repo.get('jobs', a.subject_id)
    const profile = profileOf((job?.inputs as { business_profile_id?: string } | undefined)?.business_profile_id)
    if (!profile) return null
    return { kind: 'investigation', profile_id: profile.id, business_name: profile.trading_name ?? profile.registered_name, current_matches: true, assessment_id: null }
  }
  return null
}

function approvalSubmission(repo: Repo, a: ApprovalRequest): ApprovalSubmissionView | null {
  if (a.subject_table !== 'commercial_submissions') return null
  const submission = repo.get('commercial_submissions', a.subject_id)
  if (!submission) return null
  const profile = repo.require('business_profiles', submission.business_profile_id)
  return {
    submission,
    profile_id: profile.id,
    business_name: profile.trading_name ?? profile.registered_name,
    current_pack_matches: hashPayload(submission.pack) === a.payload_hash,
  }
}

export function listApprovals(auth: Auth, body: { status?: ApprovalRequest['status'][] } = {}): ApprovalView[] {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  return p.repo
    .list('approval_requests', (a) => !body.status || body.status.includes(a.status))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((a) => {
      const quote = a.subject_table === 'quotes' ? quoteDetail(p.repo, a.subject_id) : null
      const submission = approvalSubmission(p.repo, a)
      const risk = approvalRisk(p.repo, a)
      const job = a.job_id ? p.repo.get('jobs', a.job_id) : undefined
      const riskCustomer = risk ? p.repo.get('business_profiles', risk.profile_id)?.customer_id : undefined
      return {
        approval: a,
        quote,
        submission,
        risk,
        detail: approvalDetail(p.repo, a),
        customer:
          quote?.customer ??
          (submission
            ? (p.repo.get('customers', submission.submission.customer_id) ?? null)
            : riskCustomer
              ? (p.repo.get('customers', riskCustomer) ?? null)
              : subjectCustomer(p.repo, a)),
        job: job ? summariseJob(p.repo, job) : null,
        requested_by_label: p.repo.get('app_users', a.requested_by_agent)?.full_name ?? agentLabel(a.requested_by_agent),
      }
    })
}

export function decideApproval(
  auth: Auth,
  body: { approval_id: string; decision: 'approved' | 'rejected' | 'changes_requested'; note?: string; payload_hash: string },
): ApprovalRequest {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  const approval = invokeTool<ApprovalRequest>('approval.resolve', body, { repo: p.repo, actor: p.actor })
  onApprovalResolved(p.repo, approval.id)
  return approval
}

// ---------------------------------------------------------------- customer portal

export interface PortalView {
  customer: Customer
  business_profile_id: string | null
  proposals: QuoteDetail[]
  in_review: Array<{ quote_id: string; status: Quote['status']; product_category: string; created_at: string }>
  notifications: Communication[]
}

export function requireCustomer(p: Principal) {
  requireRole(p, ['customer'])
  if (!p.user?.customer_id) throw new ToolError('forbidden', 'No customer record is linked to this identity.')
  return p.repo.require('customers', p.user.customer_id)
}

export function getPortal(auth: Auth): PortalView {
  const p = principal(auth)
  const customer = requireCustomer(p)
  const quotes = p.repo.list('quotes', (q) => q.customer_id === customer.id)
  return {
    customer,
    business_profile_id: p.repo.find('business_profiles', (b) => b.customer_id === customer.id)?.id ?? null,
    proposals: quotes.filter((q) => q.status === 'released').map((q) => quoteDetail(p.repo, q.id)),
    in_review: quotes
      .filter((q) => q.status !== 'released')
      .map((q) => ({ quote_id: q.id, status: q.status, product_category: q.product_category, created_at: q.created_at })),
    notifications: p.repo
      .list('communications', (c) => c.customer_id === customer.id && c.channel === 'in_app' && c.status === 'sent')
      .sort((a, b) => b.created_at.localeCompare(a.created_at)),
  }
}

export function getPortalProposal(auth: Auth, body: { quote_id: string }): QuoteDetail {
  const p = principal(auth)
  const customer = requireCustomer(p)
  const quote = p.repo.require('quotes', body.quote_id)
  if (quote.customer_id !== customer.id || quote.status !== 'released') {
    throw new ToolError('not_found', 'This proposal is not available.')
  }
  const detail = quoteDetail(p.repo, quote.id)
  return { ...detail, approvals: [], job_id: null }
}

// ---------------------------------------------------------------- overview

export interface OverviewData {
  kpis: {
    open_leads: number
    approvals_pending: number
    proposals_released: number
    active_jobs: number
    failed_jobs: number
    customers: number
  }
  leads_by_status: Array<{ status: string; count: number }>
  activity: Array<AuditEvent & { label: string }>
}

const ACTION_LABEL: Record<string, string> = {
  'customer.create': 'Customer profile created',
  'lead.create': 'Lead created',
  'lead.record_risk_assessment': 'Risk assessment recorded',
  'quote.create_request': 'Quote request opened',
  'quote.prepare_proposal': 'Comparison summary prepared',
  'approval.request': 'Approval requested',
  'approval.resolve': 'Approval decided',
  'quote.release_proposal': 'Proposal released to customer',
  'job.create': 'Job created',
  'job.completed': 'Job completed',
  'job.cancelled': 'Job cancelled',
  'job.failed': 'Job failed',
  'tool.blocked': 'Action blocked',
  'demo.seeded': 'Demo data loaded',
  'business.create_profile': 'Business profile created',
  'risk.assess_exposures': 'Potential exposures identified',
  'underwriting.prepare_submission': 'Draft submission pack prepared',
  'underwriting.update_section': 'Submission section edited',
  'underwriting.finalise_submission': 'Submission pack marked ready for market',
}

export function getOverview(auth: Auth): OverviewData {
  const p = principal(auth)
  requireRole(p, STAFF_ROLES)
  const leads = p.repo.list('leads')
  const jobs = p.repo.list('jobs')
  const statuses = ['new', 'qualifying', 'qualified', 'quoting', 'proposal_pending', 'proposal_released', 'won', 'lost']
  return {
    kpis: {
      open_leads: leads.filter((l) => !['won', 'lost'].includes(l.status)).length,
      approvals_pending: p.repo.list('approval_requests', (a) => a.status === 'pending').length,
      proposals_released: p.repo.list('quotes', (q) => q.status === 'released').length,
      active_jobs: jobs.filter((j) => ['queued', 'running', 'awaiting_approval', 'awaiting_information', 'paused'].includes(j.status)).length,
      failed_jobs: jobs.filter((j) => j.status === 'failed').length,
      customers: p.repo.list('customers').length,
    },
    leads_by_status: statuses.map((status) => ({ status, count: leads.filter((l) => l.status === status).length })),
    activity: p.repo
      .list('audit_events', (e) => e.action in ACTION_LABEL)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 14)
      .map((e) => ({
        ...e,
        label: ACTION_LABEL[e.action],
        actor_id: p.repo.get('app_users', e.actor_id)?.full_name ?? agentLabel(e.actor_id),
      })),
  }
}

export function bootServer() {
  if (typeof window !== 'undefined') recoverAllJobs()
}

/** Resumes interrupted jobs in every brokerage; each runs on its own tenant repository. */
export function recoverAllJobs() {
  identity.brokerageIds().forEach((id) => recoverJobs(id))
}
