import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, X } from 'lucide-react'
import type { ApprovalView } from '@/api/client'
import { useApprovals } from '@/api/hooks'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ApprovalCard, type Decision } from './ApprovalCard'
import { EmptyState, ErrorState, LoadingState, PageHeader } from './PageHeader'

interface Outcome {
  title: string
  detail: string
  link?: { to: string; label: string }
}

function describeOutcome(view: ApprovalView, decision: Decision): Outcome {
  const who = view.customer?.full_name ?? 'the customer'
  const submissionId = view.submission?.submission.id
  if (decision !== 'approved') {
    return {
      title: decision === 'rejected' ? 'Rejected and recorded' : 'Changes requested',
      detail: `${view.approval.summary}. Nothing was released to ${who}; your note is on the audit trail.`,
      link: view.job ? { to: `/broker/jobs/${view.job.id}`, label: 'Open the job' } : undefined,
    }
  }
  if (view.risk) {
    return view.risk.kind === 'assessment'
      ? {
          title: 'Assessment signed off',
          detail: `The findings for ${view.risk.business_name} are now broker-approved conclusions and the baseline for the next comparison. No cover has been confirmed by this decision.`,
          link: view.risk.assessment_id ? { to: `/broker/commercial/assessments/${view.risk.assessment_id}/report`, label: 'Open the Business Risk Review report' } : undefined,
        }
      : {
          title: 'Investigation reviewed',
          detail: `The findings for ${view.risk.business_name} are recorded. The proposed actions stay open as tasks.`,
          link: { to: `/broker/commercial/risk-twins/${view.risk.profile_id}?tab=actions`, label: 'Open the Twin workspace' },
        }
  }
  if (view.approval.approval_type === 'underwriting_submission') {
    return {
      title: 'Pack approved and marked ready for market',
      detail: `Nothing has been sent to an insurer. ${who} now sees the review status and outstanding document requests in the business portal.`,
      link: submissionId ? { to: `/broker/commercial/submissions/${submissionId}`, label: 'Open the submission' } : undefined,
    }
  }
  return {
    title: 'Approved and released',
    detail: `The proposal is now in ${who}’s customer portal with an in-app notice. Use “Demo as …” to switch to ${who} and see it.`,
    link: view.job ? { to: `/broker/jobs/${view.job.id}`, label: 'Open the job' } : undefined,
  }
}

export default function ApprovalsPage() {
  const [tab, setTab] = useState('pending')
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const pending = useApprovals(['pending'])
  const decided = useApprovals(['approved', 'rejected', 'changes_requested', 'cancelled'])

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <PageHeader
        title="Approvals"
        description="Regulated or consequential actions wait here for a licensed person. Agents cannot approve, and the backend re-checks every approval before acting."
      />
      {outcome && (
        <div role="status" className="panel mb-5 flex items-start gap-3 border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{outcome.title}</p>
            <p className="mt-0.5 text-xs text-emerald-800">{outcome.detail}</p>
            <div className="mt-2 flex flex-wrap gap-3 text-xs font-semibold">
              {outcome.link && (
                <Link to={outcome.link.to} className="text-emerald-800 underline-offset-2 hover:underline">
                  {outcome.link.label}
                </Link>
              )}
              <button type="button" onClick={() => setTab('decided')} className="cursor-pointer text-emerald-800 underline-offset-2 hover:underline">
                See decided approvals
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOutcome(null)}
            aria-label="Dismiss"
            className="cursor-pointer rounded-md p-1 text-emerald-700 hover:bg-emerald-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="pending">Pending ({pending.data?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="decided">Decided ({decided.data?.length ?? 0})</TabsTrigger>
        </TabsList>
        <TabsContent value="pending" className="mt-5 space-y-5">
          {pending.isLoading && <LoadingState />}
          {pending.error && <ErrorState message={pending.error.message} />}
          {pending.data?.length === 0 && (
            <EmptyState title="Nothing is waiting for approval">Run Scenario 1 in Demo Studio, or ask the Copilot to create a comparison.</EmptyState>
          )}
          {pending.data?.map((v) => (
            <ApprovalCard key={v.approval.id} view={v} onDecided={(view, decision) => setOutcome(describeOutcome(view, decision))} />
          ))}
        </TabsContent>
        <TabsContent value="decided" className="mt-5 space-y-5">
          {decided.data?.length === 0 && <EmptyState title="No decisions yet" />}
          {decided.data?.map((v) => <ApprovalCard key={v.approval.id} view={v} compact />)}
        </TabsContent>
      </Tabs>
    </div>
  )
}
