import type { ReactNode } from 'react'
import { Check, Circle, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

export type JourneyStep = {
  id: string
  label: string
  status: 'done' | 'active' | 'upcoming'
  detail?: string
  dateLabel?: string
}

export type JourneyContextCard = {
  title: string
  lines: string[]
  badge?: string
}

/** Centre-first progress shell shared by claim + quote Fintastic journeys. */
export function ActiveStepJourney({
  eyebrow = 'Progress',
  headline,
  subhead,
  steps,
  activeBody,
  leftCard,
  rightCards,
  documents,
  documentsTitle = 'Documents',
  timelineSummaryLabel = 'Full timeline',
  layout = 'page',
  roleActions,
}: {
  eyebrow?: string
  headline: string
  subhead?: string
  steps: JourneyStep[]
  activeBody?: ReactNode
  leftCard?: JourneyContextCard
  rightCards?: JourneyContextCard[]
  documents?: { name: string; meta?: string }[]
  documentsTitle?: string
  timelineSummaryLabel?: string
  layout?: 'page' | 'panel'
  /** Role-specific CTAs under the active decision (customer vs broker). */
  roleActions?: ReactNode
}) {
  const stacked = (
    <div className="space-y-3">
      <ActiveDecision
        steps={steps}
        activeBody={activeBody}
        roleActions={roleActions}
        showTimelineSummary={layout === 'panel'}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        {leftCard && <ContextCard card={leftCard} />}
        {(rightCards ?? []).map((card) => (
          <ContextCard key={card.title} card={card} />
        ))}
      </div>
      <DocumentsCard title={documentsTitle} documents={documents} />
      {layout === 'page' && (
        <details className="rounded-2xl border border-navy-800/10 bg-white p-3 shadow-sm">
          <summary className="cursor-pointer text-xs font-semibold text-navy-600">{timelineSummaryLabel}</summary>
          <ol className="mt-3 space-y-0">
            {steps.map((step, i) => (
              <TimelineStep key={step.id} step={step} isLast={i === steps.length - 1} compact />
            ))}
          </ol>
        </details>
      )}
    </div>
  )

  const wideHub = (
    <div className="grid grid-cols-[minmax(12rem,16rem)_minmax(0,1fr)_minmax(12rem,16rem)] items-start gap-4">
      <div className="space-y-3">{leftCard && <ContextCard card={leftCard} />}</div>
      <ol className="space-y-0 rounded-2xl border border-navy-800/10 bg-white p-4 shadow-sm">
        {steps.map((step, i) => (
          <TimelineStep
            key={step.id}
            step={step}
            isLast={i === steps.length - 1}
            activeBody={
              step.status === 'active' ? (
                <div className="mt-3 space-y-3">
                  {activeBody}
                  {roleActions}
                </div>
              ) : null
            }
          />
        ))}
      </ol>
      <div className="space-y-3">
        {(rightCards ?? []).map((card) => (
          <ContextCard key={card.title} card={card} />
        ))}
        <DocumentsCard title={documentsTitle} documents={documents} />
      </div>
    </div>
  )

  return (
    <section
      className={cn('space-y-4', layout === 'page' && '@container')}
      style={layout === 'page' ? { containerType: 'inline-size' } : undefined}
    >
      <div>
        <p className="text-[10px] font-semibold tracking-wide text-navy-500 uppercase">{eyebrow}</p>
        <h2 className="font-display text-xl font-semibold text-navy-900 sm:text-2xl">{headline}</h2>
        {subhead && <p className="mt-1 text-sm text-navy-600">{subhead}</p>}
      </div>

      {layout === 'panel' ? (
        stacked
      ) : (
        <>
          <div className="block @[56rem]:hidden">{stacked}</div>
          <div className="hidden @[56rem]:block">{wideHub}</div>
        </>
      )}
    </section>
  )
}

function ActiveDecision({
  steps,
  activeBody,
  roleActions,
  showTimelineSummary,
}: {
  steps: JourneyStep[]
  activeBody?: ReactNode
  roleActions?: ReactNode
  showTimelineSummary?: boolean
}) {
  const active = steps.find((s) => s.status === 'active')
  const done = steps.filter((s) => s.status === 'done')
  const upcoming = steps.filter((s) => s.status === 'upcoming')

  return (
    <div className="rounded-2xl border border-brand-300 bg-brand-50/50 p-4 shadow-sm">
      <p className="text-[10px] font-bold tracking-wide text-brand-700 uppercase">Current step</p>
      <p className="mt-1 text-base font-semibold text-navy-900">{active?.label ?? 'In progress'}</p>
      <div className="mt-3 space-y-3">
        {activeBody}
        {roleActions}
      </div>
      {showTimelineSummary && (
        <div className="mt-4 border-t border-brand-200/80 pt-3">
          <p className="text-[10px] font-bold tracking-wide text-navy-500 uppercase">Progress</p>
          <ul className="mt-1.5 space-y-1 text-xs text-navy-700">
            {done.map((s) => (
              <li key={s.id} className="flex gap-2">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-700" aria-hidden />
                <span>
                  {s.label}
                  {s.dateLabel ? ` · ${s.dateLabel}` : ''}
                </span>
              </li>
            ))}
            {active && (
              <li className="flex gap-2 font-semibold text-navy-900">
                <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-700" aria-hidden />
                <span>{active.label}</span>
              </li>
            )}
            {upcoming.map((s) => (
              <li key={s.id} className="flex gap-2 text-navy-400">
                <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>{s.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function TimelineStep({
  step,
  isLast,
  activeBody,
  compact,
}: {
  step: JourneyStep
  isLast: boolean
  activeBody?: ReactNode
  compact?: boolean
}) {
  const Icon = step.status === 'done' ? Check : step.status === 'active' ? Clock : Circle
  return (
    <li className={cn('relative flex gap-3', compact ? 'pb-3 last:pb-0' : 'pb-6 last:pb-0')}>
      {!isLast && (
        <span
          aria-hidden
          className={cn(
            'absolute top-8 left-[15px] w-px',
            step.status === 'done' ? 'bg-brand-500' : 'bg-navy-200',
          )}
          style={{ height: 'calc(100% - 1.5rem)' }}
        />
      )}
      <span
        className={cn(
          'relative z-[1] inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          step.status === 'done' && 'bg-brand-700 text-white',
          step.status === 'active' && 'bg-brand-100 text-brand-800 ring-2 ring-brand-500',
          step.status === 'upcoming' && 'bg-navy-100 text-navy-400',
        )}
      >
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            'rounded-xl',
            step.status === 'active' && !compact && 'border border-brand-300 bg-brand-50/50 p-3',
          )}
        >
          <p
            className={cn(
              'text-sm font-semibold',
              step.status === 'upcoming' ? 'text-navy-400' : 'text-navy-900',
            )}
          >
            {step.label}
          </p>
          {step.dateLabel && <p className="text-xs text-navy-500">{step.dateLabel}</p>}
          {step.detail && step.status !== 'active' && (
            <p className="mt-0.5 text-xs text-navy-600">{step.detail}</p>
          )}
          {activeBody}
        </div>
      </div>
    </li>
  )
}

function DocumentsCard({
  title,
  documents,
}: {
  title: string
  documents?: { name: string; meta?: string }[]
}) {
  if (!documents) return null
  return (
    <article className="rounded-2xl border border-navy-800/10 bg-white p-4 shadow-sm">
      <p className="text-[10px] font-bold tracking-wide text-navy-500 uppercase">{title}</p>
      {documents.length === 0 ? (
        <p className="mt-2 text-sm text-navy-600">No documents uploaded yet.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {documents.map((d) => (
            <li key={d.name} className="flex justify-between gap-2 text-sm">
              <span className="font-medium text-navy-800">{d.name}</span>
              {d.meta && <span className="text-xs text-navy-500">{d.meta}</span>}
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}

function ContextCard({ card }: { card: JourneyContextCard }) {
  return (
    <article className="rounded-2xl border border-navy-800/10 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-[10px] font-bold tracking-wide text-navy-500 uppercase">{card.title}</p>
        {card.badge && (
          <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-bold text-brand-800 uppercase">
            {card.badge}
          </span>
        )}
      </div>
      <ul className="mt-2 space-y-1 text-sm text-navy-800">
        {card.lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </article>
  )
}
