import { forwardRef, useState } from 'react'
import { ChevronDown, HelpCircle, ListChecks } from 'lucide-react'
import type { RiskExposure } from '@/server/db/commercialSchema'
import { coverLabel } from '@/server/domain/commercial/coverClasses'
import { cn, formatDate } from '@/lib/utils'
import { CoverageBadge, PriorityBadge, ProvenanceBadge } from './badges'

interface Props {
  exposure: RiskExposure
  locationNames?: Record<string, string>
  brokerName?: string | null
  highlighted?: boolean
  defaultOpen?: boolean
}

export const ExposureCard = forwardRef<HTMLDivElement, Props>(function ExposureCard(
  { exposure: e, locationNames = {}, brokerName, highlighted, defaultOpen = false },
  ref,
) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div
      ref={ref}
      className={cn('rounded-xl border border-navy-800/10 bg-white transition', highlighted && 'ring-2 ring-brand-500 ring-offset-2')}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-start justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-navy-900">{e.title}</span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            <PriorityBadge priority={e.priority} />
            <CoverageBadge status={e.coverage_status} />
            {e.potential_classes.slice(0, 3).map((c) => (
              <span key={c} className="rounded-md bg-navy-50 px-1.5 py-0.5 text-[11px] font-medium text-navy-600">
                {coverLabel(c)}
              </span>
            ))}
          </span>
        </span>
        <ChevronDown className={cn('mt-1 h-4 w-4 shrink-0 text-navy-500 transition', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="space-y-3 border-t border-navy-800/5 px-4 py-3 text-sm">
          <p className="text-navy-800">{e.description}</p>
          <p className="text-xs text-navy-600">
            <strong className="text-navy-800">Business impact:</strong> {e.business_impact}
          </p>
          <div>
            <p className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Why this priority</p>
            <ul className="mt-1 space-y-0.5 text-xs text-navy-700">
              {e.priority_inputs.map((i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-navy-300" /> {i}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-[11px] text-navy-500">Advisory review order from these inputs only. Not an actuarial probability.</p>
          </div>
          {e.evidence.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Evidence</p>
              <ul className="mt-1 space-y-1">
                {e.evidence.map((ev, i) => (
                  <li key={`${ev.label}-${i}`} className="flex flex-wrap items-center gap-2 text-xs text-navy-700">
                    <ProvenanceBadge source={ev.source} /> {ev.label}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {e.outstanding_questions.length > 0 && (
            <div>
              <p className="flex items-center gap-1 text-[11px] font-semibold tracking-wide text-navy-500 uppercase">
                <HelpCircle className="h-3 w-3" /> Outstanding questions
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-navy-700">
                {e.outstanding_questions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-navy-500">
            <span className="flex items-center gap-1">
              <ListChecks className="h-3 w-3" /> {e.category.replace(/_/g, ' ')}
            </span>
            {e.location_ids.length > 0 && <span>Sites: {e.location_ids.map((id) => locationNames[id] ?? 'site').join(', ')}</span>}
            <span>Assigned: {brokerName ?? 'Unassigned'}</span>
            <span>Review by {formatDate(e.review_date)}</span>
          </p>
        </div>
      )}
    </div>
  )
})
