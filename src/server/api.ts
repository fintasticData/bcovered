// Request handlers shaped like the future FastAPI routes (/api/v1/...). The UI reaches them only via src/api/client.ts.
import './tools'
import { agentLabel } from './agents/catalog'
import { COMMERCIAL_COPILOT_SUGGESTIONS, COPILOT_SUGGESTIONS, handleCopilotCommand, type CopilotView } from './agents/copilotCommands'
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
} from './db/schema'
import { TENANT_ID } from './db/seed'
import { db, Repo } from './db/store'
import type { QuoteAnswer } from './domain/quotes'
import type { CommercialSubmission } from './db/commercialSchema'
import { hashPayload } from './lib/hash'
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
  role: Role
  actor: Actor
}

export const STAFF_ROLES: Role[] = ['broker', 'manager', 'admin']

export function principal(auth: Auth): Principal {
  const repo = new Repo(TENANT_ID)
  const user = auth.userId ? (repo.get('app_users', auth.userId) ?? null) : null
  if (auth.userId && !user) throw new ToolError('forbidden', 'Session is no longer valid. Choose a demo identity again.')
  const role: Role = user?.role ?? 'visitor'
  return { repo, user, role, actor: { type: user ? 'user' : 'system', id: user?.id ?? 'visitor', role } }
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
}

export function listIdentities(): DemoIdentity[] {
  const repo = new Repo(TENANT_ID)
  const order: Role[] = ['broker', 'manager', 'admin', 'customer']
  const people = repo
    .list('app_users')
    .sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role))
    .map((u) => ({
      user_id: u.id,
      customer_id: u.customer_id,
      full_name: u.full_name,
      role: u.role,
      description:
        u.role === 'customer'
          ? u.customer_id && repo.get('customers', u.customer_id)?.customer_type === 'commercial'
            ? `Business portal · ${repo.get('customers', u.customer_id)!.full_name}`
            : 'Customer portal'
          : u.role === 'manager'
            ? 'Brokerage manager'
            : 'Licensed broker',
    }))
  return [
    { user_id: null, customer_id: null, full_name: 'Public visitor', role: 'visitor' as Role, description: 'Public website' },
    ...people,
  ]
}

export function getSessionUser(auth: Auth) {
  return principal(auth).user
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
export type AssistantKind = 'ava' | 'business_discovery' | 'broker_copilot' | 'commercial_copilot'

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
  'I’m your Commercial Copilot. Ask me to review a business, show commercial clients or draft submissions. Results open on the right and every review runs as a job you can monitor.'

const GREETING: Record<Channel, string> = {
  public:
    'Hi, I’m Ava, BCovered’s AI assistant. Tell me what you’d like to insure and I’ll gather what our brokers need. I’m not a licensed adviser: a broker reviews every recommendation before you see it.',
  portal: 'Hi, I’m Ava. I can help with a new motor comparison from here.',
  broker:
    'I’m your Broker Copilot. Ask me to show work queues or start a comparison; I’ll show the results on the right and create jobs you can monitor.',
}

export function startConversation(
  auth: Auth,
  body: { channel: Channel; context?: Record<string, Json>; assistant?: AssistantKind },
): ConversationView {
  const p = principal(auth)
  if (body.channel === 'broker') requireRole(p, STAFF_ROLES)
  const assistant: AssistantKind =
    body.channel === 'broker'
      ? body.assistant === 'commercial_copilot'
        ? 'commercial_copilot'
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
    ava: { content: GREETING[body.channel], quick_replies: ['I’ve just bought a car', 'I want to compare my car insurance', 'Someone hit my parked car'] },
    broker_copilot: { content: GREETING.broker, quick_replies: COPILOT_SUGGESTIONS },
    commercial_copilot: { content: COMMERCIAL_COPILOT_GREETING, quick_replies: COMMERCIAL_COPILOT_SUGGESTIONS },
    business_discovery: { content: COMMERCIAL_GREETING, quick_replies: ['We operate three restaurants around Johannesburg and want better insurance.'] },
  }
  return db.transaction(() => {
    const c = p.repo.insert('conversations', {
      customer_id: p.user?.customer_id ?? null,
      channel: body.channel,
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
  const p = principal(auth)
  const c = p.repo.require('conversations', body.conversation_id)
  if (!canSeeConversation(p, c)) throw new ToolError('forbidden', 'This conversation belongs to someone else.')
  return conversationView(p.repo, c)
}

export async function sendMessage(auth: Auth, body: { conversation_id: string; text: string }): Promise<ConversationView> {
  const p = principal(auth)
  const text = body.text.trim()
  if (!text) throw new ToolError('validation', 'Message is empty')
  if (text.length > 2000) throw new ToolError('validation', 'Message is too long')
  const c = p.repo.require('conversations', body.conversation_id)
  if (!canSeeConversation(p, c)) throw new ToolError('forbidden', 'This conversation belongs to someone else.')

  p.repo.insert('conversation_messages', { conversation_id: c.id, role: 'user', content: text, structured: null })

  if (c.channel === 'broker') {
    requireRole(p, STAFF_ROLES)
    const out = handleCopilotCommand(p.repo, p.actor, text, c.assistant === 'commercial_copilot' ? 'commercial' : 'personal')
    p.repo.insert('conversation_messages', {
      conversation_id: c.id,
      role: 'assistant',
      content: out.reply,
      structured: { quick_replies: out.suggestions, view: out.view } as unknown as Json,
    })
    const jobId = out.view.kind === 'job' ? out.view.job_id : out.view.kind === 'business' ? out.view.job_id : null
    if (jobId) p.repo.update('conversations', c.id, { context: { ...c.context, job_id: jobId } })
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
  const p = principal(auth)
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

export interface ApprovalView {
  approval: ApprovalRequest
  customer: Customer | null
  quote: QuoteDetail | null
  submission: ApprovalSubmissionView | null
  job: JobSummary | null
  requested_by_label: string
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
      const job = a.job_id ? p.repo.get('jobs', a.job_id) : undefined
      return {
        approval: a,
        quote,
        submission,
        customer: quote?.customer ?? (submission ? (p.repo.get('customers', submission.submission.customer_id) ?? null) : null),
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
    quotes_awaiting_approval: number
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
      quotes_awaiting_approval: p.repo.list('quotes', (q) => q.status === 'awaiting_approval').length,
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
  if (typeof window !== 'undefined') recoverJobs(TENANT_ID)
}
