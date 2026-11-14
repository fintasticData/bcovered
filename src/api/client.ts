// The UI's only door into the backend. Today each method calls an in-browser handler in src/server/api.ts;
// when FastAPI is connected, each becomes a fetch to the matching /api/v1 route with the same request and response shapes.
import * as server from '@/server/api'
import * as commercial from '@/server/commercialApi'
import * as twin from '@/server/twinApi'
import * as life from '@/server/lifeApi'
import * as shortTerm from '@/server/shortTermApi'
import * as controls from '@/server/controlsApi'
import * as funds from '@/server/fundsApi'
import * as specialist from '@/server/specialistApi'
import * as onboarding from '@/server/onboardingApi'
import * as clientBook from '@/server/clientBookApi'
import * as onboardingRuss from '@/server/agents/onboardingRuss'
import * as routes from '@/server/routesApi'
import { supabaseRoutePort } from '@/routes/port'
import type { Channel, Json } from '@/server/db/schema'
import { db } from '@/server/db/store'
import { ToolError } from '@/server/lib/errors'

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
/** The workspace the session last switched to. The server holds the real choice; this only partitions the query cache. */
const WORKSPACE_KEY = 'insureflow_workspace_v1'
const sessionListeners = new Set<() => void>()

export const session = {
  get: (): string | null => localStorage.getItem(SESSION_KEY),
  /** Cache key for the signed-in person in their current workspace. */
  token: (): string | null => {
    const user = localStorage.getItem(SESSION_KEY)
    return user ? `${user}:${localStorage.getItem(WORKSPACE_KEY) ?? ''}` : null
  },
  set(userId: string | null) {
    if (userId) localStorage.setItem(SESSION_KEY, userId)
    else localStorage.removeItem(SESSION_KEY)
    localStorage.removeItem(WORKSPACE_KEY)
    sessionListeners.forEach((l) => l())
  },
  workspaceChanged(organisationId: string) {
    localStorage.setItem(WORKSPACE_KEY, organisationId)
    sessionListeners.forEach((l) => l())
  },
  subscribe(fn: () => void) {
    sessionListeners.add(fn)
    return () => {
      sessionListeners.delete(fn)
    }
  },
}

