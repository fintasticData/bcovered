import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, Loader2, MapPin, Phone, Play, Square, Globe, X, Search } from 'lucide-react'
import {
  isFindFinished,
  providerFindApi,
  type FoundProvider,
  type ProviderFindRun,
} from '@/lib/providerFind/api'
import { useDataCategory } from '@/lib/supabase/category'
import { QeSuburbSelect } from '@/components/qe/QeSuburbSelect'
import { Button } from '@/components/ui/button'
import { RightSlideout } from '../shared/RightSlideout'
import { newServiceKey, useServiceTradeTypes } from '@/api/serviceProviders'
import { cn } from '@/lib/utils'

type Props = {
  open: boolean
  onClose: () => void
  onAdded?: (providerId: string) => void
  defaultArea?: string
  defaultTradeCode?: string
}

function ProviderCard({ p, justAdded }: { p: FoundProvider; justAdded?: boolean }) {
  const address =
    p.address_formatted ||
    [p.street_address, p.suburb, p.city, p.province, p.postal_code].filter(Boolean).join(', ')
  return (
    <li
      className={cn(
        'rounded-xl border bg-white p-3 transition-colors',
        justAdded ? 'border-emerald-300 bg-emerald-50/40' : 'border-navy-800/10',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-navy-950">{p.trading_name}</p>
          {address ? (
            <p className="mt-1 flex items-start gap-1.5 text-xs text-navy-600">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-navy-400" />
              <span>{address}</span>
            </p>
          ) : null}
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-navy-600">
            {p.phone ? (
              <span className="inline-flex items-center gap-1">
                <Phone className="h-3 w-3 text-navy-400" />
                {p.phone}
              </span>
            ) : null}
            {p.website ? (
              <span className="inline-flex items-center gap-1 truncate">
                <Globe className="h-3 w-3 shrink-0 text-navy-400" />
                <span className="truncate">{p.website.replace(/^https?:\/\//, '')}</span>
              </span>
            ) : null}
          </div>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
          <CheckCircle2 className="h-3 w-3" />
          {p.created === false ? 'Updated' : 'Added'}
        </span>
      </div>
    </li>
  )
}

/** Thin credit-card submit box; expands to a results slideout once a run starts. */
export function FindProvidersPanel({ open, onClose, onAdded, defaultArea = '', defaultTradeCode }: Props) {
  const category = useDataCategory()
  const trades = useServiceTradeTypes()
  const [area, setArea] = useState(defaultArea)
  const [tradeCode, setTradeCode] = useState(defaultTradeCode ?? '')
  const [count, setCount] = useState(10)
  const [runId, setRunId] = useState<string | null>(null)
  const [run, setRun] = useState<ProviderFindRun | null>(null)
  const [driving, setDriving] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [flashId, setFlashId] = useState<string | null>(null)

  const trade = useMemo(
    () => (trades.data ?? []).find((t) => t.code === tradeCode || t.id === tradeCode) ?? null,
    [trades.data, tradeCode],
  )

  useEffect(() => {
    if (!open) return
    setArea(defaultArea)
    setTradeCode(defaultTradeCode ?? '')
    setError(null)
    setNote(null)
  }, [open, defaultArea, defaultTradeCode])

  useEffect(() => {
    if (!runId || !category || !driving) return
    let cancelled = false
    const tick = async () => {
      try {
        const step = await providerFindApi.step(runId, category)
        if (cancelled) return
        setRun(step.run)
        const added = step.last_added ?? step.run.outputs?.last_added
        if (added?.id) {
          setFlashId(added.id)
          onAdded?.(added.id)
          setTimeout(() => {
            if (!cancelled) setFlashId((id) => (id === added.id ? null : id))
          }, 1600)
        }
        if (step.done || isFindFinished(step.run)) {
          setDriving(false)
          setNote(step.run.outputs?.summary ?? 'Directory search complete.')
          return
        }
        setTimeout(() => {
          if (!cancelled) void tick()
        }, 350)
      } catch (e) {
        if (!cancelled) {
          setDriving(false)
          setError(e instanceof Error ? e.message : 'Search paused')
        }
      }
    }
    void tick()
    return () => {
      cancelled = true
    }
  }, [runId, category, driving, onAdded])

  const start = async () => {
    if (!category || !area.trim() || !trade?.id) {
      if (!trade?.id) setError('Choose a trade.')
      return
    }
    setStarting(true)
    setError(null)
    setNote(null)
    setFlashId(null)
    try {
      const r = await providerFindApi.create({
        category,
        area: area.trim(),
        tradeTypeId: trade.id,
        tradeCode: trade.code,
        tradeLabel: trade.label,
        requestedCount: Math.min(30, Math.max(3, count)),
        idempotencyKey: `provfind-${newServiceKey()}`,
      })
      setRunId(r.id)
      setRun(r)
      setDriving(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start search')
    } finally {
      setStarting(false)
    }
  }

  const cancel = async () => {
    if (!runId || !category) return
    try {
      const r = await providerFindApi.cancel(runId, category)
      setRun(r)
      setDriving(false)
      setNote('Search cancelled.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Cancel failed')
    }
  }

  const reset = () => {
    setRunId(null)
    setRun(null)
    setNote(null)
    setError(null)
    setDriving(false)
  }

  const finished = run ? isFindFinished(run) : false
  const saved = run?.outputs?.saved ?? []
  const progress = run?.outputs?.progress
  const rejected = run?.outputs?.rejected ?? []
  const hasRun = Boolean(runId)
  const briefLocked = hasRun && !finished

  if (!open) return null

  const submitCard = (
    <div
      className="pointer-events-auto w-[min(22rem,calc(100vw-1.5rem))] rounded-2xl border border-navy-800/15 bg-white shadow-xl"
      role="dialog"
      aria-label="Find providers"
    >
      <div className="flex items-center justify-between gap-2 border-b border-navy-800/10 px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-navy-900">Find providers</p>
          <p className="truncate text-[11px] text-navy-500">Area + trade · auto-add to directory</p>
        </div>
        <Button size="sm" variant="ghost" type="button" aria-label="Close" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="space-y-2 p-3">
        <QeSuburbSelect
          value={area}
          valueMode="area"
          onChange={setArea}
          placeholder="Suburb / area"
          disabled={briefLocked}
          required
        />
        <div className="flex gap-2">
          <select
            className="field min-w-0 flex-1"
            value={tradeCode}
            onChange={(e) => setTradeCode(e.target.value)}
            disabled={briefLocked}
            aria-label="Trade"
          >
            <option value="">Trade</option>
            {(trades.data ?? []).map((t) => (
              <option key={t.id} value={t.code}>
                {t.label}
              </option>
            ))}
          </select>
          <input
            className="field w-14 shrink-0"
            type="number"
            min={3}
            max={30}
            value={count}
            aria-label="How many"
            onChange={(e) => setCount(Number(e.target.value) || 10)}
            disabled={briefLocked}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {!hasRun || finished ? (
            <Button
              size="sm"
              className="flex-1"
              disabled={starting || !area.trim() || !tradeCode}
              onClick={() => void start()}
            >
              {starting ? <Loader2 className="animate-spin" /> : <Play />}
              {finished ? 'Run again' : 'Build'}
            </Button>
          ) : (
            <>
              {!driving && (
                <Button size="sm" className="flex-1" onClick={() => setDriving(true)}>
                  <Play /> Resume
                </Button>
              )}
              <Button size="sm" variant="outline" className="flex-1" onClick={() => void cancel()}>
                <Square /> Stop
              </Button>
            </>
          )}
          {hasRun && finished && (
            <Button size="sm" variant="ghost" onClick={reset}>
              Clear
            </Button>
          )}
        </div>
        {note && <p className="text-[11px] text-navy-600">{note}</p>}
        {error && <p className="text-[11px] text-rose-700">{error}</p>}
        {hasRun && (
          <p className="text-[11px] text-brand-800">
            <Search className="mr-1 inline h-3 w-3" />
            {progress?.found ?? 0}/{progress?.requested ?? count} added — results on the right
          </p>
        )}
      </div>
    </div>
  )

  return (
    <>
      {createPortal(
        <div className="fixed inset-0 z-50 flex items-start justify-end p-3 pt-20 sm:pt-24">
          <button type="button" className="absolute inset-0 cursor-pointer bg-navy-900/25" aria-label="Close" onClick={onClose} />
          <div className="relative z-10">{submitCard}</div>
        </div>,
        document.body,
      )}

      <RightSlideout
        open={hasRun}
        onClose={() => {
          if (driving) void cancel()
          else if (finished) reset()
          else onClose()
        }}
        title="Directory results"
        subtitle={driving ? progress?.step || 'Adding…' : finished ? 'Done' : 'Paused'}
        size="results"
        footer={null}
      >
        <div className="space-y-3">
          <div className="rounded-xl border border-navy-800/10 bg-white px-3 py-2">
            <div className="flex items-center justify-between gap-2 text-xs text-navy-600">
              <span className="font-semibold text-navy-800">
                {progress?.found ?? 0} of {progress?.requested ?? count} added
              </span>
              <span className={driving ? 'text-brand-700' : 'text-navy-500'}>
                {driving ? 'Live' : finished ? 'Done' : 'Paused'}
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-navy-100">
              <div
                className="h-full rounded-full bg-brand-600 transition-all duration-300"
                style={{
                  width: `${Math.min(
                    100,
                    ((progress?.found ?? 0) / Math.max(1, progress?.requested ?? count)) * 100,
                  )}%`,
                }}
              />
            </div>
          </div>

          <section>
            <h3 className="mb-2 text-[11px] font-semibold tracking-wide text-navy-500 uppercase">
              In directory · {saved.length}
            </h3>
            {saved.length === 0 ? (
              <p className="rounded-xl border border-dashed border-navy-800/15 bg-white px-3 py-8 text-center text-sm text-navy-600">
                {driving ? 'Searching and adding one at a time…' : 'No providers added yet.'}
              </p>
            ) : (
              <ul className="space-y-2">
                {[...saved].reverse().map((p) => (
                  <ProviderCard key={p.id} p={p} justAdded={flashId === p.id} />
                ))}
              </ul>
            )}
          </section>

          {rejected.length > 0 && (
            <details className="rounded-xl border border-navy-800/10 bg-white px-3 py-2 text-xs text-navy-600">
              <summary className="cursor-pointer font-medium text-navy-700">Skipped · {rejected.length}</summary>
              <ul className="mt-2 max-h-28 space-y-1 overflow-y-auto">
                {rejected.slice(-12).map((r, i) => (
                  <li key={`${r.trading_name}-${i}`}>
                    <span className="font-medium text-navy-800">{r.trading_name}</span>: {r.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </RightSlideout>
    </>
  )
}
