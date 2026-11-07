import { Link } from 'react-router-dom'
import { CalendarClock, FileStack, Loader2, Search } from 'lucide-react'
import type { TwinWorkspace } from '@/api/client'
import { useApprovals, useStartInvestigation } from '@/api/hooks'
import { SimulatedBadge } from '@/components/SimulatedBadge'
import { StatusBadge, humanise } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { formatDate, formatDateTime } from '@/lib/utils'
import { ApprovalCard } from '../../ApprovalCard'
import { JobControls } from '../../JobControls'
import { TaskList } from '../ClientDetailPage'
import { Card, InlineError } from './shared'

export function ActionsTab({ w }: { w: TwinWorkspace }) {
  const investigate = useStartInvestigation()
  const { data: approvals = [] } = useApprovals(['pending'])
  const id = w.business.profile.id
  const mine = approvals.filter((a) => a.risk?.profile_id === id || a.submission?.profile_id === id)
  const runningUnder = w.investigations.find((i) => i.kind === 'underinsurance' && !['completed', 'failed', 'cancelled'].includes(i.status))
  const renewals = w.policies.filter((p) => p.renewal_date)

  return (
    <div className="space-y-4">
      {mine.length > 0 && (
        <Card title={`Broker approvals (${mine.length})`} description="Each request is pinned to the exact findings or pack it was raised for.">
          <div className="space-y-3">
            {mine.map((a) => (
              <ApprovalCard key={a.approval.id} view={a} compact />
            ))}
          </div>
        </Card>
      )}

      <Card
        title="Agent investigations"
        description="Each investigation runs as a job: it gathers records and policy evidence, prepares findings, creates proposed actions and waits for your review."
        action={
          runningUnder ? (
            <Button size="sm" variant="outline" asChild>
              <Link to={`/broker/jobs/${runningUnder.id}`}>
                <Loader2 className="animate-spin" /> Underinsurance investigation running
              </Link>
            </Button>
          ) : (
            <Button size="sm" variant="accent" onClick={() => investigate.mutate({ profile_id: id, kind: 'underinsurance' })} disabled={investigate.isPending}>
              <Search /> Investigate possible underinsurance
            </Button>
          )
        }
      >
        <InlineError error={investigate.error} />
        {w.investigations.length ? (
          <ul className="space-y-3">
            {w.investigations.map((i) => (
              <li key={i.id} className="rounded-xl border border-navy-800/10 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link to={`/broker/jobs/${i.id}`} className="text-sm font-semibold text-navy-900 hover:text-brand-600">
                    {i.kind === 'underinsurance' ? 'Possible underinsurance' : `Exposure: ${i.exposure_title ?? 'selected exposure'}`}
                  </Link>
                  <StatusBadge status={i.status} />
                </div>
                <p className="text-xs text-navy-600">
                  {formatDateTime(i.created_at)} · {i.steps_done}/{i.steps_total} steps{i.current_step ? ` · ${i.current_step}` : ''}
                </p>
                {i.findings.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs text-navy-700">
                    {i.findings.map((f) => (
                      <li key={f.title}>
                        <strong className="text-navy-900">{f.title}:</strong> {f.detail}
                        {f.page_ref ? ` (${f.page_ref})` : ''}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-2">
                  <JobControls job={i} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-navy-600">No investigations yet. Start one here, from a finding, or ask the Copilot.</p>
        )}
      </Card>

      <Card title="Tasks and document requests">
        <TaskList data={w.business} />
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Underwriting submissions">
          {w.business.submissions.length ? (
            <ul className="divide-y divide-navy-800/5">
              {w.business.submissions.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 py-2">
                  <Link to={`/broker/commercial/submissions/${s.id}`} className="flex items-center gap-2 text-sm font-medium text-navy-900 hover:text-brand-600">
                    <FileStack className="h-4 w-4 text-brand-600" /> {s.pack?.sections.length ?? 0} sections · {s.completeness}% complete
                  </Link>
                  <span className="flex items-center gap-2">
                    <SimulatedBadge label="Not sent" />
                    <StatusBadge status={s.status} />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-navy-600">No submission pack yet. Ask the Copilot to review the business to draft one.</p>
          )}
        </Card>
        <Card title="Renewal">
          <p className="flex items-center gap-2 text-sm text-navy-800">
            <CalendarClock className="h-4 w-4 text-brand-600" />
            {renewals.length
              ? renewals.map((p) => `${p.insurer} ${p.policy_number ?? ''} renews ${formatDate(p.renewal_date)}`).join(' · ')
              : w.business.profile.existing_cover?.renewal_month
                ? `Declared renewal month: ${w.business.profile.existing_cover.renewal_month} (no schedule on file)`
                : 'Renewal date not recorded'}
          </p>
          <p className="mt-1 text-xs text-navy-600">Run an annual renewal assessment from the Assessment tab, then compare against it at the next renewal.</p>
        </Card>
      </div>

      <Card title="Job activity">
        {w.business.jobs.length ? (
          <ul className="divide-y divide-navy-800/5">
            {w.business.jobs.map((j) => (
              <li key={j.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link to={`/broker/jobs/${j.id}`} className="min-w-0 text-sm text-navy-900 hover:text-brand-600">
                  <span className="font-medium">{j.title}</span>
                  <span className="block text-xs text-navy-600">
                    {formatDateTime(j.created_at)} · {j.steps_done}/{j.steps_total} steps · {humanise(j.workflow_type)}
                  </span>
                </Link>
                <StatusBadge status={j.status} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-navy-600">No jobs yet.</p>
        )}
      </Card>
    </div>
  )
}
