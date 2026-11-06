import { Check, X } from 'lucide-react'
import type { OptionView } from '@/api/client'
import type { ComparisonSummary, CoverageKey } from '@/server/db/schema'
import { rand } from '@/lib/quote'
import { cn, formatDate } from '@/lib/utils'
import { SimulatedBadge } from './SimulatedBadge'

const COVER_ROWS: Array<{ key: CoverageKey; label: string }> = [
  { key: 'vehicle_cover', label: 'Vehicle cover' },
  { key: 'theft_hijacking', label: 'Theft and hijacking' },
  { key: 'windscreen', label: 'Windscreen' },
  { key: 'roadside', label: 'Roadside assistance' },
  { key: 'courtesy_vehicle', label: 'Courtesy vehicle' },
]

export function QuoteComparisonTable({
  options,
  comparison,
  highlight,
}: {
  options: OptionView[]
  comparison?: ComparisonSummary | null
  highlight?: string | null
}) {
  const tag = (id: string) =>
    [comparison?.cheapest_option_id === id && 'Lowest premium', comparison?.lowest_excess_option_id === id && 'Lowest excess'].filter(
      Boolean,
    ) as string[]

  const money = (label: string, pick: (o: OptionView) => number) => (
    <tr>
      <th scope="row" className="py-2.5 pr-4 text-left text-xs font-semibold text-navy-700">
        {label}
      </th>
      {options.map((o) => (
        <td key={o.id} className={cn('px-3 py-2.5 text-sm font-semibold text-navy-900', highlight === o.id && 'bg-brand-50/60')}>
          {rand(pick(o))}
        </td>
      ))}
    </tr>
  )

  const list = (label: string, pick: (o: OptionView) => string[]) => (
    <tr>
      <th scope="row" className="py-2.5 pr-4 text-left align-top text-xs font-semibold text-navy-700">
        {label}
      </th>
      {options.map((o) => (
        <td key={o.id} className={cn('px-3 py-2.5 align-top text-xs text-navy-700', highlight === o.id && 'bg-brand-50/60')}>
          <ul className="list-disc space-y-1 pl-4">
            {pick(o).map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </td>
      ))}
    </tr>
  )

  return (
    <div className="scroll-area overflow-x-auto">
      <table className="w-full min-w-[640px] border-separate border-spacing-0">
        <thead>
          <tr>
            <th scope="col" className="w-40" />
            {options.map((o) => (
              <th key={o.id} scope="col" className={cn('rounded-t-xl px-3 pb-3 text-left align-bottom', highlight === o.id && 'bg-brand-50/60')}>
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold tracking-wide text-navy-500 uppercase">{o.option_label}</span>
                  <span className="text-base font-semibold text-navy-900">{o.insurer.name}</span>
                  <span className="text-[11px] font-medium text-navy-500">Fictional insurer</span>
                  <div className="flex flex-wrap gap-1">
                    <SimulatedBadge />
                    {tag(o.id).map((t) => (
                      <span key={t} className="rounded-full bg-brand-500 px-2 py-0.5 text-[11px] font-semibold text-white">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&_td]:border-t [&_td]:border-navy-800/10 [&_th[scope=row]]:border-t [&_th[scope=row]]:border-navy-800/10">
          {money('Monthly premium', (o) => o.monthly_premium)}
          {money('Annual premium', (o) => o.annual_premium)}
          {money('Excess', (o) => o.excess)}
          {money('Sum insured', (o) => o.sum_insured)}
          {COVER_ROWS.map((row) => (
            <tr key={row.key}>
              <th scope="row" className="py-2.5 pr-4 text-left text-xs font-semibold text-navy-700">
                {row.label}
              </th>
              {options.map((o) => {
                const item = o.inclusions.find((i) => i.key === row.key)
                return (
                  <td key={o.id} className={cn('px-3 py-2.5 text-xs text-navy-700', highlight === o.id && 'bg-brand-50/60')}>
                    <span className="flex items-start gap-1.5">
                      {item?.included ? (
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-label="Included" />
                      ) : (
                        <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" aria-label="Not included" />
                      )}
                      {item?.detail ?? 'Not stated'}
                    </span>
                  </td>
                )
              })}
            </tr>
          ))}
          {list('Limitations', (o) => o.exclusions)}
          {list('Conditions', (o) => o.conditions)}
          {list('Assumptions', (o) => o.assumptions)}
          <tr>
            <th scope="row" className="py-2.5 pr-4 text-left text-xs font-semibold text-navy-700">
              Expires
            </th>
            {options.map((o) => (
              <td key={o.id} className={cn('px-3 py-2.5 text-xs text-navy-700', highlight === o.id && 'bg-brand-50/60')}>
                {formatDate(o.expires_at)} · source {o.source}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  )
}
