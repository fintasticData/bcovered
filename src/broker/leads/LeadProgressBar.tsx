import { useState, type ComponentType } from 'react'
import {
  AlertTriangle,
  Calculator,
  Check,
  ClipboardCheck,
  Flag,
  Handshake,
  Minus,
  Phone,
  Send,
  ShieldCheck,
  CircleStop,
} from 'lucide-react'
import { LEAD_PIPELINE_STAGES, type LeadStatus } from '@/server/db/schema'
import { humanise } from '@/components/StatusBadge'
import { cn } from '@/lib/utils'

const STAGE_LABEL: Record<Exclude<LeadStatus, 'closed'>, string> = {
  lead: 'Lead',
  contacted: 'Contacted',
  qualified: 'Qualified',
  quoting: 'Quoting',
  offer_sent: 'Offer sent',
  accepted: 'Accepted',
  live: 'Live',
}

const STAGE_ICON: Record<Exclude<LeadStatus, 'closed'>, ComponentType<{ className?: string }>> = {
  lead: Flag,
  contacted: Phone,
  qualified: ClipboardCheck,
  quoting: Calculator,
  offer_sent: Send,
  accepted: Handshake,
  live: ShieldCheck,
}

/** Completed teal · current pale gold · Live green · Closed charcoal · issue red */
const TEAL_BG = 'bg-[#0F766E]'
const GOLD_FILL = 'bg-[#FEF3C7] text-[#78350F] ring-[#F59E0B]/60'
const LIVE_SOLID = 'bg-[#15803D] text-white ring-[#15803D]'
const LIVE_OUTLINE = 'bg-white text-[#15803D] ring-[#15803D]'
const CLOSED = 'bg-[#334155] text-white ring-[#334155]/50'
const ISSUE = 'text-[#B91C1C]'

export function stageIndex(status: LeadStatus, closedAtStage?: string | null): number {
  if (status === 'closed') {
    const i = LEAD_PIPELINE_STAGES.indexOf((closedAtStage as (typeof LEAD_PIPELINE_STAGES)[number]) ?? 'lead')
    return i >= 0 ? i : 0
  }
  const i = LEAD_PIPELINE_STAGES.indexOf(status as (typeof LEAD_PIPELINE_STAGES)[number])
  return i >= 0 ? i : 0
}

export function stageLabel(status: LeadStatus, closedReason?: string | null, closedAtStage?: string | null): string {
  if (status === 'closed') {
    const stopped = closedAtStage ? STAGE_LABEL[closedAtStage as keyof typeof STAGE_LABEL] ?? humanise(closedAtStage) : 'Lead'
    const reason = closedReason?.trim() || 'Closed'
    return `Closed · ${reason} · stopped at ${stopped}`
  }
  return STAGE_LABEL[status] ?? humanise(status)
}

export function nextPipelineStage(status: LeadStatus): Exclude<LeadStatus, 'closed'> | null {
  const i = LEAD_PIPELINE_STAGES.indexOf(status as (typeof LEAD_PIPELINE_STAGES)[number])
  if (i < 0 || i >= LEAD_PIPELINE_STAGES.length - 1) return null
  return LEAD_PIPELINE_STAGES[i + 1]
}

export function StageChip({
  status,
  closedReason,
  closedAtStage,
  overdue,
  className,
}: {
  status: LeadStatus
  closedReason?: string | null
  closedAtStage?: string | null
  overdue?: boolean
  className?: string
}) {
  const closed = status === 'closed'
  const live = status === 'live'
  const Icon = closed ? CircleStop : STAGE_ICON[status as Exclude<LeadStatus, 'closed'>] ?? Flag
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 truncate rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1',
        closed && CLOSED,
        live && LIVE_SOLID,
        !closed && !live && status === 'accepted' && GOLD_FILL,
        !closed && !live && status !== 'accepted' && 'bg-white text-navy-800 ring-navy-800/15',
        className,
      )}
      title={stageLabel(status, closedReason, closedAtStage)}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      {live ? 'Live' : closed ? `Closed${closedReason?.trim() ? ` · ${closedReason.trim()}` : ''}` : (STAGE_LABEL[status as Exclude<LeadStatus, 'closed'>] ?? humanise(status))}
      {overdue && !closed && !live && (
        <AlertTriangle className={cn('h-3 w-3 shrink-0', ISSUE)} aria-label="Overdue follow-up" />
      )}
    </span>
  )
}

