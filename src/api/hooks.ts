import { useSyncExternalStore } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { JobAction } from '@/server/api'
import { api, session } from './client'

/**
 * The current identity in its current workspace. Every query key includes it, so switching identity or brokerage never
 * shows the previous one's cached data.
 */
export const useSessionToken = () => useSyncExternalStore(session.subscribe, session.token, () => null)

function useKey(...parts: unknown[]) {
  return [useSessionToken() ?? 'visitor', ...parts]
}

function useInvalidatingMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: fn, onSettled: () => qc.invalidateQueries() })
}

export const useMe = () => useQuery({ queryKey: useKey('me'), queryFn: api.me })
export const useIdentities = () => useQuery({ queryKey: useKey('identities'), queryFn: api.identities })
export const usePlatform = () => useQuery({ queryKey: useKey('platform'), queryFn: api.platform })
export const useResetDemo = () => useInvalidatingMutation(() => api.resetDemo())

export const useConversation = (id: string | null) =>
  useQuery({ queryKey: useKey('conversation', id), queryFn: () => api.conversation(id!), enabled: Boolean(id) })
export const useConversationProgress = (id: string | null) =>
  useQuery({ queryKey: useKey('conversation-progress', id), queryFn: () => api.conversationProgress(id!), enabled: Boolean(id) })
export const useSendMessage = (id: string | null) => useInvalidatingMutation((text: string) => api.sendMessage(id!, text))

export const useJobs = (includeArchived = false) =>
  useQuery({ queryKey: useKey('jobs', includeArchived), queryFn: () => api.jobs(includeArchived) })
export const useJob = (id: string | null | undefined) =>
  useQuery({ queryKey: useKey('job', id), queryFn: () => api.job(id!), enabled: Boolean(id) })
export const useControlJob = () =>
  useInvalidatingMutation(({ jobId, action }: { jobId: string; action: JobAction }) => api.controlJob(jobId, action))

export const useLeads = () => useQuery({ queryKey: useKey('leads'), queryFn: api.leads })
export const useLead = (id: string | undefined) =>
  useQuery({ queryKey: useKey('lead', id), queryFn: () => api.lead(id!), enabled: Boolean(id) })

export const useQuote = (id: string | undefined) =>
  useQuery({ queryKey: useKey('quote', id), queryFn: () => api.quote(id!), enabled: Boolean(id) })
export const useAskQuote = (id: string) => useMutation({ mutationFn: (q: string) => api.askQuote(id, q) })

export const useApprovals = (status?: Parameters<typeof api.approvals>[0]) =>
  useQuery({ queryKey: useKey('approvals', status), queryFn: () => api.approvals(status) })
export const useDecideApproval = () => useInvalidatingMutation((body: Parameters<typeof api.decideApproval>[0]) => api.decideApproval(body))

export const usePortal = () => useQuery({ queryKey: useKey('portal'), queryFn: api.portal })
export const usePortalProposal = (quoteId: string | undefined) =>
  useQuery({ queryKey: useKey('portal-proposal', quoteId), queryFn: () => api.portalProposal(quoteId!), enabled: Boolean(quoteId) })
export const useOverview = () => useQuery({ queryKey: useKey('overview'), queryFn: api.overview })

const c = api.commercial
export const useIndustries = () => useQuery({ queryKey: useKey('industries'), queryFn: c.industries })
export const useCommercialClients = () => useQuery({ queryKey: useKey('commercial-clients'), queryFn: c.clients })
export const usePersonalLines = () => useQuery({ queryKey: useKey('personal-lines'), queryFn: api.shortTerm.personalLines })
export const useCommercialCover = () => useQuery({ queryKey: useKey('commercial-cover'), queryFn: api.shortTerm.commercialCover })
export const useCommercialClient = (id: string | null | undefined) =>
  useQuery({ queryKey: useKey('commercial-client', id), queryFn: () => c.client(id!), enabled: Boolean(id) })
