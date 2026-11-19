import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCreateQuoteRequest } from '@/api/hooks'
import { Button } from '@/components/ui/button'
import { SimulatedBadge } from '@/components/SimulatedBadge'
import { StatusBadge, humanise } from '@/components/StatusBadge'
import { personalProducts } from '@/data/products'
import { cn } from '@/lib/utils'
import { COVER_CLASSES, coverLabel } from '@/server/domain/commercial/coverClasses'
import type { LeadDetail } from '@/server/api'

const PROPERTY_KEYS = COVER_CLASSES.filter((c) => c.group === 'property').map((c) => c.key)

function quoteLabel(q: LeadDetail['quotes'][number]): string {
  const covers = q.risk_summary.covers ?? []
  if (covers.length) return covers.map((c) => coverLabel(c) !== c ? coverLabel(c) : humanise(c)).slice(0, 2).join(', ') + (covers.length > 2 ? ` +${covers.length - 2}` : '')
  if (q.risk_summary.vehicle) return 'Motor comparison'
  return humanise(q.product_category)
}

function suggestedCommercialCovers(data: LeadDetail): string[] {
  const match = data.matches.find((m) => m.lead_id === data.lead.id) ?? data.matches[0]
  const coverType = (match?.cover_type ?? data.lead.product_category ?? '').toLowerCase()
  if (coverType.includes('property') || coverType.includes('commercial_package') || coverType.includes('commercial')) {
    return PROPERTY_KEYS.slice(0, 3)
  }
  return []
}

export function QuoteRequestPanel({ data }: { data: LeadDetail }) {
  const navigate = useNavigate()
  const create = useCreateQuoteRequest()
  const commercial = data.lead.line === 'commercial'
  const options = useMemo(
    () =>
      commercial
        ? COVER_CLASSES.map((c) => ({ key: c.key, label: c.label, hint: c.description }))
        : personalProducts.map((p) => ({ key: p.slug, label: p.label, hint: p.short })),
    [commercial],
  )
  const [picking, setPicking] = useState(false)
  const [selected, setSelected] = useState<string[]>(() => (commercial ? suggestedCommercialCovers(data) : []))
  const [error, setError] = useState<string | null>(null)

  const toggle = (key: string) => {
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
    setError(null)
  }

  const submit = async () => {
    if (!selected.length) {
      setError('Choose at least one cover type')
      return
    }
    setError(null)
    try {
      const quote = await create.mutateAsync({ lead_id: data.lead.id, covers: selected })
      navigate(`/broker/quotes/${quote.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open quote request')
    }
  }

  return (
    <section className="panel p-5">
      <h2 className="text-sm font-semibold text-navy-900">Quotes</h2>
      <p className="mt-1 text-[11px] text-navy-500">
        {data.lead.product_category
          ? 'Choose cover types when you start a quote from this opportunity.'
          : 'No cover on this opportunity yet. Pick cover types here to start a quote when they ask.'}
      </p>

      {data.quotes.length > 0 && (
        <ul className="mt-3 space-y-2">
          {data.quotes.map((q) => (
            <li key={q.id}>
              <Link to={`/broker/quotes/${q.id}`} className="flex items-center justify-between rounded-xl border border-navy-800/10 p-3 hover:border-brand-500/40">
                <span className="text-sm font-medium text-navy-900">{quoteLabel(q)}</span>
                <span className="flex items-center gap-2">
                  <SimulatedBadge />
                  <StatusBadge status={q.status} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {!picking ? (
        <div className="mt-3">
          {data.quotes.length === 0 && <p className="mb-3 text-xs text-navy-600">No comparison yet.</p>}
          <Button type="button" variant="accent" size="sm" onClick={() => setPicking(true)}>
            Request quote
          </Button>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <p className="text-xs font-semibold text-navy-800">{commercial ? 'Commercial cover classes' : 'Personal products'}</p>
          <div className="flex flex-wrap gap-2">
            {options.map((o) => {
              const on = selected.includes(o.key)
              return (
                <button
                  key={o.key}
                  type="button"
                  title={o.hint}
                  onClick={() => toggle(o.key)}
                  className={cn(
                    'rounded-lg border px-2.5 py-1.5 text-left text-xs font-medium transition',
                    on ? 'border-brand-500 bg-brand-50 text-brand-800' : 'border-navy-800/15 bg-white text-navy-700 hover:border-brand-300',
                  )}
                >
                  {o.label}
                </button>
              )
            })}
          </div>
          {error && <p className="text-xs text-red-700">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="accent" size="sm" disabled={create.isPending} onClick={() => void submit()}>
              {create.isPending ? 'Opening…' : 'Confirm cover and open quote'}
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={create.isPending} onClick={() => setPicking(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
