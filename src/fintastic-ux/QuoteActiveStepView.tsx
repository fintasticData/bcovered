import type { ReactNode } from 'react'
import { CheckCircle2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ActiveStepJourney, type JourneyStep } from './ActiveStepJourney'
import { CopilotNudge } from './CopilotNudge'

export type QuoteJourneyPhase = 'choose' | 'details' | 'review' | 'done'

/** Fintastic centre journey for Get a quote — same shell as claim ActiveStep. */
export function QuoteActiveStepView({
  greetingName,
  brokerageName,
  brokerName,
  phase,
  selectedLabels,
  cover,
  notes,
  onCoverChange,
  onNotesChange,
  onBack,
  onSubmit,
  submitting,
  submitError,
  confirm,
  onDone,
  onAskAva,
  chooseBody,
  detailsBody,
}: {
  greetingName: string
  brokerageName: string
  brokerName?: string | null
  phase: QuoteJourneyPhase
  selectedLabels: string[]
  cover: string
  notes: string
  onCoverChange: (v: string) => void
  onNotesChange: (v: string) => void
  onBack?: () => void
  onSubmit?: () => void
  submitting?: boolean
  submitError?: string | null
  confirm?: { reference: string; summary: string } | null
  onDone?: () => void
  onAskAva?: () => void
  chooseBody?: ReactNode
  detailsBody?: ReactNode
}) {
  const steps: JourneyStep[] = [
    {
      id: 'choose',
      label: 'Choose items',
      status: phase === 'choose' ? 'active' : 'done',
    },
    {
      id: 'details',
      label: 'Check details',
      status:
        phase === 'details' ? 'active' : phase === 'choose' ? 'upcoming' : 'done',
    },
    {
      id: 'review',
      label: 'Review and submit',
      status:
        phase === 'review' ? 'active' : phase === 'done' ? 'done' : phase === 'choose' || phase === 'details' ? 'upcoming' : 'done',
    },
    {
      id: 'broker',
      label: 'With your broker',
      status: phase === 'done' ? 'active' : 'upcoming',
      detail: confirm?.reference,
    },
  ]

  const activeBody =
    phase === 'choose' ? (
      chooseBody
    ) : phase === 'details' ? (
      detailsBody
    ) : phase === 'review' ? (
      <div className="space-y-3">
        <CopilotNudge name="Ava" title="Your workspace helper" avatarUrl={null}>
          Review the items and cover type, then submit. Your broker will release options on My quotes.
        </CopilotNudge>
        <div className="rounded-xl border border-navy-800/10 bg-white p-3 text-sm">
          <p className="text-[10px] font-bold tracking-wide text-navy-500 uppercase">Items</p>
          <ul className="mt-1 space-y-1">
            {selectedLabels.map((label) => (
              <li key={label} className="font-semibold text-navy-900">
                {label}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <label className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">
            Cover requested
          </label>
          <select
            className="mt-1 w-full rounded-lg border border-navy-800/15 bg-white px-3 py-2 text-sm"
            value={cover}
            onChange={(e) => onCoverChange(e.target.value)}
          >
            <option>Comprehensive</option>
            <option>Third party, fire &amp; theft</option>
            <option>Third party only</option>
            <option>Household contents</option>
            <option>Buildings</option>
          </select>
        </div>
        <div>
          <label className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">
            Notes for broker
          </label>
          <textarea
            rows={3}
            className="mt-1 w-full rounded-lg border border-navy-800/15 bg-white px-3 py-2 text-sm"
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
          />
        </div>
        {submitError && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">{submitError}</p>
        )}
        <div className="flex flex-wrap gap-2">
          {onBack && (
            <Button size="sm" variant="outline" type="button" onClick={onBack}>
              Back
            </Button>
          )}
          <Button size="sm" variant="accent" disabled={submitting} type="button" onClick={onSubmit}>
            <Plus /> {submitting ? 'Submitting…' : 'Submit quote request'}
          </Button>
        </div>
      </div>
    ) : (
      <div className="space-y-3">
        <p className="flex items-start gap-2 rounded-xl bg-emerald-50 px-3 py-3 text-sm font-semibold text-emerald-950">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          {confirm?.summary ?? 'Request submitted'}
        </p>
        <p className="font-mono text-sm text-navy-900">{confirm?.reference}</p>
        <p className="text-sm text-navy-600">Track progress on Quotes — your broker will release options when ready.</p>
        {onDone && (
          <Button size="sm" variant="accent" type="button" onClick={onDone}>
            Done
          </Button>
        )}
      </div>
    )

  return (
    <ActiveStepJourney
      eyebrow="Quote progress"
      headline={
        phase === 'done'
          ? 'Quote request with your broker'
          : phase === 'review'
            ? 'Review and submit'
            : 'Get a quote'
      }
      subhead={`Hi ${greetingName}, request options from ${brokerageName} — same journey pattern as your claims.`}
      steps={steps}
      layout="page"
      leftCard={{
        title: 'Selected items',
        lines: selectedLabels.length ? selectedLabels : ['None selected yet'],
      }}
      rightCards={[
        {
          title: 'Your broker',
          badge: brokerageName,
          lines: [
            brokerName ?? 'Your assigned broker',
            brokerageName,
            phase === 'done' ? 'Waiting on broker' : 'Will receive this request',
          ],
        },
        {
          title: 'What happens next',
          lines:
            phase === 'done'
              ? ['Broker reviews', 'Offers appear on Quotes', 'You accept with your broker']
              : ['Submit request', 'Broker prepares options', 'Compare on My quotes'],
        },
      ]}
      documents={selectedLabels.map((label) => ({ name: label, meta: 'Linked item' }))}
      documentsTitle="On this request"
      timelineSummaryLabel="Full quote timeline"
      activeBody={activeBody}
      roleActions={
        onAskAva ? (
          <Button size="sm" variant="outline" type="button" onClick={onAskAva}>
            Ask Ava
          </Button>
        ) : null
      }
    />
  )
}
