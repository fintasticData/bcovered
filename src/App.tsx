import { lazy, Suspense, useEffect } from 'react'
import { Link, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { LATEST_UPDATE_HEADLINE } from './data/latestUpdate'
import Header from './components/Header'
import Footer from './components/Footer'
import { RequireRole } from './components/RequireRole'
import HomePage from './pages/HomePage'
import NotFound from './pages/NotFound'
import { LoadingState } from './broker/PageHeader'
import { CONTROLS_HUB, LIFE_POLICIES_HUB, SETTINGS_HUB, TabbedHub } from './broker/shared/TabbedHub'

const ProductPage = lazy(() => import('./pages/ProductPage'))
const QuotePage = lazy(() => import('./pages/QuotePage'))
const ClaimsPage = lazy(() => import('./pages/ClaimsPage'))
const AboutPage = lazy(() => import('./pages/AboutPage'))
const ContactPage = lazy(() => import('./pages/ContactPage'))
const LegalPage = lazy(() => import('./pages/LegalPage'))
const AssistPage = lazy(() => import('./pages/AssistPage'))
const DemoStudioPage = lazy(() => import('./pages/DemoStudioPage'))
const HelpPage = lazy(() => import('./pages/HelpPage'))
const FaqPage = lazy(() => import('./pages/FaqPage'))
const UpdatesPage = lazy(() => import('./pages/UpdatesPage'))
const PortalPage = lazy(() => import('./pages/portal/PortalPage'))
const PortalProposalPage = lazy(() => import('./pages/portal/PortalProposalPage'))
const BrokerLayout = lazy(() => import('./broker/BrokerLayout'))
const OverviewPage = lazy(() => import('./broker/OverviewPage'))
const WorkspacePage = lazy(() => import('./broker/WorkspacePage'))
const BookPage = lazy(() => import('./broker/book/BookPage'))
const RoutesPage = lazy(() => import('./broker/routes/RoutesPage'))
const RouteGuidePage = lazy(() => import('./broker/routes/RouteGuidePage'))
const BrokerSignUpPage = lazy(() => import('./pages/brokers/BrokerSignUpPage'))
const TeamJoinPage = lazy(() => import('./pages/brokers/TeamJoinPage'))
const ReferralEnquiryPage = lazy(() => import('./pages/ReferralEnquiryPage'))
const FranchisePage = lazy(() => import('./broker/franchise/FranchisePage'))
const OutletPortalPage = lazy(() => import('./pages/outlet/OutletPortalPage'))
const OutletJoinPage = lazy(() => import('./pages/outlet/OutletJoinPage'))
const LeadsPage = lazy(() => import('./broker/LeadsPage'))
const LeadDetailPage = lazy(() => import('./broker/LeadDetailPage'))
const BrokerQuotePage = lazy(() => import('./broker/BrokerQuotePage'))
const SampleMotorQuotePage = lazy(() => import('./broker/quotes/SampleMotorQuotePage'))
const ApprovalsPage = lazy(() => import('./broker/ApprovalsPage'))
const JobsPage = lazy(() => import('./broker/JobsPage'))
const JobDetailPage = lazy(() => import('./broker/JobDetailPage'))
const ClientsPage = lazy(() => import('./broker/commercial/ClientsPage'))
const CoverPage = lazy(() => import('./broker/commercial/CoverPage'))
const PersonalLinesPage = lazy(() => import('./broker/shortterm/PersonalLinesPage'))
const ShortTermPolicyPage = lazy(() => import('./broker/shortterm/PolicyPage'))
const AccountPage = lazy(() => import('./broker/accounts/AccountPage'))
const ClientDetailPage = lazy(() => import('./broker/commercial/ClientDetailPage'))
const RiskTwinsPage = lazy(() => import('./broker/commercial/RiskTwinsPage'))
const TwinWorkspacePage = lazy(() => import('./broker/commercial/twin/TwinWorkspacePage'))
const AssessmentReportPage = lazy(() => import('./broker/commercial/twin/AssessmentReportPage'))
const SubmissionsPage = lazy(() => import('./broker/commercial/SubmissionsPage'))
const SubmissionPage = lazy(() => import('./broker/commercial/SubmissionPage'))
const SystemsPage = lazy(() => import('./broker/systems/SystemsPage'))
const BusinessHomePage = lazy(() => import('./pages/business/BusinessHomePage'))
const BusinessIndustriesPage = lazy(() => import('./pages/business/BusinessIndustriesPage'))
const BusinessCoverPage = lazy(() => import('./pages/business/BusinessCoverPage'))
const BusinessRiskReviewPage = lazy(() => import('./pages/business/BusinessRiskReviewPage'))
const PortalBusinessPage = lazy(() => import('./pages/portal/PortalBusinessPage'))
const PortalRiskProfilePage = lazy(() => import('./pages/portal/PortalRiskProfilePage'))
const PortalLifePage = lazy(() => import('./pages/portal/PortalLifePage'))
const PeoplePage = lazy(() => import('./broker/people/PeoplePage'))
const PersonPage = lazy(() => import('./broker/people/PersonPage'))
const PoliciesPage = lazy(() => import('./broker/life/PoliciesPage'))
const PolicyPage = lazy(() => import('./broker/life/PolicyPage'))
const AdvicePage = lazy(() => import('./broker/life/AdvicePage'))
const ServicingPage = lazy(() => import('./broker/life/ServicingPage'))
const ImportsPage = lazy(() => import('./broker/controls/ImportsPage'))
const ImportPage = lazy(() => import('./broker/controls/ImportPage'))
const ReconciliationsPage = lazy(() => import('./broker/controls/ReconciliationsPage'))
const ReconciliationPage = lazy(() => import('./broker/controls/ReconciliationPage'))
const ExceptionsPage = lazy(() => import('./broker/controls/ExceptionsPage'))
const EmployersPage = lazy(() => import('./broker/benefits/EmployersPage'))
const EmployerPage = lazy(() => import('./broker/benefits/EmployerPage'))
const PortalEmployerPage = lazy(() => import('./pages/portal/PortalEmployerPage'))
const PortalCellPage = lazy(() => import('./pages/portal/PortalCellPage'))
const FundsPage = lazy(() => import('./broker/funds/FundsPage'))
const FundPage = lazy(() => import('./broker/funds/FundPage'))
const InvestmentsPage = lazy(() => import('./broker/funds/InvestmentsPage'))
const PortfolioPage = lazy(() => import('./broker/funds/PortfolioPage'))
const TransfersPage = lazy(() => import('./broker/funds/TransfersPage'))
const TransferPage = lazy(() => import('./broker/funds/TransferPage'))
const CellsPage = lazy(() => import('./broker/specialist/CellsPage'))
const CellPage = lazy(() => import('./broker/specialist/CellPage'))
const GovernancePage = lazy(() => import('./broker/specialist/GovernancePage'))
const PackPage = lazy(() => import('./broker/specialist/PackPage'))
const InvestigationsPage = lazy(() => import('./broker/specialist/InvestigationsPage'))
const InvestigationPage = lazy(() => import('./broker/specialist/InvestigationPage'))
const ExecutivePage = lazy(() => import('./broker/specialist/ExecutivePage'))
const CompliancePage = lazy(() => import('./broker/specialist/CompliancePage'))
const SignInPage = lazy(() => import('./pages/auth/SignInPage'))
const JoinPage = lazy(() => import('./pages/brokers/JoinPage'))
const InvitePage = lazy(() => import('./pages/brokers/InvitePage'))
const OnboardingPage = lazy(() => import('./onboarding/OnboardingPage'))
const PlatformLayout = lazy(() => import('./platform/PlatformLayout'))
const QueuePage = lazy(() => import('./platform/QueuePage'))
const ReviewPage = lazy(() => import('./platform/ReviewPage'))
const BrokeragesPage = lazy(() => import('./platform/BrokeragesPage'))
const BrokeragePage = lazy(() => import('./platform/BrokeragePage'))
const InvitationsPage = lazy(() => import('./platform/InvitationsPage'))
const TeamPage = lazy(() => import('./broker/settings/TeamPage'))
const InsurersPage = lazy(() => import('./broker/settings/InsurersPage'))
const ClientBookImportsPage = lazy(() => import('./broker/imports/ClientBookImportsPage'))
const ClientBookImportPage = lazy(() => import('./broker/imports/ClientBookImportPage'))

function ScrollToTop() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (!hash) {
      window.scrollTo(0, 0)
      return
    }
    // Targets on lazy or data-driven pages render after navigation, so wait briefly for them.
    let tries = 0
    const timer = window.setInterval(() => {
      const el = document.getElementById(decodeURIComponent(hash.slice(1)))
      if (el || ++tries > 40) {
        window.clearInterval(timer)
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }, 50)
    return () => window.clearInterval(timer)
  }, [pathname, hash])
  return null
}

