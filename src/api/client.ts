// The UI's only door into the backend. Today each method calls an in-browser handler in src/server/api.ts;
// when FastAPI is connected, each becomes a fetch to the matching /api/v1 route with the same request and response shapes.
import * as server from '@/server/api'
import * as commercial from '@/server/commercialApi'
import type { Channel, Json } from '@/server/db/schema'
import { db } from '@/server/db/store'
import { TENANT_ID } from '@/server/db/seed'
import { ToolError } from '@/server/lib/errors'
import { recoverJobs } from '@/server/jobs/runner'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// ---------------------------------------------------------------- session (stands in for a bearer token)

const SESSION_KEY = 'insureflow_session_v1'
const sessionListeners = new Set<() => void>()

export const session = {
  get: (): string | null => localStorage.getItem(SESSION_KEY),
  set(userId: string | null) {
    if (userId) localStorage.setItem(SESSION_KEY, userId)
    else localStorage.removeItem(SESSION_KEY)
    sessionListeners.forEach((l) => l())
  },
  subscribe(fn: () => void) {
    sessionListeners.add(fn)
    return () => {
      sessionListeners.delete(fn)
    }
  },
}

const auth = (): server.Auth => ({ userId: session.get() })

// ---------------------------------------------------------------- transport

const LATENCY_MS = 120

async function call<T>(fn: () => T | Promise<T>): Promise<T> {
  await new Promise((r) => setTimeout(r, LATENCY_MS))
  try {
    return structuredClone(await fn())
  } catch (e) {
    if (e instanceof ToolError) throw new ApiError(e.status, e.code, e.message)
    if (e instanceof Error && e.name === 'NotFoundError') throw new ApiError(404, 'not_found', 'That record no longer exists.')
    throw new ApiError(500, 'internal', e instanceof Error ? e.message : 'Unexpected error')
  }
}

export const api = {
  // GET /api/v1/demo/identities, GET /api/v1/me, GET /api/v1/platform, POST /api/v1/demo/reset
  identities: () => call(() => server.listIdentities()),
  me: () => call(() => server.getSessionUser(auth())),
  platform: () => call(() => server.getPlatformInfo()),
  resetDemo: () =>
    call(() => {
      const result = server.resetDemo()
      const id = session.get()
      if (id && !server.listIdentities().some((i) => i.user_id === id)) session.set(null)
      return result
    }),

  // /api/v1/conversations
  startConversation: (channel: Channel, context?: Record<string, Json>, assistant?: server.AssistantKind) =>
    call(() => server.startConversation(auth(), { channel, context, assistant })),
  conversation: (id: string) => call(() => server.getConversation(auth(), { conversation_id: id })),
  sendMessage: (id: string, text: string) => call(() => server.sendMessage(auth(), { conversation_id: id, text })),
  conversationProgress: (id: string) => call(() => server.getConversationJobProgress(auth(), { conversation_id: id })),

  // /api/v1/jobs
  jobs: (includeArchived = false) => call(() => server.listJobs(auth(), { include_archived: includeArchived })),
  job: (id: string) => call(() => server.getJob(auth(), { job_id: id })),
  controlJob: (id: string, action: server.JobAction) => call(() => server.controlJob(auth(), { job_id: id, action })),

  // /api/v1/leads, /api/v1/quotes
  leads: () => call(() => server.listLeads(auth())),
  lead: (id: string) => call(() => server.getLead(auth(), { lead_id: id })),
  quote: (id: string) => call(() => server.getQuote(auth(), { quote_id: id })),
  askQuote: (id: string, question: string) => call(() => server.askQuote(auth(), { quote_id: id, question })),

  // /api/v1/approvals
  approvals: (status?: server.ApprovalView['approval']['status'][]) => call(() => server.listApprovals(auth(), { status })),
  decideApproval: (body: Parameters<typeof server.decideApproval>[1]) => call(() => server.decideApproval(auth(), body)),

  // /api/v1/portal, /api/v1/overview
  portal: () => call(() => server.getPortal(auth())),
  portalProposal: (quoteId: string) => call(() => server.getPortalProposal(auth(), { quote_id: quoteId })),
  overview: () => call(() => server.getOverview(auth())),

  // /api/v1/commercial
  commercial: {
    industries: () => call(() => commercial.listIndustries()),
    clients: () => call(() => commercial.listBusinessProfiles(auth())),
    client: (id: string) => call(() => commercial.getBusinessProfile(auth(), { profile_id: id })),
    updateClient: (body: Parameters<typeof commercial.updateBusinessProfile>[1]) => call(() => commercial.updateBusinessProfile(auth(), body)),
    riskTwins: () => call(() => commercial.listRiskTwins(auth())),
    submissions: () => call(() => commercial.listSubmissions(auth())),
    submission: (id: string) => call(() => commercial.getSubmission(auth(), { submission_id: id })),
    updateSection: (body: Parameters<typeof commercial.updateSubmissionSection>[1]) => call(() => commercial.updateSubmissionSection(auth(), body)),
    requestApproval: (id: string) => call(() => commercial.requestSubmissionApproval(auth(), { submission_id: id })),
    updateTask: (body: Parameters<typeof commercial.updateTask>[1]) => call(() => commercial.updateTask(auth(), body)),
    portal: () => call(() => commercial.getPortalBusiness(auth())),
  },
}

/** Fires whenever demo data changes (in this tab or another), standing in for a server push channel. */
export const subscribeToChanges = (fn: () => void) => db.subscribe(fn)

let booted = false

/** Starts the in-browser job worker: resumes interrupted jobs now, then checks for stale ones every few seconds. */
export function bootDemoBackend() {
  if (booted) return
  booted = true
  server.bootServer()
  window.setInterval(() => recoverJobs(TENANT_ID), 5000)
}

export type {
  ApprovalView,
  ConversationView,
  DemoIdentity,
  JobDetail,
  JobSummary,
  LeadDetail,
  LeadRow,
  MessageView,
  OptionView,
  OverviewData,
  PortalView,
  QuoteDetail,
  StepView,
  AssistantKind,
} from '@/server/api'
export type {
  BusinessDetail,
  BusinessRow,
  PortalBusinessView,
  RiskTwinRow,
  SectionView,
  SubmissionDetail,
  SubmissionRow,
} from '@/server/commercialApi'