const auth = (): server.Auth => {
  const userId = session.get()
  if (userId && !server.sessionExists(userId)) {
    session.set(null)
    return { userId: null }
  }
  return { userId: userId || null }
}

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
      void import('@/lib/supabase/sync').then((m) => m.supabaseSync.refresh())
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
    riskTwins: () => call(() => commercial.getRiskTwinPortfolio(auth())),
    buildTwin: (profileId: string) => call(() => commercial.startTwinBuildForProfile(auth(), { profile_id: profileId })),
    loadDemoBusinesses: () => call(() => commercial.loadDemoBusinesses(auth())),
    loadCompletedSubmissions: () => call(() => commercial.loadCompletedSubmissions(auth())),
    submissions: () => call(() => commercial.listSubmissions(auth())),
    submission: (id: string) => call(() => commercial.getSubmission(auth(), { submission_id: id })),
    updateSection: (body: Parameters<typeof commercial.updateSubmissionSection>[1]) => call(() => commercial.updateSubmissionSection(auth(), body)),
    requestApproval: (id: string) => call(() => commercial.requestSubmissionApproval(auth(), { submission_id: id })),
    updateTask: (body: Parameters<typeof commercial.updateTask>[1]) => call(() => commercial.updateTask(auth(), body)),
    portal: () => call(() => commercial.getPortalBusiness(auth())),
  },

  // /api/v1/short-term
  shortTerm: {
    personalLines: () => call(() => shortTerm.getPersonalLines(auth())),
    commercialCover: () => call(() => shortTerm.getCommercialCover(auth())),
  },

  // /api/v1/commercial/twins
  twin: {
    workspace: (profileId: string) => call(() => twin.getTwinWorkspace(auth(), { profile_id: profileId })),
    startAssessment: (body: Parameters<typeof twin.startAssessmentForProfile>[1]) => call(() => twin.startAssessmentForProfile(auth(), body)),
    startInvestigation: (body: Parameters<typeof twin.startInvestigationForProfile>[1]) => call(() => twin.startInvestigationForProfile(auth(), body)),
    node: (body: Parameters<typeof twin.getTwinNode>[1]) => call(() => twin.getTwinNode(auth(), body)),
    impact: (body: Parameters<typeof twin.traceTwinImpact>[1]) => call(() => twin.traceTwinImpact(auth(), body)),
    dependencies: (body: Parameters<typeof twin.traceTwinDependencies>[1]) => call(() => twin.traceTwinDependencies(auth(), body)),
    overridePriority: (body: Parameters<typeof twin.overrideExposurePriority>[1]) => call(() => twin.overrideExposurePriority(auth(), body)),
    decideFinding: (body: Parameters<typeof twin.decideFinding>[1]) => call(() => twin.decideFinding(auth(), body)),
    reviewCoverage: (body: Parameters<typeof twin.reviewCoverageFinding>[1]) => call(() => twin.reviewCoverageFinding(auth(), body)),
    checkCoverage: (profileId: string) => call(() => twin.checkCoverageEvidence(auth(), { profile_id: profileId })),
    addDocument: (body: Parameters<typeof twin.addBusinessDocument>[1]) => call(() => twin.addBusinessDocument(auth(), body)),
    decideProposal: (body: Parameters<typeof twin.decideTwinProposal>[1]) => call(() => twin.decideTwinProposal(auth(), body)),
    compare: (profileId: string) => call(() => twin.compareTwinWithBaseline(auth(), { profile_id: profileId })),
    gatherMissing: (profileId: string) => call(() => twin.gatherMissingInformation(auth(), { profile_id: profileId })),
    createTask: (body: Parameters<typeof twin.createTwinTask>[1]) => call(() => twin.createTwinTask(auth(), body)),
    decideDependency: (body: Parameters<typeof twin.decideDependency>[1]) => call(() => twin.decideDependency(auth(), body)),
    updateAsset: (body: Parameters<typeof twin.updateCommercialAsset>[1]) => call(() => twin.updateCommercialAsset(auth(), body)),
    report: (assessmentId: string) => call(() => twin.getAssessmentReport(auth(), { assessment_id: assessmentId })),
  },

  // /api/v1/life, /api/v1/people
  life: {
    people: (query?: string) => call(() => life.listPeople(auth(), { query })),
    person: (id: string) => call(() => life.getPerson(auth(), { person_id: id })),
    captureProfile: (body: Parameters<typeof life.captureFinancialProfile>[1]) => call(() => life.captureFinancialProfile(auth(), body)),
    startAdvice: (personId: string) => call(() => life.startLifeAdviceForPerson(auth(), { person_id: personId })),
    policies: (customerId?: string | null) => call(() => life.listLifePolicies(auth(), { customer_id: customerId })),
    policy: (id: string) => call(() => life.getPolicy(auth(), { policy_id: id })),
    recordDecision: (body: Parameters<typeof life.recordInsurerDecision>[1]) => call(() => life.recordInsurerDecision(auth(), body)),
    updateRequirement: (body: Parameters<typeof life.updateRequirement>[1]) => call(() => life.updateRequirement(auth(), body)),
    proposeBeneficiaries: (body: Parameters<typeof life.proposeBeneficiaries>[1]) => call(() => life.proposeBeneficiaries(auth(), body)),
    advice: (id: string) => call(() => life.getAdvice(auth(), { roa_id: id })),
    updateAdviceSection: (body: Parameters<typeof life.updateAdviceSection>[1]) => call(() => life.updateAdviceSection(auth(), body)),
    applySuggestion: (body: Parameters<typeof life.applyAdviceSuggestion>[1]) => call(() => life.applyAdviceSuggestion(auth(), body)),
    requestSignoff: (roaId: string) => call(() => life.requestAdviceSignoff(auth(), { roa_id: roaId })),
    servicing: () => call(() => life.getLifeServicing(auth())),
    runServicing: () => call(() => life.runServicingScan(auth())),
    bulkTasks: (body: Parameters<typeof life.bulkUpdateTasks>[1]) => call(() => life.bulkUpdateTasks(auth(), body)),
    lifeCase: (customerId: string, jobId?: string | null) => call(() => life.getLifeCase(auth(), { customer_id: customerId, job_id: jobId })),
    portal: () => call(() => life.getPortalLife(auth())),
  },

  // /api/v1/controls, /api/v1/employers
  controls: {
    sources: () => call(() => controls.listDataSources(auth())),
    imports: () => call(() => controls.listImports(auth())),
    importDetail: (id: string) => call(() => controls.getImport(auth(), { batch_id: id })),
    upload: (body: Parameters<typeof controls.uploadImport>[1]) => call(() => controls.uploadImport(auth(), body)),
    requestCommit: (batchId: string) => call(() => controls.requestCommit(auth(), { batch_id: batchId })),
    loadDemoFiles: () => call(() => controls.loadDemoFiles(auth())),
    reconciliations: () => call(() => controls.listReconciliations(auth())),
    reconciliation: (id: string) => call(() => controls.getReconciliation(auth(), { run_id: id })),
    runForJob: (jobId: string) => call(() => controls.getRunForJob(auth(), { job_id: jobId })),
    startContributionRecon: (body: Parameters<typeof controls.startContributionReconciliation>[1]) => call(() => controls.startContributionReconciliation(auth(), body)),
    exceptions: (openOnly = false) => call(() => controls.listExceptions(auth(), { open_only: openOnly })),
    updateExceptions: (body: Parameters<typeof controls.updateExceptions>[1]) => call(() => controls.updateExceptions(auth(), body)),
    resolveException: (body: Parameters<typeof controls.resolveException>[1]) => call(() => controls.resolveException(auth(), body)),
    employers: () => call(() => controls.listEmployers(auth())),
    employer: (id: string) => call(() => controls.getEmployer(auth(), { customer_id: id })),
    portalEmployer: () => call(() => controls.getPortalEmployer(auth())),
  },

  // /api/v1/funds, /api/v1/investments, /api/v1/transfers
  funds: {
    list: () => call(() => funds.listFunds(auth())),
    fund: (id: string) => call(() => funds.getFund(auth(), { fund_id: id })),
    reconcileBalance: (statementId: string) => call(() => funds.reconcileFundBalance(auth(), { statement_id: statementId })),
    updateBenefitStatus: (body: Parameters<typeof funds.updateBenefitStatus>[1]) => call(() => funds.updateBenefitStatus(auth(), body)),
    recordProviderDecision: (body: Parameters<typeof funds.recordProviderDecision>[1]) => call(() => funds.recordProviderDecision(auth(), body)),
    portfolios: () => call(() => funds.listPortfolios(auth())),
    portfolio: (id: string) => call(() => funds.getPortfolio(auth(), { portfolio_id: id })),
    reconcileHoldings: (portfolioId: string) => call(() => funds.reconcileHoldings(auth(), { portfolio_id: portfolioId })),
    transfers: () => call(() => funds.listTransfers(auth())),
    transfer: (id: string) => call(() => funds.getTransfer(auth(), { transfer_id: id })),
    reconcileTransfer: (id: string) => call(() => funds.reconcileTransfer(auth(), { transfer_id: id })),
    recordAllocation: (body: Parameters<typeof funds.recordAllocation>[1]) => call(() => funds.recordAllocation(auth(), body)),
    advanceTransfer: (body: Parameters<typeof funds.advanceTransfer>[1]) => call(() => funds.advanceTransfer(auth(), body)),
    startMovements: (employerId: string) => call(() => funds.startMovements(auth(), { employer_customer_id: employerId })),
  },

  // /api/v1/cells, /api/v1/governance, /api/v1/investigations, /api/v1/executive, /api/v1/compliance
  specialist: {
    cells: () => call(() => specialist.listCells(auth())),
    cell: (id: string) => call(() => specialist.getCell(auth(), { cell_id: id })),
    prepareCellReport: (id: string) => call(() => specialist.prepareCellReport(auth(), { cell_id: id })),
    portalCell: () => call(() => specialist.getPortalCell(auth())),
    governance: () => call(() => specialist.getGovernance(auth())),
    pack: (id: string) => call(() => specialist.getPack(auth(), { pack_id: id })),
    buildPack: (body: Parameters<typeof specialist.buildPack>[1]) => call(() => specialist.buildPack(auth(), body)),
    issuePack: (id: string) => call(() => specialist.issuePack(auth(), { pack_id: id })),
    recordGovernanceItem: (body: Parameters<typeof specialist.recordGovernanceItem>[1]) => call(() => specialist.recordGovernanceItem(auth(), body)),
    updateGovernanceItem: (body: Parameters<typeof specialist.updateGovernanceItem>[1]) => call(() => specialist.updateGovernanceItem(auth(), body)),
    investigations: () => call(() => specialist.listInvestigations(auth())),
    investigation: (id: string) => call(() => specialist.getInvestigation(auth(), { investigation_id: id })),
    openInvestigation: (body: Parameters<typeof specialist.openInvestigation>[1]) => call(() => specialist.openInvestigation(auth(), body)),
    snapshot: (body: Parameters<typeof specialist.snapshotDataset>[1]) => call(() => specialist.snapshotDataset(auth(), body)),
    recordFinding: (body: Parameters<typeof specialist.recordFinding>[1]) => call(() => specialist.recordFinding(auth(), body)),
    report: (id: string) => call(() => specialist.investigationReport(auth(), { investigation_id: id })),
    closeInvestigation: (id: string) => call(() => specialist.closeInvestigation(auth(), { investigation_id: id })),
    compareRuns: (body: Parameters<typeof specialist.compareRunsApi>[1]) => call(() => specialist.compareRunsApi(auth(), body)),
    opportunities: () => call(() => specialist.listOpportunities(auth())),
    executive: () => call(() => specialist.getExecutive(auth())),
    compliance: () => call(() => specialist.getCompliance(auth())),
  },

  // /api/v1/systems (loaded on demand: only managers and admins open it)
  systems: {
    catalogue: () => call(async () => (await import('@/server/systemsApi')).getSystemsCatalogue(auth())),
    ask: (question: string) => call(async () => (await import('@/server/systemsApi')).askSystemsCopilot(auth(), { question })),
  },

  // Demo Studio: broker onboarding sample data
  demoOnboarding: {
    load: () => call(async () => (await import('@/server/demo/onboardingSamples')).loadOnboardingSamples()),
    files: () => call(async () => (await import('@/server/demo/onboardingSamples')).sampleFiles()),
  },

  // Supabase Auth stand-in and rpc('switch_workspace')
  auth: {
    signUp: (body: Parameters<typeof onboarding.signUp>[0]) =>
      call(() => {
        const out = onboarding.signUp(body)
        session.set(out.user_id)
        return out
      }),
    signIn: (body: Parameters<typeof onboarding.signIn>[0]) =>
      call(() => {
        const out = onboarding.signIn(body)
        session.set(out.user_id)
        return out
      }),
    signOut: () => call(() => session.set(null)),
    switchWorkspace: (organisationId: string) =>
      call(() => {
        const out = onboarding.switchWorkspace(auth(), { organisation_id: organisationId })
        session.workspaceChanged(organisationId)
        return out
      }),
  },

  // /api/v1/onboarding (brokerage side), send-invitation and document-link Edge Functions
  onboarding: {
    invitation: (token: string) => call(() => onboarding.getInvitation({ token })),
    acceptInvitation: (token: string) =>
      call(() => {
        const out = onboarding.acceptInvitation(auth(), { token })
        session.workspaceChanged(out.organisation_id)
        return out
      }),
    start: (body: Parameters<typeof onboarding.startApplication>[1]) =>
      call(() => {
        const out = onboarding.startApplication(auth(), body)
        session.workspaceChanged(out.organisation_id)
        return out
      }),
    view: () => call(() => onboarding.getOnboarding(auth())),
    saveSection: (body: Parameters<typeof onboarding.saveSection>[1]) => call(() => onboarding.saveSection(auth(), body)),
    setSection: (section: Parameters<typeof onboarding.setCurrentSection>[1]['section']) => call(() => onboarding.setCurrentSection(auth(), { section })),
    submit: () => call(() => onboarding.submitApplication(auth())),
    withdraw: (reason: string) => call(() => onboarding.withdrawApplication(auth(), { reason })),
    agreeTerms: (body: Parameters<typeof onboarding.agreeTerms>[1]) => call(() => onboarding.agreeTerms(auth(), body)),
    upload: (body: Parameters<typeof onboarding.uploadDocument>[1]) => call(() => onboarding.uploadDocument(auth(), body)),
    sample: (requirementKey: string) => call(() => onboarding.useSampleDocument(auth(), { requirement_key: requirementKey })),
    documentLink: (documentId: string) => call(() => onboarding.getDocumentLink(auth(), { document_id: documentId })),
    openDocument: (token: string) => call(() => onboarding.openDocumentLink(auth(), { token })),
    decideProposal: (body: Parameters<typeof onboarding.decideProposal>[1]) => call(() => onboarding.decideProposal(auth(), body)),
    team: () => call(() => onboarding.getTeam(auth())),
    invite: (body: Parameters<typeof onboarding.createTeamInvitation>[1]) => call(() => onboarding.createTeamInvitation(auth(), body)),
    revokeInvitation: (invitationId: string) => call(() => onboarding.revokeInvitation(auth(), { invitation_id: invitationId })),
    changeRole: (body: Parameters<typeof onboarding.changeMemberRole>[1]) => call(() => onboarding.changeMemberRole(auth(), body)),
    removeMember: (membershipId: string) => call(() => onboarding.removeMember(auth(), { membership_id: membershipId })),
    home: () => call(() => onboarding.getBrokerageHome(auth())),
    russPanel: () => call(() => onboardingRuss.russPanel(auth())),
    russAsk: (message: string) => call(() => onboardingRuss.russOnboardingTurn(auth(), { message })),
  },

  // insurer-access Edge Function
  insurers: {
    list: () => call(() => onboarding.listInsurerAccess(auth())),
    declare: (body: Parameters<typeof onboarding.declareInsurerAccess>[1]) => call(() => onboarding.declareInsurerAccess(auth(), body)),
    credentials: (body: Parameters<typeof onboarding.submitInsurerCredentials>[1]) => call(() => onboarding.submitInsurerCredentials(auth(), body)),
    test: (accessId: string) => call(() => onboarding.testInsurerAccess(auth(), { access_id: accessId })),
    enable: (accessId: string) => call(() => onboarding.enableInsurerAccess(auth(), { access_id: accessId })),
    disable: (body: Parameters<typeof onboarding.disableInsurerAccess>[1]) => call(() => onboarding.disableInsurerAccess(auth(), body)),
  },

  // /api/v1/platform (B-Covered staff), rpc('activate_brokerage')
  platformAdmin: {
    queue: (status?: NonNullable<Parameters<typeof onboarding.listOnboardingQueue>[1]>['status']) => call(() => onboarding.listOnboardingQueue(auth(), { status })),
    review: (applicationId: string) => call(() => onboarding.getOnboardingReview(auth(), { application_id: applicationId })),
    assign: (body: Parameters<typeof onboarding.assignReviewer>[1]) => call(() => onboarding.assignReviewer(auth(), body)),
    startReview: (applicationId: string) => call(() => onboarding.startReview(auth(), { application_id: applicationId })),
    decideItem: (body: Parameters<typeof onboarding.decideItem>[1]) => call(() => onboarding.decideItem(auth(), body)),
    feedback: (body: Parameters<typeof onboarding.addFeedback>[1]) => call(() => onboarding.addFeedback(auth(), body)),
    note: (body: Parameters<typeof onboarding.addInternalNote>[1]) => call(() => onboarding.addInternalNote(auth(), body)),
    requestInformation: (body: Parameters<typeof onboarding.requestInformation>[1]) => call(() => onboarding.requestInformation(auth(), body)),
    approve: (body: Parameters<typeof onboarding.approveApplication>[1]) => call(() => onboarding.approveApplication(auth(), body)),
    decline: (body: Parameters<typeof onboarding.declineApplication>[1]) => call(() => onboarding.declineApplication(auth(), body)),
    activate: (applicationId: string) => call(() => onboarding.activateBrokerage(auth(), { application_id: applicationId })),
    brokerages: () => call(() => onboarding.listBrokerages(auth())),
    brokerage: (organisationId: string) => call(() => onboarding.getBrokerageAdmin(auth(), { organisation_id: organisationId })),
    suspend: (body: Parameters<typeof onboarding.suspendBrokerage>[1]) => call(() => onboarding.suspendBrokerage(auth(), body)),
    reinstate: (body: Parameters<typeof onboarding.reinstateBrokerage>[1]) => call(() => onboarding.reinstateBrokerage(auth(), body)),
    inviteOwner: (body: Parameters<typeof onboarding.createOwnerInvitation>[1]) => call(() => onboarding.createOwnerInvitation(auth(), body)),
    revokeInvitation: (invitationId: string) => call(() => onboarding.revokeInvitation(auth(), { invitation_id: invitationId })),
  },

  // client-book-import Edge Function
  clientBook: {
    list: () => call(() => clientBook.listClientBookImports(auth())),
    get: (batchId: string) => call(() => clientBook.getClientBookImport(auth(), { batch_id: batchId })),
    template: (dataset: clientBook.ClientBookDataset) => call(() => clientBook.clientBookTemplate(dataset)),
    upload: (body: Parameters<typeof clientBook.uploadClientBook>[1]) => call(() => clientBook.uploadClientBook(auth(), body)),
    map: (body: Parameters<typeof clientBook.mapClientBook>[1]) => call(() => clientBook.mapClientBook(auth(), body)),
    correct: (body: Parameters<typeof clientBook.correctClientBookRow>[1]) => call(() => clientBook.correctClientBookRow(auth(), body)),
    resolve: (body: Parameters<typeof clientBook.resolveClientBookDuplicate>[1]) => call(() => clientBook.resolveClientBookDuplicate(auth(), body)),
    attest: (batchId: string) => call(() => clientBook.attestClientBook(auth(), { batch_id: batchId, confirmed: true })),
    commit: (batchId: string) => call(() => clientBook.commitClientBook(auth(), { batch_id: batchId })),
    errorReport: (batchId: string) => call(() => clientBook.clientBookErrorReport(auth(), { batch_id: batchId })),
  },

  // /api/v1/routes: the guide's buttons and Russ (as: 'russ') run the same actions
  routes: {
    list: () => call(() => routes.listRoutesFor(auth())),
    progress: (runId: string) => call(() => routes.getRouteProgress(auth(), { run_id: runId })),
    start: (body: { definition_id: string; person_id?: string | null; key: string }, as?: routes.RouteCaller) =>
      call(() => routes.startRoute(auth(), body, supabaseRoutePort, as)),
    runAction: (body: Parameters<typeof routes.runRouteAction>[1], as?: routes.RouteCaller) =>
      call(() => routes.runRouteAction(auth(), body, supabaseRoutePort, as)),
    abandon: (runId: string) => call(() => routes.abandonRoute(auth(), { run_id: runId })),
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
  window.setInterval(() => server.recoverAllJobs(), 5000)
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
  SessionView,
  WorkspaceOption,
} from '@/server/api'
export type {
  ApplicationView,
  BrokerageAdminView,
  BrokerageHome,
  BrokerageRow,
  CreatedInvitation,
  DocumentView,
  FeedbackView,
  InsurerAccessPage,
  InvitationPreview,
  ItemDecision,
  ExtractionProposalView,
  OnboardingView,
  QueueRow,
  ReviewView,
  TeamView,
} from '@/server/onboardingApi'
export type { RouteActionResponse, RouteCaller, RouteCatalogue } from '@/server/routesApi'
export type { ActionOutcome, ActionProgress, PhaseProgress, RouteProgress, RunSummary } from '@/routes'
export type { ClientBookBatchRow, ClientBookBatchView, ClientBookDataset, ClientBookRowView, ImportField, ImportSummary } from '@/server/clientBookApi'
export type { RussAction, RussReply, RussTask } from '@/server/agents/onboardingRuss'
export type { InsurerAccessView } from '@/server/onboarding/insurers'
export type {
  BusinessDetail,
  BusinessRow,
  PortalBusinessView,
  AssessmentStatus,
  RiskTwinPortfolio,
  RiskTwinRow,
  SectionView,
  SubmissionDetail,
  SubmissionRow,
} from '@/server/commercialApi'
export type { FundDetail, FundRow, PortfolioDetail, PortfolioRow, TransferDetail, TransferRow } from '@/server/fundsApi'
export type { CommercialCoverBook, CoverAreaSummary, CoverClassSummary, PersonalLinesBook, PersonalProductKey, ShortTermPolicyRow } from '@/server/shortTermApi'
export type { CellView, ComplianceView, ExecutiveView, GovernanceView, InvestigationDetail } from '@/server/specialistApi'
export type { EmployerDetail, EmployerRow, ExceptionRow, ImportDetail, ImportRowView, PortalEmployerView, ReconDetail, ReconRow } from '@/server/controlsApi'
export type { AdviceDetail, LifeCase, PersonDetail, PersonRow, PolicyDetail, PolicyRow, PortalLifeView, ServicingItem } from '@/server/lifeApi'
export type { AssessmentReport, InvestigationView, LinkView, ProposalView, ReportFact, StageStatus, TwinWorkspace, WorkflowStage } from '@/server/twinApi'
export type { NodeDetail, ChangeReport } from '@/server/tools/twin'
export type { SystemsCatalogue, AgentInfo, ToolInfo, WorkflowInfo } from '@/server/systems/catalogue'
export type { SystemsAnswer, SystemsFocus, SystemsTab, DatabaseView } from '@/server/systems/copilot'
export type { ImpactReport, TraceResult } from '@/server/domain/commercial/graph'
