import { lazy, Suspense, useEffect } from 'react'
import { Outlet, Route, Routes, useLocation } from 'react-router-dom'
import Header from './components/Header'
import Footer from './components/Footer'
import { RequireRole } from './components/RequireRole'
import HomePage from './pages/HomePage'
import NotFound from './pages/NotFound'
import { LoadingState } from './broker/PageHeader'

const ProductPage = lazy(() => import('./pages/ProductPage'))
const QuotePage = lazy(() => import('./pages/QuotePage'))
const ClaimsPage = lazy(() => import('./pages/ClaimsPage'))
const AboutPage = lazy(() => import('./pages/AboutPage'))
const ContactPage = lazy(() => import('./pages/ContactPage'))
const LegalPage = lazy(() => import('./pages/LegalPage'))
const AssistPage = lazy(() => import('./pages/AssistPage'))
const DemoStudioPage = lazy(() => import('./pages/DemoStudioPage'))
const PortalPage = lazy(() => import('./pages/portal/PortalPage'))
const PortalProposalPage = lazy(() => import('./pages/portal/PortalProposalPage'))
const BrokerLayout = lazy(() => import('./broker/BrokerLayout'))
const OverviewPage = lazy(() => import('./broker/OverviewPage'))
const WorkspacePage = lazy(() => import('./broker/WorkspacePage'))
const LeadsPage = lazy(() => import('./broker/LeadsPage'))
const LeadDetailPage = lazy(() => import('./broker/LeadDetailPage'))
const BrokerQuotePage = lazy(() => import('./broker/BrokerQuotePage'))
const ApprovalsPage = lazy(() => import('./broker/ApprovalsPage'))
const JobsPage = lazy(() => import('./broker/JobsPage'))
const JobDetailPage = lazy(() => import('./broker/JobDetailPage'))
const CommercialWorkspacePage = lazy(() => import('./broker/commercial/CommercialWorkspacePage'))
const ClientsPage = lazy(() => import('./broker/commercial/ClientsPage'))
const ClientDetailPage = lazy(() => import('./broker/commercial/ClientDetailPage'))
const RiskTwinsPage = lazy(() => import('./broker/commercial/RiskTwinsPage'))
const SubmissionsPage = lazy(() => import('./broker/commercial/SubmissionsPage'))
const SubmissionPage = lazy(() => import('./broker/commercial/SubmissionPage'))
const BusinessHomePage = lazy(() => import('./pages/business/BusinessHomePage'))
const BusinessIndustriesPage = lazy(() => import('./pages/business/BusinessIndustriesPage'))
const BusinessCoverPage = lazy(() => import('./pages/business/BusinessCoverPage'))
const BusinessRiskReviewPage = lazy(() => import('./pages/business/BusinessRiskReviewPage'))
const PortalBusinessPage = lazy(() => import('./pages/portal/PortalBusinessPage'))
const PortalRiskProfilePage = lazy(() => import('./pages/portal/PortalRiskProfilePage'))

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => window.scrollTo(0, 0), [pathname])
  return null
}

function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="bg-brand-900 py-1.5 text-center text-xs text-brand-100">
        InsureFlow AI demo · BCovered is a fictional brokerage. All people, insurers and figures are synthetic.
      </div>
      <Header />
      <main className="flex-1">
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
          <Route path="/legal" element={<LegalPage />} />
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
            path="/portal/proposals/:quoteId"
            element={
              <RequireRole roles={['customer']} area="The customer portal">
                <PortalProposalPage />
              </RequireRole>
            }
          />
          <Route path="*" element={<NotFound />} />
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
          <Route path="leads" element={<LeadsPage />} />
          <Route path="leads/:leadId" element={<LeadDetailPage />} />
          <Route path="quotes/:quoteId" element={<BrokerQuotePage />} />
          <Route path="approvals" element={<ApprovalsPage />} />
          <Route path="jobs" element={<JobsPage />} />
          <Route path="jobs/:jobId" element={<JobDetailPage />} />
          <Route path="commercial" element={<CommercialWorkspacePage />} />
          <Route path="commercial/clients" element={<ClientsPage />} />
          <Route path="commercial/clients/:profileId" element={<ClientDetailPage />} />
          <Route path="commercial/risk-twins" element={<RiskTwinsPage />} />
          <Route path="commercial/submissions" element={<SubmissionsPage />} />
          <Route path="commercial/submissions/:submissionId" element={<SubmissionPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
