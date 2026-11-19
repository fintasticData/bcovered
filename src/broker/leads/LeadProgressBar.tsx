import { LEAD_PIPELINE_STAGES, type LeadStatus } from '@/server/db/schema'
import { humanise } from '@/components/StatusBadge'

const STAGE_LABEL: Record<Exclude<LeadStatus, 'closed'>, string> = {
  lead: 'Lead',
  contacted: 'Contacted',
  quoting: 'Quoting',
  proposal_released: 'Proposal released',
  accepted: 'Accepted',
  live: 'Live',
}

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
    return `Closed · ${reason} at ${stopped.toLowerCase()}`
  }
  return STAGE_LABEL[status] ?? humanise(status)
}

/** Six-segment opportunity progress; Live uses success fill, Closed fills to the stopped stage. */
export function LeadProgressBar({
  status,
  closedReason,
  closedAtStage,
  compact,
}: {
  status: LeadStatus
  closedReason?: string | null
  closedAtStage?: string | null
  compact?: boolean
}) {
  const filled = stageIndex(status, closedAtStage) + 1
  const live = status === 'live'
  const closed = status === 'closed'
  const label = stageLabel(status, closedReason, closedAtStage)

  return (
    <div className={`flex min-w-[9.5rem] items-center gap-2 ${compact ? '' : ''}`} title={label}>
      <div className="flex gap-0.5" aria-hidden>
        {LEAD_PIPELINE_STAGES.map((stage, i) => {
          const on = i < filled
          return (
            <span
              key={stage}
              className={`h-2 w-2.5 rounded-sm ${
                !on ? 'bg-navy-200' : live ? 'bg-emerald-500' : closed ? 'bg-navy-400' : 'bg-sky-500'
              }`}
            />
          )
        })}
      </div>
      <span className={`truncate text-xs ${closed ? 'text-navy-600' : live ? 'font-medium text-emerald-800' : 'text-navy-800'}`}>
        {label}
      </span>
    </div>
  )
}
