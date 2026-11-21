import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { CopilotNudge } from './CopilotNudge'
import {
  ActiveStepJourney,
  type JourneyContextCard,
  type JourneyStep,
} from './ActiveStepJourney'

export type ClaimTimelineStep = JourneyStep
export type ClaimContextCard = JourneyContextCard

const DEMO_SLOTS = [
  { id: 's1', label: 'Tuesday 24 November at 10:00', available: true },
  { id: 's2', label: 'Wednesday 25 November at 14:30', available: true },
  { id: 's3', label: 'Thursday 26 November at 09:00', available: false },
]

/** Centre-first claim progress — same journey shell as quote review. */
export function ActiveStepClaimView({
  headline,
  subhead,
  steps,
  proposedSlotLabel,
  onConfirm,
  onChooseOther,
  vehicleCard,
  repairerCard,
  documents,
  bookedSlotLabel,
  selectingSlot: selectingSlotControlled,
  layout = 'page',
  role = 'customer',
  roleActions,
  copilotName,
  copilotTitle,
}: {
  headline: string
  subhead?: string
  steps: ClaimTimelineStep[]
  proposedSlotLabel?: string
  onConfirm?: (slotLabel: string) => void
  onChooseOther?: () => void
  vehicleCard?: ClaimContextCard
  repairerCard?: ClaimContextCard
  documents?: { name: string; meta?: string }[]
  bookedSlotLabel?: string | null
  selectingSlot?: boolean
  layout?: 'page' | 'panel'
  role?: 'customer' | 'broker'
  /** Extra CTAs under booking (Ask Ava, Allocate provider, etc.). */
  roleActions?: ReactNode
  copilotName?: string
  copilotTitle?: string
}) {
  const [picking, setPicking] = useState(false)
  const [slotId, setSlotId] = useState('s1')
  const [error, setError] = useState<string | null>(null)
  const selecting = selectingSlotControlled ?? picking

  const selectedSlot = DEMO_SLOTS.find((s) => s.id === slotId) ?? DEMO_SLOTS[0]
  const displayProposal = bookedSlotLabel
    ? `Booked: ${bookedSlotLabel}`
    : proposedSlotLabel ?? selectedSlot.label

  const confirm = () => {
    setError(null)
    if (!selectedSlot.available) {
      setError('That slot is no longer available. Please choose another time.')
      setPicking(true)
      return
    }
    onConfirm?.(selectedSlot.label)
    setPicking(false)
  }

  const chooseOther = () => {
    setError(null)
    setPicking(true)
    onChooseOther?.()
  }

  return (
    <ActiveStepJourney
      eyebrow="Claim progress"
      headline={headline}
      subhead={subhead}
      steps={steps}
      layout={layout}
      leftCard={vehicleCard}
      rightCards={repairerCard ? [repairerCard] : undefined}
      documents={documents}
      documentsTitle="Claim documents"
      timelineSummaryLabel="Full claim timeline"
      roleActions={roleActions}
      activeBody={
        <div className="space-y-3">
          <CopilotNudge
            name={copilotName ?? (role === 'customer' ? 'Ava' : undefined)}
            title={copilotTitle ?? (role === 'customer' ? 'Your workspace helper' : undefined)}
            avatarUrl={role === 'customer' && !copilotName ? null : undefined}
          >
            {displayProposal}
          </CopilotNudge>
          {selecting && !bookedSlotLabel && (
            <fieldset className="space-y-2 rounded-xl border border-navy-800/10 bg-white p-3">
              <legend className="px-1 text-[10px] font-bold tracking-wide text-navy-500 uppercase">
                Choose a slot
              </legend>
              {DEMO_SLOTS.map((s) => (
                <label key={s.id} className="flex cursor-pointer items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name="claim-slot"
                    checked={slotId === s.id}
                    onChange={() => setSlotId(s.id)}
                    className="mt-1"
                  />
                  <span>
                    {s.label}
                    {!s.available && (
                      <span className="ml-1 text-xs font-semibold text-amber-800">(unavailable)</span>
                    )}
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          {error && (
            <p
              className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-950"
              role="alert"
            >
              {error}
            </p>
          )}
          {onConfirm && !bookedSlotLabel && (
            <Button size="sm" variant="accent" className="w-full" onClick={confirm}>
              Confirm booking →
            </Button>
          )}
          {onConfirm && !bookedSlotLabel && (
            <button
              type="button"
              className="block cursor-pointer text-sm font-semibold text-brand-700 underline"
              onClick={chooseOther}
            >
              Choose a different date and time
            </button>
          )}
          {bookedSlotLabel && (
            <p className="text-xs font-semibold text-emerald-800">Repair booking confirmed (demo).</p>
          )}
        </div>
      }
    />
  )
}