function routeIdentity(pathname: string): 'personal' | 'business' | undefined {
  if (pathname.startsWith('/business') || pathname.startsWith('/portal/business')) return 'business'
  if (pathname.startsWith('/insurance/') || pathname === '/quote' || pathname.startsWith('/portal')) return 'personal'
  return undefined
}

function PublicLayout() {
  const { pathname } = useLocation()
  return (
    <div className="flex min-h-screen flex-col">
      <div className="bg-brand-900 px-4 py-1.5 text-center text-xs text-brand-100">
        <span className="hidden sm:inline">InsureFlow AI demo · BCovered is a fictional brokerage. All people, insurers and figures are synthetic. </span>
        <span className="sm:hidden">Fictional demo brokerage · synthetic data. </span>
        <Link to={`/updates#${LATEST_UPDATE_HEADLINE.id}`} className="ml-1 font-semibold text-gold-300 hover:text-gold-400">
          What’s new<span className="hidden md:inline">: {LATEST_UPDATE_HEADLINE.title}</span> →
        </Link>
      </div>
      <Header />
      <main className="flex-1" data-identity={routeIdentity(pathname)}>
        <Suspense fallback={<div className="container-x min-h-[60vh]"><LoadingState /></div>}>
          <Outlet />
        </Suspense>
      </main>
      <Footer />
    </div>
  )
}

