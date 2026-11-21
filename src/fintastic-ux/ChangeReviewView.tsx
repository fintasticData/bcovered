import { ArrowRight, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { CopilotNudge } from './CopilotNudge'

export type TermField = {
  id: string
  label: string
  expiring: string
  proposed: string
  changed?: boolean
}

/** Centre-first change review: material change + action between expiring and proposed terms. */
export function ChangeReviewView({
  clientLabel,
  changeHeadline,
  russMessage,
  changeFrom,
  changeTo,
  fields,
  primaryActionLabel,
  onPrimaryAction,
  bulkActionLabel,
  onBulkAction,
  bulkCount,
  showAllTerms,
  onToggleAllTerms,
}: {
  clientLabel: string
  changeHeadline: string
  /** Separate Russ explanation (defaults to changeHeadline). */
  russMessage?: string
  changeFrom: string
  changeTo: string
  fields: TermField[]
  primaryActionLabel: string
  onPrimaryAction?: () => void
  bulkActionLabel?: string
  onBulkAction?: () => void
  bulkCount?: number
  showAllTerms?: boolean
  onToggleAllTerms?: () => void
}) {
  const russCopy = russMessage ?? changeHeadline
  const changed = fields.filter((f) => f.changed)
  const unchanged = fields.filter((f) => !f.changed)
  const mobileFields = showAllTerms ? fields : changed.length ? changed : fields.slice(0, 3)

  const decisionCard = (
    <div className="flex flex-col justify-center rounded-2xl border border-brand-300 bg-brand-50/60 p-5 shadow-sm">
      <CopilotNudge className="border-0 bg-transparent p-0 shadow-none">{russCopy}</CopilotNudge>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-lg font-semibold tabular-nums text-navy-900">
        <span>{changeFrom}</span>
        <ArrowRight className="h-4 w-4 shrink-0 text-brand-600" aria-hidden />
        <span className="rounded-lg bg-brand-100 px-2 py-0.5 text-brand-900">{changeTo}</span>
      </div>
      {onPrimaryAction && (
        <Button size="sm" variant="accent" className="mt-5 w-full" onClick={onPrimaryAction}>
          <MessageSquare /> {primaryActionLabel}
        </Button>
      )}
      {bulkCount && bulkCount > 1 && onBulkAction && bulkActionLabel && (
        <Button size="sm" variant="outline" className="mt-2 w-full" onClick={onBulkAction}>
          {bulkActionLabel}
        </Button>
      )}
    </div>
  )

  const stackedFields = (
    <div className="rounded-2xl border border-navy-800/10 bg-white p-3">
      {mobileFields.map((f) => (
        <div key={f.id} className="border-b border-navy-800/5 py-2 last:border-0">
          <p className="text-[10px] font-bold tracking-wide text-navy-500 uppercase">{f.label}</p>
          <p className="text-sm tabular-nums text-navy-900">
            {f.expiring} <span className="text-navy-400">→</span> {f.proposed}
          </p>
        </div>
      ))}
      {unchanged.length > 0 && onToggleAllTerms && (
        <button
          type="button"
          className="mt-2 cursor-pointer text-xs font-semibold text-brand-700 underline"
          onClick={onToggleAllTerms}
        >
          {showAllTerms ? 'Hide unchanged terms' : 'View all terms'}
        </button>
      )}
    </div>
  )

  return (
    <section className="@container space-y-4" style={{ containerType: 'inline-size' }}>
      <div>
        <p className="text-[10px] font-semibold tracking-wide text-navy-500 uppercase">Change review</p>
        <h2 className="font-display text-xl font-semibold text-navy-900 sm:text-2xl">{clientLabel}</h2>
        <p className="mt-1 text-sm text-navy-600">{changeHeadline}</p>
      </div>

      {/* Wide workspace only — never force 3-col inside a slide-out */}
      <div className="hidden gap-3 @[52rem]:grid @[52rem]:grid-cols-3">
        <TermsCard title="Expiring terms" fields={fields} side="expiring" />
        {decisionCard}
        <TermsCard title="Proposed terms" fields={fields} side="proposed" highlightChanged />
      </div>

      {/* Narrow / phone / constrained width */}
      <div className="space-y-3 @[52rem]:hidden">
        {decisionCard}
        {stackedFields}
      </div>
    </section>
  )
}

function TermsCard({
  title,
  fields,
  side,
  highlightChanged,
}: {
  title: string
  fields: TermField[]
  side: 'expiring' | 'proposed'
  highlightChanged?: boolean
}) {
  return (
    <article className="rounded-2xl border border-navy-800/10 bg-white p-4 shadow-sm">
      <p className="text-[10px] font-bold tracking-wide text-navy-500 uppercase">{title}</p>
      <dl className="mt-3 space-y-2.5 text-sm">
        {fields.map((f) => {
          const value = side === 'expiring' ? f.expiring : f.proposed
          return (
            <div key={f.id} className="flex justify-between gap-2">
              <dt className="text-navy-500">{f.label}</dt>
              <dd
                className={cn(
                  'font-medium tabular-nums text-navy-900',
                  highlightChanged && f.changed && 'rounded-md bg-brand-100 px-1.5 text-brand-900',
                )}
              >
                {value}
              </dd>
            </div>
          )
        })}
      </dl>
    </article>
  )
}
