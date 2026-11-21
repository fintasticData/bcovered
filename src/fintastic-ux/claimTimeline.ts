import type { ClaimTimelineStep } from './ActiveStepClaimView'
import { isMotorishIncident } from '@/broker/claims/claimServiceQuotes'

/** Shared claim Fintastic timeline for broker desk + customer My Page (motor vs theft/short-term). */
export function buildClaimTimelineSteps(input: {
  status: string
  incidentAt?: string | null
  nextAction?: string | null
  booked?: boolean
  incidentType?: string | null
  quotesUnlocked?: boolean
  hasQuotes?: boolean
}): ClaimTimelineStep[] {
  if (isMotorishIncident(input.incidentType) || !input.incidentType) {
    return buildMotorTimeline(input)
  }
  return buildShortTermTimeline(input)
}

function buildMotorTimeline(input: {
  status: string
  incidentAt?: string | null
  nextAction?: string | null
  booked?: boolean
}): ClaimTimelineStep[] {
  const status = input.status
  const assessed = !['reported', 'open', 'draft', 'submitted'].includes(status)
  const inRepair =
    ['in_repair', 'authorised', 'settled', 'closed', 'decision_received'].includes(status) ||
    Boolean(input.booked)
  const ready = ['settled', 'closed'].includes(status)

  return [
    {
      id: 'received',
      label: 'Claim received',
      status: 'done',
      dateLabel: input.incidentAt ? new Date(input.incidentAt).toLocaleDateString() : undefined,
    },
    {
      id: 'assessment',
      label: 'Assessment complete',
      status: assessed || inRepair || ready ? 'done' : 'upcoming',
    },
    {
      id: 'booking',
      label: 'Confirm your repair booking',
      status: ready || inRepair ? 'done' : 'active',
      detail: input.nextAction ?? undefined,
      dateLabel: input.booked ? 'Booked' : undefined,
    },
    {
      id: 'repair',
      label: 'Vehicle in repair',
      status: ready ? 'done' : inRepair ? 'active' : 'upcoming',
    },
    {
      id: 'collect',
      label: 'Ready for collection',
      status: ready ? 'done' : 'upcoming',
    },
  ]
}

function buildShortTermTimeline(input: {
  status: string
  incidentAt?: string | null
  nextAction?: string | null
  booked?: boolean
  quotesUnlocked?: boolean
  hasQuotes?: boolean
}): ClaimTimelineStep[] {
  const status = input.status
  const reviewed = !['reported'].includes(status)
  const decided = ['decision_received', 'closed'].includes(status) || Boolean(input.quotesUnlocked)
  const quoting = decided && (Boolean(input.hasQuotes) || Boolean(input.booked))
  const closed = status === 'closed'

  return [
    {
      id: 'received',
      label: 'Claim received',
      status: 'done',
      dateLabel: input.incidentAt ? new Date(input.incidentAt).toLocaleDateString() : undefined,
    },
    {
      id: 'review',
      label: 'Evidence & cover review',
      status: reviewed || decided ? 'done' : 'active',
    },
    {
      id: 'insurer',
      label: 'Insurer decision',
      status: decided ? 'done' : reviewed ? 'active' : 'upcoming',
      detail: decided ? 'Accepted — quotes unlocked' : undefined,
    },
    {
      id: 'secure',
      label: 'Secure & restore',
      status: closed ? 'done' : quoting || input.booked ? 'active' : decided ? 'active' : 'upcoming',
      detail: input.nextAction ?? undefined,
      dateLabel: input.booked ? 'Booked' : undefined,
    },
    {
      id: 'settle',
      label: 'Settle claim',
      status: closed ? 'done' : 'upcoming',
    },
  ]
}

/** After demo booking confirm, advance booking → repair (motor) or secure step. */
export function withBookedSlot(
  steps: ClaimTimelineStep[],
  bookedSlot: string | null,
): ClaimTimelineStep[] {
  if (!bookedSlot) return steps
  return steps.map((s) =>
    s.id === 'booking' || s.id === 'secure'
      ? { ...s, status: 'done' as const, dateLabel: bookedSlot }
      : s.id === 'repair'
        ? { ...s, status: 'active' as const }
        : s,
  )
}
