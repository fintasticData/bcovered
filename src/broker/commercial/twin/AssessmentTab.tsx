import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, FileText, Loader2, Network, Play, Search, Sparkles } from 'lucide-react'
import type { TwinWorkspace } from '@/api/client'
import { useApprovals, useDecideFinding, useGatherMissing, useJob, useOverridePriority, useStartAssessment, useStartInvestigation } from '@/api/hooks'
import { AdviceNotice, AssessmentPriorityBadge, CoverageBadge, ProvenanceBadge } from '@/components/commercial/badges'
import { ExposureCard } from '@/components/commercial/ExposureCard'
import { ExecutionPlan } from '@/components/ExecutionPlan'
import { StatusBadge, humanise } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { cn, formatDate, formatDateTime } from '@/lib/utils'
import type { AssessmentPriority, AssessmentType, RiskAssessmentFinding } from '@/server/db/commercialSchema'
import { ApprovalCard } from '../../ApprovalCard'
import { Card, CompletenessBadge, FactBasisBadge, InlineError } from './shared'

const PRIORITIES: AssessmentPriority[] = ['critical', 'high', 'medium', 'low', 'unassessed']

export function AssessmentTab({ w, onShowNode }: { w: TwinWorkspace; onShowNode: (table: 'risk_exposures', id: string) => void }) {
  const formal = w.assessment && w.assessment.status !== 'draft' ? w.assessment : null
  const runningJob = w.assessment_jobs.find((j) => !['completed', 'failed', 'cancelled'].includes(j.status)) ?? null
  const { data: approvals = [] } = useApprovals(['pending'])
  const signoff = approvals.find((a) => a.risk?.kind === 'assessment' && a.risk.profile_id === w.business.profile.id)
  const top = w.findings.filter((f) => f.is_priority_area)
  const rest = w.findings.filter((f) => !f.is_priority_area)

  return (
    <div className="space-y-4">
      <RunAssessment w={w} runningJobId={runningJob?.id ?? null} />
      <Completeness w={w} />
      {signoff && <ApprovalCard view={signoff} />}

      {formal ? (
        <>
          <Card
            title={`${w.assessment_type_labels[formal.assessment_type]} · ${humanise(formal.status)}`}
            description={`Opened ${formatDateTime(formal.created_at)}${formal.next_review_date ? ` · next review by ${formatDate(formal.next_review_date)}` : ''}`}
            action={
              <Button size="sm" variant="outline" asChild>
                <Link to={`/broker/commercial/assessments/${formal.id}/report`}>
                  <FileText /> Business Risk Review report
                </Link>
              </Button>
            }
          >
            {formal.summary && <p className="text-sm text-navy-800">{formal.summary}</p>}
            {formal.scope.length > 0 && <p className="mt-1 text-xs text-navy-600">Scope: {formal.scope.join(' · ')}</p>}
          </Card>
          <Card
            title={`The ${top.length} most important areas requiring review`}
            description="Ranked by explained qualitative factors. A review order for the broker, not an actuarial score."
          >
            <ol className="space-y-2">
              {top.map((f) => (
                <FindingCard key={f.id} f={f} w={w} locked={['approved', 'superseded'].includes(formal.status)} onShowNode={onShowNode} defaultOpen={f.rank === 1} />
              ))}
            </ol>
          </Card>
          {rest.length > 0 && (
            <Card title={`Other findings (${rest.length})`}>
              <ol className="space-y-2">
                {rest.map((f) => (
                  <FindingCard key={f.id} f={f} w={w} locked={['approved', 'superseded'].includes(formal.status)} onShowNode={onShowNode} />
                ))}
              </ol>
            </Card>
          )}
        </>
      ) : (
        <Card
          title={w.business.exposures.length ? `Exposure screening: ${w.business.exposures.length} potential exposures` : 'No exposures identified yet'}
          description="The Twin build identified these from the industry template. Run an assessment to prioritise them, check policy evidence and request sign-off."
        >
          <div className="space-y-2">
            {w.business.exposures.map((e) => (
              <ExposureCard key={e.id} exposure={e} brokerName={w.business.assigned_broker} locationNames={Object.fromEntries(w.business.locations.map((l) => [l.id, l.suburb ?? l.name]))} />
            ))}
          </div>
        </Card>
      )}
      <AdviceNotice />
    </div>
  )
}