export const useUpdateCommercialClient = () => useInvalidatingMutation(c.updateClient)
export const useRiskTwinPortfolio = () => useQuery({ queryKey: useKey('risk-twins'), queryFn: c.riskTwins })
export const useStartTwinBuild = () => useInvalidatingMutation(c.buildTwin)
export const useLoadDemoBusinesses = () => useInvalidatingMutation(() => c.loadDemoBusinesses())
export const useLoadCompletedSubmissions = () => useInvalidatingMutation(() => c.loadCompletedSubmissions())
export const useSubmissions = () => useQuery({ queryKey: useKey('submissions'), queryFn: c.submissions })
export const useSubmission = (id: string | null | undefined) =>
  useQuery({ queryKey: useKey('submission', id), queryFn: () => c.submission(id!), enabled: Boolean(id) })
export const useUpdateSection = () => useInvalidatingMutation(c.updateSection)
export const useRequestSubmissionApproval = () => useInvalidatingMutation(c.requestApproval)
export const useUpdateTask = () => useInvalidatingMutation(c.updateTask)
export const usePortalBusiness = () => useQuery({ queryKey: useKey('portal-business'), queryFn: c.portal })

const t = api.twin
export const useTwinWorkspace = (profileId: string | null | undefined) =>
  useQuery({ queryKey: useKey('twin-workspace', profileId), queryFn: () => t.workspace(profileId!), enabled: Boolean(profileId) })
export const useTwinNode = (body: Parameters<typeof t.node>[0] | null) =>
  useQuery({ queryKey: useKey('twin-node', body), queryFn: () => t.node(body!), enabled: Boolean(body) })
export const useTwinImpact = (body: Parameters<typeof t.impact>[0] | null) =>
  useQuery({ queryKey: useKey('twin-impact', body), queryFn: () => t.impact(body!), enabled: Boolean(body) })
export const useTwinDependencies = (body: Parameters<typeof t.dependencies>[0] | null) =>
  useQuery({ queryKey: useKey('twin-dependencies', body), queryFn: () => t.dependencies(body!), enabled: Boolean(body) })
export const useAssessmentReport = (assessmentId: string | undefined) =>
  useQuery({ queryKey: useKey('assessment-report', assessmentId), queryFn: () => t.report(assessmentId!), enabled: Boolean(assessmentId) })
export const useStartAssessment = () => useInvalidatingMutation(t.startAssessment)
export const useStartInvestigation = () => useInvalidatingMutation(t.startInvestigation)
export const useOverridePriority = () => useInvalidatingMutation(t.overridePriority)
export const useDecideFinding = () => useInvalidatingMutation(t.decideFinding)
export const useReviewCoverage = () => useInvalidatingMutation(t.reviewCoverage)
export const useCheckCoverage = () => useInvalidatingMutation(t.checkCoverage)
export const useAddDocument = () => useInvalidatingMutation(t.addDocument)
export const useDecideProposal = () => useInvalidatingMutation(t.decideProposal)
export const useCompareTwin = () => useInvalidatingMutation(t.compare)
export const useGatherMissing = () => useInvalidatingMutation(t.gatherMissing)
export const useCreateTwinTask = () => useInvalidatingMutation(t.createTask)
export const useDecideDependency = () => useInvalidatingMutation(t.decideDependency)
export const useUpdateAsset = () => useInvalidatingMutation(t.updateAsset)