function StageStop({
  stage,
  state,
  compact,
}: {
  stage: Exclude<LeadStatus, 'closed'>
  state: 'done' | 'current' | 'ahead' | 'skipped' | 'finish_goal' | 'finish_live' | 'stopped'
  compact?: boolean
}) {
  const Icon = STAGE_ICON[stage]
  const label = STAGE_LABEL[stage]
  if (compact) {
    return (
      <span
        className={cn(
          'inline-flex h-2 w-2 rounded-sm',
          state === 'current' && 'h-2.5 w-3 rounded-sm bg-[#F59E0B]',
          state === 'done' && TEAL_BG,
          state === 'ahead' && 'bg-navy-200',
          state === 'skipped' && 'bg-transparent ring-1 ring-navy-300',
          state === 'finish_goal' && 'h-2.5 w-2.5 rounded-full bg-white ring-2 ring-[#15803D]',
          state === 'finish_live' && 'h-2.5 w-2.5 rounded-full bg-[#15803D]',
          state === 'stopped' && 'bg-[#334155]',
        )}
        title={label}
      />
    )
  }

  const pill =
    state === 'current'
      ? GOLD_FILL
      : state === 'finish_live'
        ? LIVE_SOLID
        : state === 'finish_goal'
          ? LIVE_OUTLINE
          : state === 'done'
            ? 'bg-[#0F766E]/10 text-[#0F766E] ring-[#0F766E]/25'
            : state === 'stopped'
              ? CLOSED
              : state === 'skipped'
                ? 'bg-transparent text-navy-400 ring-navy-200'
                : 'bg-white text-navy-400 ring-navy-200'

  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ring-1', pill)}
      title={label}
    >
      {state === 'skipped' ? (
        <Minus className="h-3.5 w-3.5" aria-hidden />
      ) : (
        <Icon className="h-4 w-4 shrink-0" aria-hidden />
      )}
      <span className="hidden sm:inline">{label}</span>
      {state === 'done' && <Check className="h-3 w-3 shrink-0 opacity-80" aria-hidden />}
    </span>
  )
}

function stopState(
  i: number,
  currentIdx: number,
  live: boolean,
  closed: boolean,
  finishIdx: number,
): 'done' | 'current' | 'ahead' | 'skipped' | 'finish_goal' | 'finish_live' | 'stopped' {
  const isFinish = i === finishIdx
  if (closed && i === currentIdx) return 'stopped'
  if (live && isFinish) return 'finish_live'
  if (!live && !closed && isFinish) return 'finish_goal'
  if (!closed && !live && i === currentIdx) return 'current'
  if (i < currentIdx || (live && i < finishIdx)) return 'done'
  // Ahead of current but before finish — treat as not done (not skipped unless we had explicit skip data)
  if (i > currentIdx && !isFinish) return 'ahead'
  return 'ahead'
}

/** Compact list + slim detail track. Live finish is green by default; other colours = not ready. */
export function LeadProgressBar({
  status,
  closedReason,
  closedAtStage,
  compact,
  overdue,
}: {
  status: LeadStatus
  closedReason?: string | null
  closedAtStage?: string | null
  compact?: boolean
  overdue?: boolean
}) {
  const currentIdx = stageIndex(status, closedAtStage)
  const live = status === 'live'
  const closed = status === 'closed'
  const label = stageLabel(status, closedReason, closedAtStage)
  const finishIdx = LEAD_PIPELINE_STAGES.length - 1
  const [expanded, setExpanded] = useState(false)

  if (compact) {
    return (
      <div className="flex min-w-[10rem] flex-col gap-1" title={label}>
        <StageChip status={status} closedReason={closedReason} closedAtStage={closedAtStage} overdue={overdue} />
        <div className="flex items-center gap-0.5" aria-hidden>
          {LEAD_PIPELINE_STAGES.map((stage, i) => (
            <StageStop
              key={stage}
              stage={stage}
              compact
              state={stopState(i, currentIdx, live, closed, finishIdx)}
            />
          ))}
        </div>
        <span className="sr-only">{label}</span>
      </div>
    )
  }

  const track = (
    <ol className="flex flex-wrap items-center gap-1.5" aria-label="Opportunity journey">
      {LEAD_PIPELINE_STAGES.map((stage, i) => (
        <li key={stage} className="flex items-center gap-1.5">
          <StageStop stage={stage} state={stopState(i, currentIdx, live, closed, finishIdx)} />
          {i < finishIdx && <span className="hidden h-px w-3 bg-navy-200 sm:block" aria-hidden />}
        </li>
      ))}
      {closed && (
        <li>
          <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ring-1', CLOSED)}>
            <CircleStop className="h-4 w-4" aria-hidden />
            Closed
          </span>
        </li>
      )}
    </ol>
  )

  return (
    <div className="space-y-2" title={label}>
      <div className="flex flex-wrap items-center gap-2">
        <StageChip status={status} closedReason={closedReason} closedAtStage={closedAtStage} overdue={overdue} />
        {overdue && (
          <span className={cn('inline-flex items-center gap-1 text-[11px] font-semibold', ISSUE)}>
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> Overdue follow-up
          </span>
        )}
        <button
          type="button"
          className="cursor-pointer text-[11px] font-semibold text-brand-700 underline sm:hidden"
          onClick={() => setExpanded((e) => !e)}
        >
          {expanded ? 'Hide progress' : 'Expand progress'}
        </button>
      </div>
      <div className={cn(!expanded && 'hidden sm:block')}>{track}</div>
      {live && (
        <p className="text-[11px] font-medium text-[#15803D]">Cover is live — ready end of the journey.</p>
      )}
      {closed && (
        <p className="text-[11px] text-[#334155]">
          Closed{closedReason?.trim() ? ` · ${closedReason.trim()}` : ''}
          {closedAtStage ? ` · stopped at ${STAGE_LABEL[closedAtStage as keyof typeof STAGE_LABEL] ?? closedAtStage}` : ''}.
        </p>
      )}
    </div>
  )
}
