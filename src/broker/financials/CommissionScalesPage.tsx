import { useMemo, useState } from 'react'
import { brokerFinancialsApi, useBfDemoContext, useBfMutation, useBfScales } from '@/copilot/brokerFinancialsApi'
import { Button } from '@/components/ui/button'
import { PageHeader, LoadingState, ErrorState } from '../PageHeader'
import { Page, Section, zar } from '../shared/ui'

export default function CommissionScalesPage() {
  const scales = useBfScales()
  const ctx = useBfDemoContext()
  const preview = useBfMutation(brokerFinancialsApi.previewScaleAmount)
  const upsert = useBfMutation(brokerFinancialsApi.upsertScaleVersion)
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null)
  const [selectedScaleId, setSelectedScaleId] = useState<string | null>(null)
  const [sample, setSample] = useState('1000')
  const [result, setResult] = useState<Record<string, unknown> | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    product_line: 'short_term_personal',
    cover_section: 'vehicle',
    earning_type: 'ongoing',
    calc_method: 'percent',
    rate: '0.10',
    effective_from: '2025-12-01',
    brokerage_pct: '70',
    adviser_pct: '30',
  })

  const rows = useMemo(() => (scales.data ?? []) as Array<{
    scale: Record<string, unknown>
    insurer_name: string | null
    versions: Array<{ version: Record<string, unknown>; splits: Array<Record<string, unknown>> }>
  }>, [scales.data])

  if (scales.isLoading) return <div className="p-6"><LoadingState /></div>
  if (scales.error) return <div className="p-6"><ErrorState message={scales.error.message} /></div>

  const saveVersion = () => {
    const brokerage = Number(form.brokerage_pct)
    const adviser = Number(form.adviser_pct)
    upsert.mutate(
      {
        scale_id: selectedScaleId || undefined,
        name: form.name || undefined,
        product_line: form.product_line,
        cover_section: form.cover_section,
        earning_type: form.earning_type,
        calc_method: form.calc_method,
        rate: form.rate,
        basis: 'eligible_monthly_premium',
        effective_from: form.effective_from,
        splits: [
          { recipient_role: 'brokerage', recipient_name: 'Brokerage', share_percent: brokerage },
          { recipient_role: 'adviser', recipient_name: 'Adviser', share_percent: adviser },
        ],
      },
      {
        onSuccess: (r) => {
          setFlash(String(r.summary ?? 'Scale version saved'))
          setSelectedVersion(String(r.version_id ?? ''))
        },
      },
    )
  }

  return (
    <Page>
      <PageHeader
        title="Commission & fee scales"
        description="Create and version scales that define what earns commission, how it is calculated, and who receives it. Changes apply from the version effective date."
      />
      {ctx.data?.is_demo_brokerage && (
        <p className="mb-3 text-xs text-amber-950">
          <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold">Demo</span>
          {' '}Scale create/version is Demo-only and never writes Production.
        </p>
      )}
      {flash && <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{flash}</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Active scales">
          <ul className="space-y-3">
            {rows.map((r) => {
              const v = r.versions[0]
              return (
                <li key={String(r.scale.id)} className="rounded-lg border border-navy-800/10 p-3 text-sm">
                  <p className="font-semibold text-navy-900">{String(r.scale.name)}</p>
                  <p className="text-xs text-navy-600">
                    {r.insurer_name ?? 'Any insurer'} · {String(r.scale.product_line ?? 'any product')} · {String(r.scale.cover_section ?? 'any section')}
                  </p>
                  {v && (
                    <>
                      <p className="mt-2 text-xs text-navy-700">
                        v{String(v.version.version_no)} · {String(v.version.earning_type)} · {String(v.version.calc_method)} ·{' '}
                        {v.version.rate != null ? `${(Number(v.version.rate) * 100).toFixed(1)}%` : zar(Number(v.version.fixed_amount ?? 0), true)} of {String(v.version.basis).replace(/_/g, ' ')}
                        {' · from '}{String(v.version.effective_from)}
                      </p>
                      <ul className="mt-1 text-xs text-navy-600">
                        {v.splits.map((s) => (
                          <li key={String(s.id)}>
                            {String(s.recipient_name ?? s.recipient_role)} {String(s.share_percent)}%
                            {s.section_scope ? ` (section ${String(s.section_scope)})` : ''}
                          </li>
                        ))}
                      </ul>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => setSelectedVersion(String(v.version.id))}>
                          Select for preview
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedScaleId(String(r.scale.id))
                            setForm((f) => ({
                              ...f,
                              name: String(r.scale.name),
                              product_line: String(r.scale.product_line ?? f.product_line),
                              cover_section: String(r.scale.cover_section ?? f.cover_section),
                            }))
                          }}
                        >
                          New version on this scale
                        </Button>
                      </div>
                    </>
                  )}
                </li>
              )
            })}
            {rows.length === 0 && <p className="text-sm text-navy-600">No scales in this brokerage yet.</p>}
          </ul>
        </Section>
        <div className="space-y-4">
          <Section title="Preview against sample amount">
            <p className="mb-2 text-xs text-navy-600">Selected version: {selectedVersion ?? 'none'}</p>
            <label className="block text-sm">
              Sample eligible amount (ZAR)
              <input
                className="mt-1 w-full rounded-lg border border-navy-800/15 px-3 py-2"
                value={sample}
                onChange={(e) => setSample(e.target.value)}
              />
            </label>
            <Button
              className="mt-3"
              size="sm"
              disabled={!selectedVersion || preview.isPending}
              onClick={() =>
                preview.mutate(
                  { scale_version_id: selectedVersion!, sample_amount: Number(sample) },
                  { onSuccess: (r) => setResult(r) },
                )
              }
            >
              Preview
            </Button>
            {result && (
              <div className="mt-3 rounded-lg border border-navy-800/10 p-3 text-sm">
                <p>Gross {zar(Number(result.gross_amount), true)} on {zar(Number(result.eligible_amount), true)}</p>
                <ul className="mt-2 space-y-1 text-xs">
                  {((result.splits as Array<Record<string, unknown>>) ?? []).map((s, i) => (
                    <li key={i}>{String(s.recipient_role)} {String(s.share_percent)}% → {zar(Number(s.amount), true)}</li>
                  ))}
                </ul>
              </div>
            )}
          </Section>
          <Section title={selectedScaleId ? 'Add version' : 'Create scale + version'}>
            <p className="mb-2 text-xs text-navy-600">
              Splits must total 100%. Demo-only write.
              {selectedScaleId ? ` Editing scale ${selectedScaleId.slice(0, 8)}…` : ''}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs font-semibold text-navy-600">
                Name
                <input className="mt-1 w-full rounded-lg border border-navy-800/15 p-2 text-sm" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Motor ongoing 10%" />
              </label>
              <label className="text-xs font-semibold text-navy-600">
                Effective from
                <input type="date" className="mt-1 w-full rounded-lg border border-navy-800/15 p-2 text-sm" value={form.effective_from} onChange={(e) => setForm({ ...form, effective_from: e.target.value })} />
              </label>
              <label className="text-xs font-semibold text-navy-600">
                Product line
                <input className="mt-1 w-full rounded-lg border border-navy-800/15 p-2 text-sm" value={form.product_line} onChange={(e) => setForm({ ...form, product_line: e.target.value })} />
              </label>
              <label className="text-xs font-semibold text-navy-600">
                Cover section
                <input className="mt-1 w-full rounded-lg border border-navy-800/15 p-2 text-sm" value={form.cover_section} onChange={(e) => setForm({ ...form, cover_section: e.target.value })} />
              </label>
              <label className="text-xs font-semibold text-navy-600">
                Rate (e.g. 0.10)
                <input className="mt-1 w-full rounded-lg border border-navy-800/15 p-2 text-sm" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} />
              </label>
              <label className="text-xs font-semibold text-navy-600">
                Earning type
                <select className="mt-1 w-full rounded-lg border border-navy-800/15 p-2 text-sm" value={form.earning_type} onChange={(e) => setForm({ ...form, earning_type: e.target.value })}>
                  <option value="ongoing">Ongoing</option>
                  <option value="new_business">New business</option>
                  <option value="renewal">Renewal</option>
                  <option value="endorsement">Endorsement</option>
                  <option value="service_fee">Service fee</option>
                </select>
              </label>
              <label className="text-xs font-semibold text-navy-600">
                Brokerage %
                <input className="mt-1 w-full rounded-lg border border-navy-800/15 p-2 text-sm" value={form.brokerage_pct} onChange={(e) => setForm({ ...form, brokerage_pct: e.target.value })} />
              </label>
              <label className="text-xs font-semibold text-navy-600">
                Adviser %
                <input className="mt-1 w-full rounded-lg border border-navy-800/15 p-2 text-sm" value={form.adviser_pct} onChange={(e) => setForm({ ...form, adviser_pct: e.target.value })} />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" disabled={upsert.isPending || (!form.name && !selectedScaleId)} onClick={saveVersion}>
                {selectedScaleId ? 'Save new version' : 'Create scale'}
              </Button>
              {selectedScaleId && (
                <Button size="sm" variant="ghost" onClick={() => setSelectedScaleId(null)}>Clear scale selection</Button>
              )}
            </div>
            {upsert.error && <p className="mt-2 text-xs text-red-700">{(upsert.error as Error).message}</p>}
          </Section>
        </div>
      </div>
    </Page>
  )
}
