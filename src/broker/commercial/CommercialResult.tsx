import { Link } from 'react-router-dom'
import { ArrowRight, Building2, FileStack } from 'lucide-react'
import { useApprovals, useCommercialClient, useCommercialClients, useJob, useSubmissions } from '@/api/hooks'
import { ExecutionPlan } from '@/components/ExecutionPlan'
import { PriorityBadge } from '@/components/commercial/badges'
import { SimulatedBadge } from '@/components/SimulatedBadge'
import { StatusBadge, humanise } from '@/components/StatusBadge'
import type { CopilotView } from '@/server/agents/copilotCommands'
import { ApprovalCard } from '../ApprovalCard'
import { EmptyState } from '../PageHeader'

export type CommercialView = Extract<CopilotView, { kind: 'business' | 'businesses' | 'submissions' }>

export const isCommercialView = (v: CopilotView): v is CommercialView => v.kind === 'business' || v.kind === 'businesses' || v.kind === 'submissions'

export function CommercialResult({ view }: { view: CommercialView }) {
  if (view.kind === 'business') return <BusinessReview profileId={view.profile_id} jobId={view.job_id} />
  if (view.kind === 'businesses') return <ClientList ids={view.profile_ids} />
  return <SubmissionList ids={view.submission_ids} />
}

function BusinessReview({ profileId, jobId }: { profileId: string; jobId: string | null }) {
  const { data } = useCommercialClient(profileId)
  const { data: job } = useJob(jobId)
  const { data: pending = [] } = useApprovals(['pending'])
  if (!data) return null
  const approval = pending.find((a) => a.submission?.profile_id === profileId)
  const sub = data.submissions[0]
  const high = data.exposures.filter((e) => e.priority === 'high')
  const questions = [...new Set(data.exposures.flatMap((e) => e.outstanding_questions))]
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-navy-800/10 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <Link to={`/broker/commercial/clients/${profileId}`} className="text-sm font-semibold text-navy-900 hover:text-brand-600">
              {data.profile.trading_name ?? data.profile.registered_name}
            </Link>
            <p className="text-xs text-navy-600">
              {data.industry.name} · {data.locations.length} location{data.locations.length === 1 ? '' : 's'} · {data.assets.length} assets
            </p>
          </div>
          {job && <StatusBadge status={job.job.status} />}
        </div>
        {job && (
          <div className="mt-3">
            <ExecutionPlan steps={job.steps} />
          </div>
        )}
      </div>

      {data.exposures.length > 0 && (
        <div className="rounded-xl border border-navy-800/10 p-4">
          <p className="text-sm font-semibold text-navy-900">
            {data.exposures.length} potential exposures · {high.length} high advisory priority
          </p>
          <ul className="mt-2 space-y-1.5">
            {data.exposures.slice(0, 6).map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate text-navy-800">{e.title}</span>
                <PriorityBadge priority={e.priority} />
              </li>
            ))}
          </ul>
          {questions.length > 0 && (
            <>
              <p className="mt-4 text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Outstanding insurance questions</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-navy-700">
                {questions.slice(0, 8).map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </>
          )}
          <Link to={`/broker/commercial/clients/${profileId}`} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-600">
            Open the Risk Twin and all exposures <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      )}

      {sub && (
        <Link
          to={`/broker/commercial/submissions/${sub.id}`}
          className="flex items-center justify-between gap-3 rounded-xl border border-navy-800/10 p-4 transition hover:border-brand-500/40"
        >
          <span className="flex items-center gap-3">
            <FileStack className="h-5 w-5 text-brand-600" />
            <span>
              <span className="block text-sm font-semibold text-navy-900">Draft submission pack</span>
              <span className="block text-xs text-navy-600">
                {humanise(sub.status)} · {sub.completeness}% complete · {sub.pack?.sections.length ?? 0} sections
              </span>
            </span>
          </span>
          <SimulatedBadge label="Not sent" />
        </Link>
      )}
      {approval && <ApprovalCard view={approval} compact />}
    </div>
  )
}

function ClientList({ ids }: { ids: string[] }) {
  const { data = [] } = useCommercialClients()
  const rows = data.filter((r) => ids.includes(r.profile.id))
  if (!rows.length) return <EmptyState title="No commercial clients yet">Run the Restaurant Group scenario in Demo Studio.</EmptyState>
  return (
    <ul className="divide-y divide-navy-800/5">
      {rows.map((r) => (
        <li key={r.profile.id} className="flex items-center justify-between gap-3 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <Building2 className="h-4 w-4 shrink-0 text-brand-600" />
            <div className="min-w-0">
              <Link to={`/broker/commercial/clients/${r.profile.id}`} className="text-sm font-medium text-navy-900 hover:text-brand-600">
                {r.profile.trading_name ?? r.profile.registered_name}
              </Link>
              <p className="truncate text-xs text-navy-600">
                {r.industry_name} · {r.location_count} locations · {r.exposure_count ? `${r.exposure_count} exposures` : 'no Risk Twin yet'}
              </p>
            </div>
          </div>
          <StatusBadge status={r.profile.status} />
        </li>
      ))}
    </ul>
  )
}

function SubmissionList({ ids }: { ids: string[] }) {
  const { data = [] } = useSubmissions()
  const rows = data.filter((r) => ids.includes(r.submission.id))
  if (!rows.length) return <EmptyState title="No submission packs yet">Ask the Copilot to review a business.</EmptyState>
  return (
    <ul className="divide-y divide-navy-800/5">
      {rows.map((r) => (
        <li key={r.submission.id} className="flex items-center justify-between gap-3 py-3">
          <div className="min-w-0">
            <Link to={`/broker/commercial/submissions/${r.submission.id}`} className="text-sm font-medium text-navy-900 hover:text-brand-600">
              {r.business_name}
            </Link>
            <p className="truncate text-xs text-navy-600">
              {r.section_count} sections · {r.submission.completeness}% complete {r.pending_approval && '· approval pending'}
            </p>
          </div>
          <StatusBadge status={r.submission.status} />
        </li>
      ))}
    </ul>
  )
}
