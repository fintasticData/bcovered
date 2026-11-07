import { useState } from 'react'
import { GitCompareArrows, Loader2, Pencil } from 'lucide-react'
import type { TwinWorkspace } from '@/api/client'
import { useCompareTwin, useUpdateAsset } from '@/api/hooks'
import { ProvenanceBadge } from '@/components/commercial/badges'
import { StatusBadge, humanise } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { formatDateTime } from '@/lib/utils'
import type { CommercialAsset, ValueBasis } from '@/server/db/commercialSchema'
import { Card, InlineError, money } from './shared'

const show = (v: unknown) => {
  if (v === null || v === undefined) return '–'
  if (typeof v === 'number') return v > 10_000 ? money(v) : String(v)
  if (typeof v === 'string') return v
  return Object.entries(v as Record<string, unknown>)
    .map(([k, x]) => `${humanise(k)}: ${Array.isArray(x) ? x.join(', ') || 'none' : typeof x === 'number' && x > 10_000 ? money(x) : String(x)}`)
    .join(' · ')
}

export function ChangesTab({ w }: { w: TwinWorkspace }) {
  const compare = useCompareTwin()
  const byRun = w.changes.reduce<Record<string, typeof w.changes>>((m, c) => ({ ...m, [c.created_at.slice(0, 16)]: [...(m[c.created_at.slice(0, 16)] ?? []), c] }), {})
  return (
    <div className="space-y-4">
      <Card
        title="Change detection"
        description={w.baseline ? `Baseline: ${w.baseline.label}. Compared with the business records as they are now.` : 'Build the Twin or sign off an assessment to create a baseline.'}
        action={
          <Button size="sm" variant="accent" onClick={() => compare.mutate(w.business.profile.id)} disabled={compare.isPending || !w.baseline}>
            {compare.isPending ? <Loader2 className="animate-spin" /> : <GitCompareArrows />} Compare with the last assessment
          </Button>
        }
      >
        <InlineError error={compare.error} />
        {compare.data && (
          <p className="mb-3 text-xs text-emerald-700">
            {compare.data.changes.length ? `${compare.data.changes.length} changes found; ${compare.data.tasks_created} new broker review tasks.` : 'No changes since the baseline.'}
          </p>
        )}
        {Object.keys(byRun).length ? (
          <div className="space-y-4">
            {Object.entries(byRun).map(([at, changes]) => (
              <div key={at}>
                <p className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Report of {formatDateTime(changes[0].created_at)}</p>
                <ul className="mt-1 divide-y divide-navy-800/5">
                  {changes.map((c) => (
                    <li key={c.id} className="py-2 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-navy-900">{c.label}</span>
                        <StatusBadge status={c.change_type} />
                      </div>
                      <p className="text-xs text-navy-700">{c.finding}</p>
                      <p className="mt-0.5 text-[11px] text-navy-500">
                        Previous: {show(c.before)} → Current: {show(c.after)}
                        {c.task_id ? ' · broker review task created' : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-navy-600">No change reports yet.</p>
        )}
      </Card>

      <Card title="Update business records" description="Changes are recorded with their source and picked up by the next comparison. Values you mark as verified are protected from agents.">
        <AssetEditor assets={w.business.assets} locations={Object.fromEntries(w.business.locations.map((l) => [l.id, l.name]))} />
      </Card>

      <Card title="Risk Twin versions" description="Each version keeps a snapshot of the records it was built from, so earlier assessments remain as evidence.">
        <ul className="divide-y divide-navy-800/5">
          {w.business.risk_versions.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span>
                <span className="font-medium text-navy-900">Version {v.version}</span>
                <span className="block text-xs text-navy-600">
                  Built {formatDateTime(v.created_at)} · {v.node_count} records · {v.edge_count} relationships
                </span>
              </span>
              <StatusBadge status={v.status} />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}

function AssetEditor({ assets, locations }: { assets: CommercialAsset[]; locations: Record<string, string> }) {
  const update = useUpdateAsset()
  const [editing, setEditing] = useState<string | null>(null)
  const [qty, setQty] = useState('')
  const [value, setValue] = useState('')
  const [basis, setBasis] = useState<ValueBasis>('unknown')
  const [verified, setVerified] = useState(false)
  return (
    <div className="scroll-x -mx-5 px-5">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="text-left text-[11px] font-semibold tracking-wide text-navy-500 uppercase">
          <tr>
            <th className="py-1.5">Asset</th>
            <th className="py-1.5">Qty</th>
            <th className="py-1.5">Value</th>
            <th className="py-1.5">Basis</th>
            <th className="py-1.5">Source</th>
            <th className="py-1.5" aria-label="Actions" />
          </tr>
        </thead>
        <tbody className="divide-y divide-navy-800/5">
          {assets.map((a) =>
            editing === a.id ? (
              <tr key={a.id}>
                <td className="py-1.5 text-navy-900">{a.description}</td>
                <td className="py-1.5">
                  <input className="field h-8 w-16 py-0 text-xs" value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" aria-label="Quantity" />
                </td>
                <td className="py-1.5">
                  <input className="field h-8 w-32 py-0 text-xs" value={value} onChange={(e) => setValue(e.target.value)} inputMode="numeric" aria-label="Value in rand" />
                </td>
                <td className="py-1.5">
                  <select className="field h-8 py-0 text-xs" value={basis} onChange={(e) => setBasis(e.target.value as ValueBasis)} aria-label="Valuation basis">
                    {(['replacement', 'market', 'book', 'unknown'] as ValueBasis[]).map((b) => (
                      <option key={b}>{b}</option>
                    ))}
                  </select>
                </td>
                <td className="py-1.5 text-xs">
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} /> Verified
                  </label>
                </td>
                <td className="py-1.5">
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="accent"
                      disabled={update.isPending}
                      onClick={() =>
                        update.mutate(
                          {
                            asset_id: a.id,
                            quantity: Number(qty) || a.quantity,
                            declared_value: value.trim() === '' ? null : Number(value.replace(/[\s,R]/g, '')),
                            value_basis: basis,
                            verified,
                          },
                          { onSuccess: () => setEditing(null) },
                        )
                      }
                    >
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                  </div>
                </td>
              </tr>
            ) : (
              <tr key={a.id}>
                <td className="py-1.5 text-navy-900">
                  {a.description}
                  <span className="block text-[11px] text-navy-500">{a.location_id ? locations[a.location_id] : 'All sites'}</span>
                </td>
                <td className="py-1.5 text-navy-700">{a.quantity}</td>
                <td className="py-1.5 text-navy-700">{money(a.declared_value)}</td>
                <td className="py-1.5 text-navy-700">{a.value_basis}</td>
                <td className="py-1.5">
                  <ProvenanceBadge source={a.source} />
                </td>
                <td className="py-1.5">
                  <button
                    type="button"
                    className="cursor-pointer text-navy-500 hover:text-brand-600"
                    aria-label={`Edit ${a.description}`}
                    onClick={() => {
                      setEditing(a.id)
                      setQty(String(a.quantity))
                      setValue(a.declared_value === null ? '' : String(a.declared_value))
                      setBasis(a.value_basis)
                      setVerified(false)
                      update.reset()
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
      <InlineError error={update.error} />
    </div>
  )
}
