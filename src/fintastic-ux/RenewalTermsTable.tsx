import { cn } from '@/lib/utils'
import type { TermField } from './ChangeReviewView'

/** Compact Field / Expiring / Proposed table for narrow drawers. Excess first. */
export function RenewalTermsTable({
  fields,
  className,
}: {
  fields: TermField[]
  className?: string
}) {
  const ordered = [...fields].sort((a, b) => {
    if (a.id === 'excess') return -1
    if (b.id === 'excess') return 1
    return 0
  })

  return (
    <div
      className={cn('@container rounded-xl border border-navy-800/10 bg-white', className)}
      style={{ containerType: 'inline-size' }}
    >
      <table className="hidden w-full text-left text-sm @[22rem]:table">
        <thead className="bg-mist text-[10px] font-bold tracking-wide text-navy-500 uppercase">
          <tr>
            <th className="px-3 py-2">Field</th>
            <th className="px-3 py-2 text-right">Expiring</th>
            <th className="px-3 py-2 text-right">Proposed</th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((f) => (
            <tr key={f.id} className="border-t border-navy-800/5">
              <td className="px-3 py-2 text-navy-600">{f.label}</td>
              <td className="px-3 py-2 text-right tabular-nums text-navy-800">{f.expiring}</td>
              <td
                className={cn(
                  'px-3 py-2 text-right font-medium tabular-nums text-navy-900',
                  f.changed && 'rounded-md bg-brand-50 text-brand-900',
                )}
              >
                {f.proposed}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="space-y-0 @[22rem]:hidden">
        {ordered.map((f) => (
          <li key={f.id} className="border-b border-navy-800/5 px-3 py-2.5 last:border-0">
            <p className="text-[10px] font-bold tracking-wide text-navy-500 uppercase">{f.label}</p>
            <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
              <span className="tabular-nums text-navy-600">
                <span className="text-[10px] font-semibold tracking-wide text-navy-400 uppercase">Expiring </span>
                {f.expiring}
              </span>
              <span
                className={cn(
                  'font-medium tabular-nums text-navy-900',
                  f.changed && 'rounded-md bg-brand-100 px-1.5 text-brand-900',
                )}
              >
                <span className="text-[10px] font-semibold tracking-wide text-navy-400 uppercase">Proposed </span>
                {f.proposed}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
