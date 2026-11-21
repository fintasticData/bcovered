import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useDemoAdvanceLeads } from '@/api/hooks'
import { Button } from '@/components/ui/button'
import { humanise } from '@/components/StatusBadge'
import { LEAD_PIPELINE_STAGES, type LeadStatus } from '@/server/db/schema'
import type { DemoAdvanceResult } from '@/server/api'

export function DemoAdvanceBar({
  selectedIds,
  clear,
}: {
  selectedIds: string[]
  clear: () => void
}) {
  const advance = useDemoAdvanceLeads()
  const [mode, setMode] = useState<'next' | 'to_stage'>('next')
  const [target, setTarget] = useState<Exclude<LeadStatus, 'closed'>>('offer_sent')
  const [results, setResults] = useState<DemoAdvanceResult[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = (opts: { close?: boolean }) => {
    setError(null)
    advance.mutate(
      {
        lead_ids: selectedIds,
        mode,
        target_stage: mode === 'to_stage' ? target : undefined,
        close: opts.close,
        close_reason: opts.close ? 'Demo closed' : undefined,
      },
      {
        onSuccess: (r) => setResults(r.results),
        onError: (e) => setError((e as Error).message),
      },
    )
  }

  const failed = results?.filter((r) => r.outcome === 'failed') ?? []

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-navy-800">{selectedIds.length} selected · Advance demo leads</span>
        <select className="field py-1 text-xs" value={mode} onChange={(e) => setMode(e.target.value as 'next' | 'to_stage')} aria-label="Advance mode">
          <option value="next">Next step</option>
          <option value="to_stage">Advance to stage</option>
        </select>
        {mode === 'to_stage' && (
          <select className="field py-1 text-xs" value={target} onChange={(e) => setTarget(e.target.value as Exclude<LeadStatus, 'closed'>)} aria-label="Target stage">
            {LEAD_PIPELINE_STAGES.map((s) => (
              <option key={s} value={s}>
                {humanise(s)}
              </option>
            ))}
          </select>
        )}
        <Button size="sm" variant="accent" disabled={advance.isPending || !selectedIds.length} onClick={() => run({})}>
          {advance.isPending ? 'Running…' : 'Run'}
        </Button>
        <Button size="sm" variant="outline" disabled={advance.isPending || !selectedIds.length} onClick={() => run({ close: true })}>
          Close demo leads
        </Button>
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
      {results && (
        <div className="rounded-lg border border-navy-800/10 bg-white px-3 py-2 text-xs text-navy-800">
          <p className="font-semibold text-navy-900">
            {results.filter((r) => r.outcome === 'advanced').length} advanced · {results.filter((r) => r.outcome === 'already_there').length} already there ·{' '}
            {results.filter((r) => r.outcome === 'skipped' || r.outcome === 'failed').length} need attention
          </p>
          <ul className="mt-2 max-h-40 space-y-1 overflow-auto">
            {results.map((r) => (
              <li key={r.lead_id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <Link className="font-medium text-brand-700 hover:underline" to={r.open_path}>
                    {r.customer_name}
                  </Link>{' '}
                  · {r.message}
                  {r.quote_id && (
                    <>
                      {' · '}
                      <Link className="text-brand-700 hover:underline" to={`/broker/quotes/${r.quote_id}`}>
                        Quote
                      </Link>
                    </>
                  )}
                </span>
                <span className="text-[11px] text-navy-500">{r.outcome}</span>
              </li>
            ))}
          </ul>
          {failed.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              disabled={advance.isPending}
              onClick={() =>
                advance.mutate(
                  { lead_ids: failed.map((f) => f.lead_id), mode, target_stage: mode === 'to_stage' ? target : undefined },
                  { onSuccess: (r) => setResults(r.results) },
                )
              }
            >
              Retry failed ({failed.length})
            </Button>
          )}
          <button type="button" className="mt-2 cursor-pointer text-[11px] font-semibold text-navy-600 hover:underline" onClick={() => { setResults(null); clear() }}>
            Dismiss
          </button>
        </div>
      )}
    </div>
  )
}