const l = api.life
export const usePeople = (query?: string) => useQuery({ queryKey: useKey('people', query), queryFn: () => l.people(query) })
export const usePerson = (id: string | undefined) => useQuery({ queryKey: useKey('person', id), queryFn: () => l.person(id!), enabled: Boolean(id) })
export const useCaptureProfile = () => useInvalidatingMutation(l.captureProfile)
export const useStartLifeAdvice = () => useInvalidatingMutation(l.startAdvice)
export const useLifePolicies = (customerId?: string | null) => useQuery({ queryKey: useKey('life-policies', customerId), queryFn: () => l.policies(customerId) })
export const usePolicy = (id: string | undefined) => useQuery({ queryKey: useKey('policy', id), queryFn: () => l.policy(id!), enabled: Boolean(id) })
export const useRecordDecision = () => useInvalidatingMutation(l.recordDecision)
export const useUpdateRequirement = () => useInvalidatingMutation(l.updateRequirement)
export const useProposeBeneficiaries = () => useInvalidatingMutation(l.proposeBeneficiaries)
export const useAdvice = (id: string | undefined) => useQuery({ queryKey: useKey('advice', id), queryFn: () => l.advice(id!), enabled: Boolean(id) })
export const useUpdateAdviceSection = () => useInvalidatingMutation(l.updateAdviceSection)
export const useApplySuggestion = () => useInvalidatingMutation(l.applySuggestion)
export const useRequestSignoff = () => useInvalidatingMutation(l.requestSignoff)
export const useLifeServicing = () => useQuery({ queryKey: useKey('life-servicing'), queryFn: l.servicing })
export const useRunServicing = () => useInvalidatingMutation(() => l.runServicing())
export const useBulkTasks = () => useInvalidatingMutation(l.bulkTasks)
export const useLifeCase = (customerId: string | null | undefined, jobId?: string | null) =>
  useQuery({ queryKey: useKey('life-case', customerId, jobId), queryFn: () => l.lifeCase(customerId!, jobId), enabled: Boolean(customerId) })
export const usePortalLife = () => useQuery({ queryKey: useKey('portal-life'), queryFn: l.portal })

const k = api.controls
export const useDataSources = () => useQuery({ queryKey: useKey('data-sources'), queryFn: k.sources })
export const useImports = () => useQuery({ queryKey: useKey('imports'), queryFn: k.imports })
export const useImport = (id: string | undefined) => useQuery({ queryKey: useKey('import', id), queryFn: () => k.importDetail(id!), enabled: Boolean(id) })
export const useUploadImport = () => useInvalidatingMutation(k.upload)
export const useRequestCommit = () => useInvalidatingMutation(k.requestCommit)
export const useLoadDemoFiles = () => useInvalidatingMutation(() => k.loadDemoFiles())
export const useReconciliations = () => useQuery({ queryKey: useKey('reconciliations'), queryFn: k.reconciliations })
export const useReconciliation = (id: string | null | undefined) => useQuery({ queryKey: useKey('reconciliation', id), queryFn: () => k.reconciliation(id!), enabled: Boolean(id) })
export const useRunForJob = (jobId: string | null | undefined) => useQuery({ queryKey: useKey('run-for-job', jobId), queryFn: () => k.runForJob(jobId!), enabled: Boolean(jobId) })
export const useStartContributionRecon = () => useInvalidatingMutation(k.startContributionRecon)
export const useExceptions = (openOnly = false) => useQuery({ queryKey: useKey('exceptions', openOnly), queryFn: () => k.exceptions(openOnly) })
export const useUpdateExceptions = () => useInvalidatingMutation(k.updateExceptions)
export const useResolveException = () => useInvalidatingMutation(k.resolveException)
export const useEmployers = () => useQuery({ queryKey: useKey('employers'), queryFn: k.employers })
export const useEmployer = (id: string | undefined) => useQuery({ queryKey: useKey('employer', id), queryFn: () => k.employer(id!), enabled: Boolean(id) })
export const usePortalEmployer = () => useQuery({ queryKey: useKey('portal-employer'), queryFn: k.portalEmployer })

const f = api.funds
export const useFunds = () => useQuery({ queryKey: useKey('funds'), queryFn: f.list })
export const useFund = (id: string | undefined) => useQuery({ queryKey: useKey('fund', id), queryFn: () => f.fund(id!), enabled: Boolean(id) })
export const useReconcileBalance = () => useInvalidatingMutation(f.reconcileBalance)
export const useUpdateBenefitStatus = () => useInvalidatingMutation(f.updateBenefitStatus)
export const useRecordProviderDecision = () => useInvalidatingMutation(f.recordProviderDecision)
export const usePortfolios = () => useQuery({ queryKey: useKey('portfolios'), queryFn: f.portfolios })
export const usePortfolio = (id: string | undefined) => useQuery({ queryKey: useKey('portfolio', id), queryFn: () => f.portfolio(id!), enabled: Boolean(id) })
export const useReconcileHoldings = () => useInvalidatingMutation(f.reconcileHoldings)
export const useTransfers = () => useQuery({ queryKey: useKey('transfers'), queryFn: f.transfers })
export const useTransfer = (id: string | undefined) => useQuery({ queryKey: useKey('transfer', id), queryFn: () => f.transfer(id!), enabled: Boolean(id) })
export const useReconcileTransfer = () => useInvalidatingMutation(f.reconcileTransfer)
export const useRecordAllocation = () => useInvalidatingMutation(f.recordAllocation)
export const useAdvanceTransfer = () => useInvalidatingMutation(f.advanceTransfer)
export const useStartMovements = () => useInvalidatingMutation(f.startMovements)

