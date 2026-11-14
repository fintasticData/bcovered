import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { coverLabel, formatQeDate, isQuoted, vehicleItem } from '@/lib/qe/sampleQuotes'
import type { QeInsurerQuote, QeMotorRequest } from '@/lib/qe/types'
import { excessText, premiumText } from './QeQuoteComparison'
import { DemoSampleBadge, InsurerMark, OutcomeBadge } from './shared'

function Rows({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[11rem_1fr]">
      {rows.flatMap(([k, v]) => [
        <dt key={`${k}-l`} className="text-navy-500">{k}</dt>,
        <dd key={`${k}-v`} className="font-medium break-words text-navy-900">{v}</dd>,
      ])}
    </dl>
  )
}

export function QeOfferDialog({ quote, request, onClose }: { quote: QeInsurerQuote; request: Readonly<QeMotorRequest>; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('keydown', esc)
      opener?.focus()
    }
  }, [onClose])

  const v = request.vehicles[0]
  const item = vehicleItem(quote)
  const quoted = isQuoted(quote)
  const insurerMessages = [...(quote.message ? [quote.message] : []), ...quote.messages.map((m) => m.message)]
  const itemMessages = item?.messages.map((m) => m.message) ?? []

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-navy-900/50 p-4" role="dialog" aria-modal="true" aria-labelledby="qe-offer-title">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close offer" tabIndex={-1} onClick={onClose} />
      <div className="panel scroll-area relative max-h-[85dvh] w-full max-w-2xl p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <InsurerMark name={quote.insurerName} className="h-11 w-11 text-sm" />
            <div>
              <h2 id="qe-offer-title" className="text-lg font-semibold text-navy-900">{quote.insurerName}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <OutcomeBadge quote={quote} />
                <DemoSampleBadge />
              </div>
            </div>
          </div>
          <Button ref={closeRef} size="icon" variant="ghost" onClick={onClose} aria-label="Close offer">
            <X />
          </Button>
        </div>

        <section className="mt-5">
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-navy-500 uppercase">Submitted vehicle and cover</h3>
          <Rows
            rows={[
              ['M&M code', v.meadCode],
              ['Model year', String(v.year)],
              ['Colour', v.colour ?? '–'],
              ['Cover', coverLabel(v.cover)],
            ]}
          />
        </section>

        <section className="mt-5">
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-navy-500 uppercase">Offer</h3>
          <Rows
            rows={[
              ['Insurer reference', quote.insurerReference || '–'],
              ['QE quote number', String(quote.quoteID)],
              ['Insurer status', `${quote.status} (insurer responded)`],
              ['Vehicle outcome', item?.status ?? 'No Quote'],
              ['Monthly premium', premiumText(quote)],
              ['Basic excess', excessText(quote)],
              ['Quote date', quoted ? formatQeDate(quote.quoteDate) : 'Not applicable'],
              ['Expires', quoted ? `${formatQeDate(quote.quoteExpires)} (${quote.validDays} days)` : 'Not applicable'],
            ]}
          />
        </section>

        <section className="mt-5">
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-navy-500 uppercase">Messages</h3>
          <p className="text-[11px] font-semibold text-navy-700">Vehicle</p>
          {itemMessages.length ? (
            <ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-red-700">
              {itemMessages.map((m) => <li key={m}>{m}</li>)}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-navy-600">No vehicle messages.</p>
          )}
          <p className="mt-3 text-[11px] font-semibold text-navy-700">Insurer</p>
          {insurerMessages.length ? (
            <ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-navy-700">
              {insurerMessages.map((m) => <li key={m}>{m}</li>)}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-navy-600">No insurer messages.</p>
          )}
        </section>
      </div>
    </div>
  )
}
