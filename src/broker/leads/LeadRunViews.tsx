// Russ lead search results, shared by the copilot card, the copilot editor pane, the Leads grid run header and the job
// page: honest progress, sourced area findings (kept apart from facts about individual businesses) and saved prospects.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ExternalLink, FlaskConical, Mail } from 'lucide-react'
import { SimulatedBadge } from '@/components/SimulatedBadge'
import { cn } from '@/lib/utils'
import type { AreaFinding, LeadRun, RunLead, RunProgress, StopReason } from '@/lib/leadResearch/api'

export function SampleDataBadge({ className }: { className?: string }) {
  return <SimulatedBadge className={className} label="Sample data" title="Demo fixture: fictional business, email and pages. Not a real prospect." />
}

const STOP_LABEL: Record<StopReason, string> = {
  count_reached: 'Requested number reached',
  budget_exhausted: 'Search budget used up',
  cancelled: 'Cancelled',
  no_more_candidates: 'No more matching businesses found',
  failed: 'Research service failed',
}

const minutes = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.round((ms % 60_000) / 1000)).padStart(2, '0')}`
const hostLabel = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export function RunProgressBar({ progress, stop, running }: { progress: RunProgress; stop: StopReason | null; running: boolean }) {
  const pct = progress.requested ? Math.min(100, Math.round((progress.found / progress.requested) * 100)) : 0
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-semibold text-navy-900">
          {progress.found} of {progress.requested} found with published emails
        </span>
        <span className="text-navy-500">{stop ? STOP_LABEL[stop] : running ? progress.step : 'Paused'}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-navy-100" role="progressbar" aria-valuemin={0} aria-valuemax={progress.requested} aria-valuenow={progress.found}>
        <div className={cn('h-full rounded-full transition-all', stop === 'cancelled' ? 'bg-navy-400' : 'bg-business-500')} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[11px] text-navy-500">
        {progress.candidates_checked ?? 0} businesses checked · {progress.searches_used} searches · {progress.pages_fetched} pages read · ${progress.cost_usd.toFixed(3)} · {minutes(progress.elapsed_ms ?? 0)}
      </p>
    </div>
  )
}

export function AreaFindings({ findings, summary, defaultOpen = true }: { findings: AreaFinding[]; summary?: string | null; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  if (!findings.length && !summary) return null
  return (
    <section className="rounded-lg border border-navy-800/10 bg-white">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-left" aria-expanded={open}>
        <span className="text-xs font-semibold tracking-wide text-navy-700 uppercase">Area summary · {findings.length} sourced finding{findings.length === 1 ? '' : 's'}</span>
        <ChevronDown className={cn('h-4 w-4 text-navy-500 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div className="space-y-2 border-t border-navy-800/10 px-3 py-2.5">
          {summary && <p className="text-sm text-navy-800">{summary}</p>}
          <ol className="space-y-2">
            {findings.map((f, i) => (
              <li key={`${f.source_url}-${i}`} className="text-sm">
                <p className="text-navy-900">{f.finding}</p>
                <p className="text-xs text-navy-600">
                  <span className="font-medium">Why it matters:</span> {f.relevance_to_cover}
                </p>
                <a href={f.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-700 hover:underline">
                  <ExternalLink className="h-3 w-3" aria-hidden /> {hostLabel(f.source_url)}
                  {f.published_on ? ` · published ${f.published_on}` : ' · date not shown'}
                </a>
              </li>
            ))}
          </ol>
          <p className="text-[11px] text-navy-500">Area-wide findings describe the locality, not any individual business below.</p>
        </div>
      )}
    </section>
  )
}

export function RunLeadItem({ lead }: { lead: RunLead }) {
  return (
    <li className="rounded-lg border border-navy-800/10 bg-white px-3 py-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {lead.open_path ? (
          <Link to={lead.open_path} className="text-sm font-semibold text-navy-900 hover:text-brand-700 hover:underline">
            {lead.business_name}
          </Link>
        ) : (
          <span className="text-sm font-semibold text-navy-900">{lead.business_name}</span>
        )}
        {lead.is_sample && <SampleDataBadge />}
      </div>
      <p className="text-xs text-navy-600">
        {lead.area}
        {lead.business_function ? ` · ${lead.business_function}` : ''}
        {lead.address ? ` · ${lead.address}` : ''}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <a href={`mailto:${lead.email}`} className="inline-flex items-center gap-1 font-medium text-navy-900 hover:underline">
          <Mail className="h-3 w-3" aria-hidden /> {lead.email}
        </a>
        <a href={lead.evidence.email_source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-700 hover:underline">
          <ExternalLink className="h-3 w-3" aria-hidden /> Email shown on {hostLabel(lead.evidence.email_source_url)}
        </a>
      </div>
      <p className="mt-1 line-clamp-2 text-xs text-navy-700">{lead.cover_fit}</p>
    </li>
  )
}

export function RejectedList({ rejected }: { rejected: LeadRun['outputs']['rejected'] }) {
  if (!rejected?.length) return null
  return (
    <details className="rounded-lg border border-navy-800/10 bg-white px-3 py-2 text-xs">
      <summary className="cursor-pointer font-medium text-navy-700">{rejected.length} checked and not saved</summary>
      <ul className="mt-1.5 space-y-1">
        {rejected.map((r, i) => (
          <li key={`${r.business_name}-${i}`} className="text-navy-600">
            <span className="font-medium text-navy-800">{r.business_name}</span>: {r.reason}
            {r.url && (
              <a href={r.url} target="_blank" rel="noreferrer" className="ml-1 text-brand-700 hover:underline">
                {hostLabel(r.url)}
              </a>
            )}
          </li>
        ))}
      </ul>
    </details>
  )
}

export function FilterChips({ filters }: { filters: LeadRun['inputs']['filters'] }) {
  const chips: Array<[string, string | number | null]> = [
    ['Area', filters.area],
    ['Radius', filters.radius_km ? `${filters.radius_km} km` : null],
    ['Function', filters.business_function],
    ['Category', filters.category],
    ['Industry', filters.industry],
    ['Cover', filters.cover_type],
    ['Count', filters.requested_count],
  ]
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips
        .filter(([, v]) => v !== null && v !== '')
        .map(([k, v]) => (
          <span key={k} className="rounded-full border border-navy-800/10 bg-navy-50 px-2 py-0.5 text-[11px] text-navy-700">
            <span className="text-navy-500">{k}:</span> {v}
          </span>
        ))}
    </div>
  )
}

/** Full results for the editor pane and the job page. */
export function LeadRunDetails({ run }: { run: LeadRun }) {
  const anySample = run.leads.some((l) => l.is_sample)
  return (
    <div className="space-y-3">
      <FilterChips filters={run.inputs.filters} />
      <RunProgressBar progress={run.outputs.progress} stop={run.outputs.stop_reason} running={run.status === 'running'} />
      {run.outputs.summary && <p className="text-sm font-medium text-navy-900">{run.outputs.summary}</p>}
      {anySample && (
        <p className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <FlaskConical className="h-3.5 w-3.5" aria-hidden /> Sample data: these are demo fixtures with fictional businesses and pages.
        </p>
      )}
      <AreaFindings findings={run.outputs.area_findings ?? []} summary={run.outputs.area_summary} />
      {run.leads.length > 0 ? (
        <ul className="space-y-2">
          {run.leads.map((l) => (
            <RunLeadItem key={l.match_id} lead={l} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-navy-600">No businesses saved yet.</p>
      )}
      <RejectedList rejected={run.outputs.rejected} />
    </div>
  )
}