const s = api.specialist
export const useCells = () => useQuery({ queryKey: useKey('cells'), queryFn: s.cells })
export const useCell = (id: string | undefined) => useQuery({ queryKey: useKey('cell', id), queryFn: () => s.cell(id!), enabled: Boolean(id) })
export const usePrepareCellReport = () => useInvalidatingMutation(s.prepareCellReport)
export const usePortalCell = () => useQuery({ queryKey: useKey('portal-cell'), queryFn: s.portalCell })
export const useGovernance = () => useQuery({ queryKey: useKey('governance'), queryFn: s.governance })
export const usePack = (id: string | undefined) => useQuery({ queryKey: useKey('pack', id), queryFn: () => s.pack(id!), enabled: Boolean(id) })
export const useBuildPack = () => useInvalidatingMutation(s.buildPack)
export const useIssuePack = () => useInvalidatingMutation(s.issuePack)
export const useRecordGovernanceItem = () => useInvalidatingMutation(s.recordGovernanceItem)
export const useUpdateGovernanceItem = () => useInvalidatingMutation(s.updateGovernanceItem)
export const useInvestigations = () => useQuery({ queryKey: useKey('investigations'), queryFn: s.investigations })
export const useInvestigation = (id: string | undefined) => useQuery({ queryKey: useKey('investigation', id), queryFn: () => s.investigation(id!), enabled: Boolean(id) })
export const useOpenInvestigation = () => useInvalidatingMutation(s.openInvestigation)
export const useSnapshot = () => useInvalidatingMutation(s.snapshot)
export const useRecordFinding = () => useInvalidatingMutation(s.recordFinding)
export const useInvestigationReport = () => useInvalidatingMutation(s.report)
export const useCloseInvestigation = () => useInvalidatingMutation(s.closeInvestigation)
export const useCompareRuns = () => useMutation({ mutationFn: s.compareRuns })
export const useOpportunities = () => useQuery({ queryKey: useKey('opportunities'), queryFn: s.opportunities })
export const useExecutive = () => useQuery({ queryKey: useKey('executive'), queryFn: s.executive })
export const useCompliance = () => useQuery({ queryKey: useKey('compliance'), queryFn: s.compliance })

export const useSystemsCatalogue = () => useQuery({ queryKey: useKey('systems'), queryFn: api.systems.catalogue })
export const useAskSystems = () => useMutation({ mutationFn: (question: string) => api.systems.ask(question) })

// ------------------------------------------------------------------ brokerage onboarding
export const useLoadOnboardingSamples = () => useInvalidatingMutation(() => api.demoOnboarding.load())
export const useOnboardingSampleFiles = () => useQuery({ queryKey: ['onboarding-sample-files'], queryFn: api.demoOnboarding.files, staleTime: Infinity })
const o = api.onboarding
export const useSignIn = () => useInvalidatingMutation(api.auth.signIn)
export const useSignUp = () => useInvalidatingMutation(api.auth.signUp)
export const useSignOut = () => useInvalidatingMutation(() => api.auth.signOut())
export const useSwitchWorkspace = () => useInvalidatingMutation(api.auth.switchWorkspace)
export const useInvitation = (token: string | undefined) =>
  useQuery({ queryKey: useKey('invitation', token), queryFn: () => o.invitation(token!), enabled: Boolean(token), retry: false })