function RunAssessment({ w, runningJobId }: { w: TwinWorkspace; runningJobId: string | null }) {
  const [type, setType] = useState<AssessmentType>(w.assessments.some((a) => a.status === 'approved') ? 'annual_renewal' : 'initial')
  const start = useStartAssessment()
  const { data: job } = useJob(runningJobId)
  return (
    <Card
      title="Assessment"
      description="The agents load the Twin, apply the industry template, check insurance evidence, prioritise findings with reasons and hold them for your sign-off."
      action={
        <>
          <label className="sr-only" htmlFor="assessment-type">
            Assessment type
          </label>
          <select id="assessment-type" className="field h-8 py-0 text-xs" value={type} onChange={(e) => setType(e.target.value as AssessmentType)} disabled={Boolean(runningJobId)}>
            {(Object.keys(w.assessment_type_labels) as AssessmentType[]).map((k) => (
              <option key={k} value={k}>
                {w.assessment_type_labels[k]}
              </option>
            ))}
          </select>
          <Button size="sm" variant="accent" onClick={() => start.mutate({ profile_id: w.business.profile.id, assessment_type: type })} disabled={start.isPending || Boolean(runningJobId)}>
            {start.isPending ? <Loader2 className="animate-spin" /> : <Play />} Run assessment
          </Button>
        </>
      }
    >
      <InlineError error={start.error} />
      {job ? (
        <div>
          <p className="mb-2 flex items-center gap-2 text-xs text-navy-600">
            {job.job.title} <StatusBadge status={job.job.status} />
            <Link to={`/broker/jobs/${job.job.id}`} className="font-semibold text-brand-600">
              Job record
            </Link>
          </p>
          <ExecutionPlan steps={job.steps} />
        </div>
      ) : (
        <p className="text-xs text-navy-600">
          {w.assessments.filter((a) => a.status !== 'draft').length
            ? `${w.assessments.filter((a) => a.status !== 'draft').length} assessment${w.assessments.filter((a) => a.status !== 'draft').length === 1 ? '' : 's'} on record. Previous ones stay available as evidence.`
            : 'No formal assessment yet.'}
        </p>
      )}
    </Card>
  )
}