function AppLoading() {
  return (
    <div className="grid min-h-dvh place-items-center bg-mist">
      <LoadingState label="Loading the workspace…" />
    </div>
  )
}

const STAFF = ['broker', 'manager', 'admin'] as const

/** The former per-module Russ workspaces now open the single workspace in the matching lens, keeping any `?prompt=`. */
function LensRedirect({ lens }: { lens: string }) {
  const { search } = useLocation()
  const q = new URLSearchParams(search)
  q.set('lens', lens)
  return <Navigate to={`/broker/workspace?${q.toString()}`} replace />
}

const systems = (
  <RequireRole roles={['manager', 'admin']} area="Systems">
    <SystemsPage />
  </RequireRole>
)

export default function App() {
  return (
    <Suspense fallback={<AppLoading />}>
      <ScrollToTop />
      <Routes>
        <Route element={<PublicLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/insurance/:slug" element={<ProductPage />} />
          <Route path="/assist" element={<AssistPage />} />
          <Route path="/quote" element={<QuotePage />} />
          <Route path="/claims" element={<ClaimsPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/demo" element={<DemoStudioPage />} />
          <Route path="/help" element={<HelpPage />} />
          <Route path="/faq" element={<FaqPage />} />
          <Route path="/updates" element={<UpdatesPage />} />
          <Route path="/legal" element={<LegalPage />} />
          <Route path="/sign-in" element={<SignInPage />} />
          <Route path="/brokers/join" element={<JoinPage />} />
          <Route path="/brokers/signup" element={<BrokerSignUpPage />} />
          <Route path="/brokers/invite/:token" element={<InvitePage />} />
          <Route path="/team/join/:token" element={<TeamJoinPage />} />
          <Route path="/r/:code" element={<ReferralEnquiryPage />} />
          <Route path="/enquire" element={<ReferralEnquiryPage />} />
          <Route path="/outlet" element={<OutletPortalPage />} />
          <Route path="/outlet/join/:token" element={<OutletJoinPage />} />
          <Route path="/business" element={<BusinessHomePage />} />
          <Route path="/business/industries" element={<BusinessIndustriesPage />} />
          <Route path="/business/cover" element={<BusinessCoverPage />} />
          <Route path="/business/risk-review" element={<BusinessRiskReviewPage />} />
          <Route
            path="/portal/business"
            element={
              <RequireRole roles={['customer']} area="The business portal">
                <PortalBusinessPage />
              </RequireRole>
            }
          />
          <Route
            path="/portal/business/risk-profile"
            element={
              <RequireRole roles={['customer']} area="The business portal">
                <PortalRiskProfilePage />
              </RequireRole>
            }
          />
          <Route
            path="/portal"
            element={
              <RequireRole roles={['customer']} area="The customer portal">
                <PortalPage />
              </RequireRole>
            }
          />
          <Route
            path="/portal/life"
            element={
              <RequireRole roles={['customer']} area="The customer portal">
                <PortalLifePage />
              </RequireRole>
            }
          />
          <Route
            path="/portal/employer"
            element={
              <RequireRole roles={['customer']} area="The employer portal">
                <PortalEmployerPage />
              </RequireRole>
            }
          />
          <Route
            path="/portal/cell"
            element={
              <RequireRole roles={['customer']} area="The cell owner portal">
                <PortalCellPage />
              </RequireRole>
            }
          />
          <Route
            path="/portal/proposals/:quoteId"
            element={
              <RequireRole roles={['customer']} area="The customer portal">
                <PortalProposalPage />
              </RequireRole>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Route>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/onboarding/:section" element={<OnboardingPage />} />
        <Route path="/platform" element={<PlatformLayout />}>
          <Route index element={<Navigate to="/platform/onboarding" replace />} />
          <Route path="/platform/onboarding" element={<QueuePage />} />
          <Route path="/platform/onboarding/:applicationId" element={<ReviewPage />} />
          <Route path="/platform/brokerages" element={<BrokeragesPage />} />
          <Route path="/platform/brokerages/:organisationId" element={<BrokeragePage />} />
          <Route path="/platform/invitations" element={<InvitationsPage />} />
        </Route>
        <Route
          path="/broker"
          element={
            <RequireRole roles={[...STAFF]} area="The broker workspace">
              <BrokerLayout />
            </RequireRole>
          }
        >
          <Route index element={<OverviewPage />} />
          <Route path="workspace" element={<WorkspacePage />} />
          <Route path="book" element={<BookPage />} />
          <Route path="book/clients/:personId" element={<BookPage />} />
          <Route path="routes" element={<RoutesPage />} />
          <Route path="routes/runs/:runId" element={<RouteGuidePage />} />
          <Route path="franchise" element={<FranchisePage />} />
          <Route path="leads" element={<LeadsPage />} />
          <Route path="leads/:leadId" element={<LeadDetailPage />} />
          <Route path="quotes/sample-motor" element={<SampleMotorQuotePage />} />
          <Route path="quotes/:quoteId" element={<BrokerQuotePage />} />
          <Route path="approvals" element={<ApprovalsPage />} />
          <Route path="jobs" element={<JobsPage />} />
          <Route path="jobs/:jobId" element={<JobDetailPage />} />
          <Route path="commercial" element={<LensRedirect lens="commercial" />} />
          <Route path="personal" element={<PersonalLinesPage />} />
          <Route path="personal/policies/:policyId" element={<ShortTermPolicyPage />} />
          <Route path="accounts/:accountId" element={<AccountPage />} />
          <Route path="commercial/cover" element={<CoverPage />} />
          <Route path="commercial/clients" element={<ClientsPage />} />
          <Route path="commercial/clients/:profileId" element={<ClientDetailPage />} />
          <Route path="commercial/risk-twins" element={<RiskTwinsPage />} />
          <Route path="commercial/risk-twins/:profileId" element={<TwinWorkspacePage />} />
          <Route path="commercial/assessments/:assessmentId/report" element={<AssessmentReportPage />} />
          <Route path="commercial/submissions" element={<SubmissionsPage />} />
          <Route path="commercial/submissions/:submissionId" element={<SubmissionPage />} />
          <Route path="life" element={<LensRedirect lens="life" />} />
          <Route path="people" element={<PeoplePage />} />
          <Route path="people/:personId" element={<PersonPage />} />
          <Route path="life/policies" element={<TabbedHub hub={LIFE_POLICIES_HUB}><PoliciesPage /></TabbedHub>} />
          <Route path="life/policies/:policyId" element={<PolicyPage />} />
          <Route path="life/advice/:roaId" element={<AdvicePage />} />
          <Route path="life/servicing" element={<TabbedHub hub={LIFE_POLICIES_HUB}><ServicingPage /></TabbedHub>} />
          <Route path="controls" element={<LensRedirect lens="controls" />} />
          <Route path="controls/imports" element={<TabbedHub hub={CONTROLS_HUB}><ImportsPage /></TabbedHub>} />
          <Route path="controls/imports/:batchId" element={<ImportPage />} />
          <Route path="controls/reconciliations" element={<TabbedHub hub={CONTROLS_HUB}><ReconciliationsPage /></TabbedHub>} />
          <Route path="controls/reconciliations/:runId" element={<ReconciliationPage />} />
          <Route path="controls/exceptions" element={<TabbedHub hub={CONTROLS_HUB}><ExceptionsPage /></TabbedHub>} />
          <Route path="benefits/employers" element={<EmployersPage />} />
          <Route path="benefits/employers/:customerId" element={<EmployerPage />} />
          <Route path="funds" element={<FundsPage />} />
          <Route path="funds/:fundId" element={<FundPage />} />
          <Route path="investments" element={<InvestmentsPage />} />
          <Route path="investments/:portfolioId" element={<PortfolioPage />} />
          <Route path="transfers" element={<TransfersPage />} />
          <Route path="transfers/:transferId" element={<TransferPage />} />
          <Route path="cells" element={<CellsPage />} />
          <Route path="cells/:cellId" element={<CellPage />} />
          <Route path="governance" element={<GovernancePage />} />
          <Route path="governance/packs/:packId" element={<PackPage />} />
          <Route path="investigations" element={<InvestigationsPage />} />
          <Route path="investigations/:investigationId" element={<InvestigationPage />} />
          <Route path="executive" element={<RequireRole roles={['manager', 'admin']} area="The executive dashboard"><ExecutivePage /></RequireRole>} />
          <Route path="compliance" element={<CompliancePage />} />
          <Route path="settings/team" element={<TabbedHub hub={SETTINGS_HUB}><TeamPage /></TabbedHub>} />
          <Route path="settings/insurers" element={<TabbedHub hub={SETTINGS_HUB}><InsurersPage /></TabbedHub>} />
          <Route path="imports/client-book" element={<TabbedHub hub={SETTINGS_HUB}><ClientBookImportsPage /></TabbedHub>} />
          <Route path="imports/client-book/:batchId" element={<ClientBookImportPage />} />
          <Route path="systems" element={systems} />
          <Route path="systems/database" element={systems} />
          <Route path="systems/frontend" element={systems} />
          <Route path="systems/backend" element={systems} />
          <Route path="systems/integrations" element={systems} />
          <Route path="systems/agents" element={systems} />
          <Route path="systems/workflows" element={systems} />
          <Route path="systems/audit" element={systems} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
