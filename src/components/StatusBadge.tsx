import { Badge, type BadgeProps } from '@/components/ui/badge'

type Tone = NonNullable<BadgeProps['tone']>

const TONES: Record<string, Tone> = {
  queued: 'neutral',
  pending: 'neutral',
  draft: 'neutral',
  new: 'info',
  running: 'info',
  qualifying: 'info',
  comparing: 'info',
  quoting: 'info',
  qualified: 'accent',
  awaiting_approval: 'warning',
  awaiting_information: 'warning',
  proposal_pending: 'warning',
  changes_requested: 'warning',
  paused: 'warning',
  completed: 'success',
  ready_for_market: 'success',
  active: 'success',
  in_review: 'warning',
  discovery: 'info',
  open: 'info',
  approved: 'success',
  released: 'success',
  proposal_released: 'success',
  won: 'success',
  sent: 'success',
  ok: 'success',
  failed: 'danger',
  rejected: 'danger',
  lost: 'danger',
  error: 'danger',
  blocked: 'danger',
  cancelled: 'neutral',
  skipped: 'neutral',
  expired: 'neutral',
}

export const humanise = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge tone={TONES[status] ?? 'neutral'} className={className}>
      {humanise(status)}
    </Badge>
  )
}