function Completeness({ w }: { w: TwinWorkspace }) {
  const gather = useGatherMissing()
  const [open, setOpen] = useState<string | null>(null)
  const gaps = w.completeness.filter((c) => c.missing.length && c.key !== 'broker_review').length
  return (
    <Card
      title="Assessment completeness"
      description="How complete the information is. A data-completeness measure, not an insurance risk score."
      action={
        gaps > 0 && (
          <Button size="sm" variant="outline" onClick={() => gather.mutate(w.business.profile.id)} disabled={gather.isPending || !w.business.risk_profile}>
            {gather.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />} Ask the agents to gather missing information
          </Button>
        )
      }
    >
      {gather.data && <p className="mb-2 text-xs text-emerald-700">{gather.data.created ? `${gather.data.created} new requests and tasks created.` : 'Every missing item already has an open request.'}</p>}
      <InlineError error={gather.error} />
      <ul className="divide-y divide-navy-800/5">
        {w.completeness.map((c) => (
          <li key={c.key} className="py-2">
            <button
              type="button"
              className="flex w-full cursor-pointer items-center justify-between gap-3 text-left text-sm disabled:cursor-default"
              onClick={() => setOpen((o) => (o === c.key ? null : c.key))}
              aria-expanded={open === c.key}
              disabled={!c.missing.length}
            >
              <span className="font-medium text-navy-900">{c.label}</span>
              <span className="flex items-center gap-2">
                <CompletenessBadge status={c.status} />
                {c.missing.length > 0 && <ChevronDown className={cn('h-4 w-4 text-navy-500 transition', open === c.key && 'rotate-180')} />}
              </span>
            </button>
            {open === c.key && (
              <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-xs text-navy-700">
                {c.missing.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </Card>
  )
}

function FindingCard({
  f,
  w,
  locked,
  onShowNode,
  defaultOpen = false,
}: {
  f: RiskAssessmentFinding
  w: TwinWorkspace
  locked: boolean
  onShowNode: (table: 'risk_exposures', id: string) => void
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [note, setNote] = useState('')
  const [override, setOverride] = useState<AssessmentPriority>(f.priority)
  const decide = useDecideFinding()
  const overridePriority = useOverridePriority()
  const investigate = useStartInvestigation()
  const running = w.investigations.find((i) => i.kind === 'exposure' && (i.inputs as { exposure_id?: string }).exposure_id === f.exposure_id && !['completed', 'failed', 'cancelled'].includes(i.status))

  return (
    <li className={cn('rounded-xl border bg-white', f.priority === 'critical' ? 'border-red-300' : 'border-navy-800/10')}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full cursor-pointer items-start justify-between gap-3 px-4 py-3 text-left">
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-navy-900">
            {f.rank}. {f.title}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            <AssessmentPriorityBadge priority={f.priority} />
            <CoverageBadge status={f.coverage.status} />
            <FactBasisBadge basis={f.fact_basis} />
            {f.status !== 'proposed' && <StatusBadge status={f.status} />}
          </span>
        </span>
        <ChevronDown className={cn('mt-1 h-4 w-4 shrink-0 text-navy-500 transition', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="space-y-3 border-t border-navy-800/5 px-4 py-3 text-sm">
          <div>
            <p className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Why this priority</p>
            <ul className="mt-1 space-y-0.5 text-xs text-navy-700">
              {f.rationale.map((r) => (
                <li key={r} className="flex gap-1.5">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-navy-300" /> {r}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Insurance evidence</p>
            <p className="mt-1 text-xs text-navy-700">{f.coverage.note}</p>
            {f.coverage.sections.length > 0 && <p className="mt-0.5 text-xs text-navy-600">Sections: {f.coverage.sections.join(', ')}</p>}
          </div>
          {f.evidence.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Evidence</p>
              <ul className="mt-1 space-y-1">
                {f.evidence.map((ev, i) => (
                  <li key={`${ev.label}-${i}`} className="flex flex-wrap items-center gap-2 text-xs text-navy-700">
                    <ProvenanceBadge source={ev.source} /> {ev.label}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {f.outstanding.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Outstanding information</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-navy-700">
                {f.outstanding.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </div>
          )}
          {f.broker_note && <p className="text-xs text-navy-700">Broker note: “{f.broker_note}”</p>}

          <div className="flex flex-wrap gap-2">
            {f.exposure_id && (
              <Button size="sm" variant="outline" onClick={() => onShowNode('risk_exposures', f.exposure_id!)}>
                <Network /> Show on graph
              </Button>
            )}
            {f.exposure_id &&
              (running ? (
                <Button size="sm" variant="outline" asChild>
                  <Link to={`/broker/jobs/${running.id}`}>
                    <Loader2 className="animate-spin" /> Investigation running
                  </Link>
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => investigate.mutate({ profile_id: w.business.profile.id, kind: 'exposure', exposure_id: f.exposure_id! })} disabled={investigate.isPending}>
                  <Search /> Investigate
                </Button>
              ))}
          </div>
          <InlineError error={investigate.error} />

          {!locked && (
            <div className="space-y-2 rounded-xl border border-navy-800/10 bg-mist/60 p-3">
              <label className="block text-xs">
                <span className="field-label">Broker note (required to reject or override)</span>
                <input className="field mt-1 py-2" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Cold rooms have a second compressor on standby" />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="accent" onClick={() => decide.mutate({ finding_id: f.id, status: 'accepted', note: note || null })} disabled={decide.isPending}>
                  Accept finding
                </Button>
                <Button size="sm" variant="ghost" className="text-red-700 hover:bg-red-50" onClick={() => decide.mutate({ finding_id: f.id, status: 'rejected', note })} disabled={decide.isPending}>
                  Reject
                </Button>
                <span className="mx-1 h-5 w-px bg-navy-800/10" aria-hidden />
                <label className="sr-only" htmlFor={`override-${f.id}`}>
                  Override priority
                </label>
                <select id={`override-${f.id}`} className="field h-8 py-0 text-xs" value={override} onChange={(e) => setOverride(e.target.value as AssessmentPriority)}>
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {humanise(p)}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => f.exposure_id && overridePriority.mutate({ exposure_id: f.exposure_id, priority: override, reason: note })}
                  disabled={overridePriority.isPending || override === f.priority || !f.exposure_id}
                >
                  Override priority
                </Button>
              </div>
              <InlineError error={decide.error ?? overridePriority.error} />
              <p className="text-[11px] text-navy-600">Changes are recorded with your name. A pending sign-off is re-pinned to the updated findings.</p>
            </div>
          )}
        </div>
      )}
    </li>
  )
}