export const useAcceptInvitation = () => useInvalidatingMutation(o.acceptInvitation)
export const useStartApplication = () => useInvalidatingMutation(o.start)
export const useOnboarding = (enabled = true) => useQuery({ queryKey: useKey('onboarding'), queryFn: o.view, enabled, retry: false })
export const useSaveSection = () => useInvalidatingMutation(o.saveSection)
export const useSetSection = () => useMutation({ mutationFn: o.setSection })
export const useSubmitApplication = () => useInvalidatingMutation(() => o.submit())
export const useWithdrawApplication = () => useInvalidatingMutation(o.withdraw)
export const useAgreeTerms = () => useInvalidatingMutation(o.agreeTerms)
export const useUploadDocument = () => useInvalidatingMutation(o.upload)
export const useSampleDocument = () => useInvalidatingMutation(o.sample)
export const useDecideExtraction = () => useInvalidatingMutation(o.decideProposal)
export const useTeam = () => useQuery({ queryKey: useKey('team'), queryFn: o.team })
export const useInviteMember = () => useInvalidatingMutation(o.invite)
export const useRevokeInvitation = () => useInvalidatingMutation(o.revokeInvitation)
export const useChangeMemberRole = () => useInvalidatingMutation(o.changeRole)
export const useRemoveMember = () => useInvalidatingMutation(o.removeMember)
export const useBrokerageHome = (enabled = true) => useQuery({ queryKey: useKey('brokerage-home'), queryFn: o.home, enabled, retry: false })
export const useRussPanel = () => useQuery({ queryKey: useKey('russ-panel'), queryFn: o.russPanel, retry: false })
export const useAskRuss = () => useMutation({ mutationFn: o.russAsk })

const ins = api.insurers
export const useInsurerAccess = () => useQuery({ queryKey: useKey('insurer-access'), queryFn: ins.list })
export const useDeclareInsurer = () => useInvalidatingMutation(ins.declare)
export const useInsurerCredentials = () => useInvalidatingMutation(ins.credentials)
export const useTestInsurer = () => useInvalidatingMutation(ins.test)
export const useEnableInsurer = () => useInvalidatingMutation(ins.enable)
export const useDisableInsurer = () => useInvalidatingMutation(ins.disable)

const pa = api.platformAdmin
export const useOnboardingQueue = () => useQuery({ queryKey: useKey('onboarding-queue'), queryFn: () => pa.queue() })
export const useOnboardingReview = (id: string | undefined) =>
  useQuery({ queryKey: useKey('onboarding-review', id), queryFn: () => pa.review(id!), enabled: Boolean(id) })
export const usePlatformAction = <V, R>(fn: (v: V) => Promise<R>) => useInvalidatingMutation(fn)
export const useBrokerages = () => useQuery({ queryKey: useKey('brokerages'), queryFn: pa.brokerages })
export const useBrokerageAdmin = (id: string | undefined) =>
  useQuery({ queryKey: useKey('brokerage-admin', id), queryFn: () => pa.brokerage(id!), enabled: Boolean(id) })

const cb = api.clientBook
export const useClientBookImports = () => useQuery({ queryKey: useKey('client-book'), queryFn: cb.list })
export const useClientBookImport = (id: string | undefined) =>
  useQuery({ queryKey: useKey('client-book-batch', id), queryFn: () => cb.get(id!), enabled: Boolean(id) })
export const useClientBookAction = <V, R>(fn: (v: V) => Promise<R>) => useInvalidatingMutation(fn)

const rt = api.routes
export const useRoutes = () => useQuery({ queryKey: useKey('routes'), queryFn: rt.list })
export const useRouteRun = (id: string | undefined) =>
  useQuery({ queryKey: useKey('route-run', id), queryFn: () => rt.progress(id!), enabled: Boolean(id), retry: false })
export const useStartRoute = () => useInvalidatingMutation(rt.start)
export const useRunRouteAction = () => useInvalidatingMutation((body: Parameters<typeof rt.runAction>[0]) => rt.runAction(body))
export const useAbandonRoute = () => useInvalidatingMutation(rt.abandon)
