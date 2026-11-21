import { useMemo, useState } from 'react'
import { Check, Share2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { CopilotNudge } from './CopilotNudge'

export type ComparisonOffer = {
  id: string
  label: string
  insurerName: string
  premiumLabel: string
  excessLabel: string
  premiumValue: number | null
  excessValue: number | null
  coverLabel?: string
  benefits?: string[]
  selectable?: boolean
}

function moneyDiff(a: number | null, b: number | null) {
  if (a === null || b === null) return null
  return a - b
}

/** Centre-first quote comparison: reference offer in the middle, alternatives beside. */
export function ReferenceComparisonView({
  offers,
  clientLabel,
  objectLabel,
  onSelect,
  onShare,
  onOpen,
  initialReferenceId,
}: {
  offers: ComparisonOffer[]
  clientLabel?: string
  objectLabel?: string
  onSelect?: (id: string) => void
  onShare?: (payload: { referenceId: string; insight: string | null }) => void
  onOpen?: (id: string) => void
  initialReferenceId?: string
}) {
  const quoted = offers.filter((o) => o.premiumValue !== null)
  const defaultRef =
    initialReferenceId && offers.some((o) => o.id === initialReferenceId)
      ? initialReferenceId
      : [...quoted].sort((a, b) => (a.premiumValue ?? 0) - (b.premiumValue ?? 0))[0]?.id ?? offers[0]?.id

  const [referenceId, setReferenceId] = useState(defaultRef)
  const [mobileAltId, setMobileAltId] = useState<string | null>(null)
  const [shareOpen, setShareOpen] = useState(false)

  const reference = offers.find((o) => o.id === referenceId) ?? offers[0]
  const alternatives = offers.filter((o) => o.id !== reference?.id)
  const mobileAlt = alternatives.find((o) => o.id === (mobileAltId ?? alternatives[0]?.id)) ?? alternatives[0]

  /** Desktop order: first alt | reference | remaining alts (centre the chosen reference). */
  const desktopOrder = useMemo(() => {
    if (!reference) return offers
    const alts = offers.filter((o) => o.id !== reference.id)
    const left = alts[0]
    const right = alts.slice(1)
    return [left, reference, ...right].filter(Boolean) as ComparisonOffer[]
  }, [offers, reference])

  const insight = useMemo(() => {
    if (!reference || !alternatives.length) return null
    const peer = alternatives[0]
    const prem = moneyDiff(peer.premiumValue, reference.premiumValue)
    const ex = moneyDiff(reference.excessValue, peer.excessValue)
    if (prem === null) return `Review ${reference.insurerName} as your reference offer.`
    const save = prem > 0
    const premText = `R${Math.abs(prem).toLocaleString('en-ZA')}`
    const excessBit =
      ex !== null && ex !== 0
        ? ` with R${Math.abs(ex).toLocaleString('en-ZA')} ${ex > 0 ? 'more' : 'less'} excess`
        : ''
    return save
      ? `Compared with ${peer.label}, save ${premText} monthly${excessBit}.`
      : `Compared with ${peer.label}, ${reference.label} is ${premText} more monthly${excessBit}.`
  }, [reference, alternatives])

  if (!reference) return null

  const openShare = () => {
    onShare?.({ referenceId: reference.id, insight })
    setShareOpen(true)
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold tracking-wide text-navy-500 uppercase">Quote comparison</p>
          <h2 className="font-display text-xl font-semibold text-navy-900 sm:text-2xl">Reference offer</h2>
          <p className="mt-0.5 text-sm text-navy-600">
            {[clientLabel, objectLabel].filter(Boolean).join(' · ') || 'Centre the offer you choose as reference.'}
          </p>
        </div>
        <Button size="sm" variant="accent" onClick={openShare}>
          <Share2 /> Share comparison
        </Button>
      </div>

      {/* Desktop: alternatives | reference | alternatives */}
      <div className="hidden gap-3 lg:grid lg:grid-cols-3">
        {desktopOrder.map((o) => {
          const isRef = o.id === reference.id
          return (
            <OfferCard
              key={o.id}
              offer={o}
              isRef={isRef}
              onMakeReference={() => setReferenceId(o.id)}
              onOpen={onOpen}
              onSelect={onSelect}
            />
          )
        })}
      </div>

      {/* Mobile: reference sticky + one alternative */}
      <div className="space-y-3 lg:hidden">
        <OfferBlock offer={reference} badge="Reference" emphasize />
        {alternatives.length > 0 && (
          <>
            <label className="block text-xs font-semibold text-navy-600">
              Compare with
              <select
                className="field mt-1 w-full"
                value={mobileAlt?.id ?? ''}
                onChange={(e) => setMobileAltId(e.target.value)}
              >
                {alternatives.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.insurerName} · {a.label}
                  </option>
                ))}
              </select>
            </label>
            {mobileAlt && (
              <div className="rounded-2xl border border-navy-800/10 bg-white p-3">
                <FieldCompare label="Monthly premium" left={reference.premiumLabel} right={mobileAlt.premiumLabel} />
                <FieldCompare label="Excess" left={reference.excessLabel} right={mobileAlt.excessLabel} />
                {(reference.coverLabel || mobileAlt.coverLabel) && (
                  <FieldCompare label="Cover" left={reference.coverLabel ?? '—'} right={mobileAlt.coverLabel ?? '—'} />
                )}
                <FieldCompare
                  label="Benefits"
                  left={(reference.benefits ?? []).join(', ') || '—'}
                  right={(mobileAlt.benefits ?? []).join(', ') || '—'}
                />
                <Button size="sm" variant="outline" className="mt-3" onClick={() => setReferenceId(mobileAlt.id)}>
                  Make {mobileAlt.label} reference
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {insight && <CopilotNudge>{insight}</CopilotNudge>}

      {shareOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-navy-900/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Customer comparison preview"
          onClick={() => setShareOpen(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-navy-800/10 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[10px] font-bold tracking-wide text-navy-500 uppercase">Customer preview</p>
                <h3 className="font-display text-lg font-semibold text-navy-900">Your quote comparison</h3>
                <p className="text-sm text-navy-600">{[clientLabel, objectLabel].filter(Boolean).join(' · ')}</p>
              </div>
              <Button size="sm" variant="ghost" type="button" aria-label="Close" onClick={() => setShareOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-4 space-y-3">
              <OfferBlock offer={reference} badge="Selected reference" emphasize />
              {alternatives.map((a) => (
                <OfferBlock key={a.id} offer={a} badge="Alternative" />
              ))}
            </div>
            {insight && (
              <p className="mt-4 rounded-xl bg-brand-50 px-3 py-2 text-sm text-navy-800">{insight}</p>
            )}
            <p className="mt-3 text-xs text-navy-500">Demo preview — not sent to the customer.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="accent"
                onClick={async () => {
                  const text = [
                    `Quote comparison for ${clientLabel ?? 'client'}`,
                    `Reference: ${reference.insurerName} · ${reference.premiumLabel} · excess ${reference.excessLabel}`,
                    insight,
                  ]
                    .filter(Boolean)
                    .join('\n')
                  try {
                    await navigator.clipboard.writeText(text)
                  } catch {
                    /* ignore */
                  }
                  setShareOpen(false)
                }}
              >
                Copy summary
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShareOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function OfferCard({
  offer,
  isRef,
  onMakeReference,
  onOpen,
  onSelect,
}: {
  offer: ComparisonOffer
  isRef: boolean
  onMakeReference: () => void
  onOpen?: (id: string) => void
  onSelect?: (id: string) => void
}) {
  return (
    <article
      className={cn(
        'rounded-2xl border bg-white p-4 shadow-sm transition',
        isRef ? 'border-brand-500 bg-brand-50/40 ring-2 ring-brand-500/30' : 'border-navy-800/10',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold tracking-wide text-navy-500 uppercase">
            {isRef ? 'Reference' : 'Alternative'}
          </p>
          <p className="mt-1 text-sm font-semibold text-navy-900">{offer.insurerName}</p>
          <p className="text-xs text-navy-500">{offer.label}</p>
        </div>
        {isRef && (
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-700 px-2 py-0.5 text-[10px] font-bold text-white uppercase">
            <Check className="h-3 w-3" /> Selected
          </span>
        )}
      </div>
      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between gap-2">
          <dt className="text-navy-500">Monthly premium</dt>
          <dd className="font-semibold tabular-nums text-navy-900">{offer.premiumLabel}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-navy-500">Excess</dt>
          <dd className="font-semibold tabular-nums text-navy-900">{offer.excessLabel}</dd>
        </div>
        {offer.coverLabel && (
          <div className="flex justify-between gap-2">
            <dt className="text-navy-500">Cover</dt>
            <dd className="text-navy-800">{offer.coverLabel}</dd>
          </div>
        )}
        <div className="flex justify-between gap-2">
          <dt className="text-navy-500">Benefits</dt>
          <dd className="text-right text-navy-800">{(offer.benefits ?? []).join(' · ') || '—'}</dd>
        </div>
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        {!isRef && (
          <Button size="sm" variant="outline" onClick={onMakeReference}>
            Make reference
          </Button>
        )}
        {onOpen && (
          <Button size="sm" variant={isRef ? 'accent' : 'ghost'} onClick={() => onOpen(offer.id)}>
            View offer
          </Button>
        )}
        {isRef && onSelect && (
          <Button size="sm" variant="accent" onClick={() => onSelect(offer.id)}>
            Use this offer
          </Button>
        )}
      </div>
    </article>
  )
}

function OfferBlock({
  offer,
  badge,
  emphasize,
}: {
  offer: ComparisonOffer
  badge: string
  emphasize?: boolean
}) {
  return (
    <article
      className={cn(
        'rounded-2xl border bg-white p-4 shadow-sm',
        emphasize ? 'border-brand-500 ring-2 ring-brand-500/25' : 'border-navy-800/10',
      )}
    >
      <p className="text-[10px] font-bold tracking-wide text-brand-700 uppercase">{badge}</p>
      <p className="mt-1 font-semibold text-navy-900">{offer.insurerName}</p>
      <dl className="mt-3 space-y-1.5 text-sm">
        <div className="flex justify-between">
          <dt className="text-navy-500">Monthly premium</dt>
          <dd className="font-semibold tabular-nums">{offer.premiumLabel}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-navy-500">Excess</dt>
          <dd className="font-semibold tabular-nums">{offer.excessLabel}</dd>
        </div>
        {(offer.benefits?.length ?? 0) > 0 && (
          <div className="flex justify-between gap-2">
            <dt className="text-navy-500">Benefits</dt>
            <dd className="text-right text-navy-800">{offer.benefits!.join(' · ')}</dd>
          </div>
        )}
      </dl>
    </article>
  )
}

function FieldCompare({ label, left, right }: { label: string; left: string; right: string }) {
  return (
    <div className="border-b border-navy-800/5 py-2 last:border-0">
      <p className="text-[10px] font-bold tracking-wide text-navy-500 uppercase">{label}</p>
      <p className="mt-0.5 text-sm text-navy-900">
        <span className="font-semibold">{left}</span>
        <span className="mx-1.5 text-navy-400">→</span>
        <span className="font-semibold">{right}</span>
      </p>
    </div>
  )
}
