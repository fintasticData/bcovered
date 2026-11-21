import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { ArrowLeft, Check, Loader2, MapPin, Pencil, X } from 'lucide-react'
import { ApiError } from '@/api/client'
import { usePortalBusiness, useUpdatePortalAsset, useUpdatePortalProfile } from '@/api/hooks'
import { AdviceNotice, CoverageBadge, ProvenanceBadge } from '@/components/commercial/badges'
import { Button } from '@/components/ui/button'
import { humanise } from '@/components/StatusBadge'
import type { CommercialAsset, FieldSource, ValueBasis } from '@/server/db/commercialSchema'
import type { EditableProfileField } from '@/server/tools/business'
import { compactRand } from '@/server/domain/commercial/format'
import { rand } from '@/lib/quote'
import { formatDateTime } from '@/lib/utils'
import { ErrorState, LoadingState } from '@/broker/PageHeader'

const LEGEND: Array<[FieldSource, string]> = [
  ['verified', 'Checked by your broker against a document'],
  ['declared', 'What you told us, not yet checked'],
  ['inferred', 'Worked out by an agent; please confirm it'],
  ['missing', 'Still needed'],
]

const EDITABLE_FIELDS: Array<{ key: EditableProfileField; label: string; numeric: boolean; hint?: string }> = [
  { key: 'vat_number', label: 'VAT number', numeric: false, hint: '4123456789' },
  { key: 'years_trading', label: 'Years trading', numeric: true },
  { key: 'annual_turnover', label: 'Annual turnover', numeric: true },
  { key: 'employee_count', label: 'Employees', numeric: true },
]

const VALUE_BASIS: ValueBasis[] = ['replacement', 'market', 'book', 'unknown']

function displayProfileValue(key: EditableProfileField, value: string | number | null): string {
  if (value === null || value === '') return 'Not given'
  if (key === 'annual_turnover' && typeof value === 'number') return compactRand(value)
  return String(value)
}

export default function PortalRiskProfilePage() {
  const { data, isLoading, error } = usePortalBusiness()
  if (isLoading) return <div className="py-8"><LoadingState /></div>
  if (error instanceof ApiError && error.code === 'not_found') return <Navigate to="/my/business" replace />
  if (error || !data) return <div className="py-8"><ErrorState message={error?.message ?? 'Could not load your risk profile'} /></div>
  const p = data.profile
  const src = (k: string): FieldSource => p.field_sources[k] ?? 'missing'
  const readOnly: Array<[string, string, FieldSource]> = [
    ['Registered name', p.registered_name, src('registered_name')],
    ['Trading name', p.trading_name ?? 'Not given', src('trading_name')],
    ['Industry', data.industry_name, src('industry_key')],
    ['Registration number', p.registration_number ?? 'Not given', src('registration_number')],
    ['Current insurer', p.existing_cover?.insurer ?? 'Not given', src('existing_cover')],
    ['Claims in five years', p.loss_history?.claims_last_5_years?.toString() ?? 'Not given', src('loss_history')],
  ]

  return (
    <div className="bg-mist/60">
      <div className="py-6 sm:py-8">
        <Link to="/my/business" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600">
          <ArrowLeft className="h-3.5 w-3.5" /> My Business Page
        </Link>
        <h1 className="mt-2 font-display text-2xl font-bold text-navy-900 sm:text-3xl">Your business risk profile</h1>
        <p className="mt-2 max-w-3xl text-sm text-navy-600">
          This is how our agents understand {p.trading_name ?? p.registered_name}. Each detail shows where it came from.
          Correct anything that is wrong; verified details stay locked.
        </p>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
          {LEGEND.map(([s, t]) => (
            <span key={s} className="flex items-center gap-2 text-xs text-navy-700">
              <ProvenanceBadge source={s} /> {t}
            </span>
          ))}
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_1fr]">
          <div className="space-y-6">
            <section className="panel p-5">
              <h2 className="text-sm font-semibold text-navy-900">Business details</h2>
              <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                {readOnly.map(([k, v, s]) => (
                  <div key={k}>
                    <dt className="text-[11px] text-navy-500">{k}</dt>
                    <dd className="flex flex-wrap items-center gap-2 text-sm font-medium text-navy-900">
                      {v} <ProvenanceBadge source={s} />
                      {s === 'verified' && <span className="text-[10px] font-normal text-navy-500">Verified by your broker</span>}
                    </dd>
                  </div>
                ))}
                {EDITABLE_FIELDS.map((f) => (
                  <EditableProfileFieldRow
                    key={f.key}
                    field={f}
                    value={p[f.key]}
                    source={src(f.key)}
                  />
                ))}
              </dl>
            </section>

            {data.locations.map((l) => (
              <section key={l.id} className="panel p-5">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-navy-900">
                  <MapPin className="h-4 w-4 text-brand-500" /> {l.name}
                  <ProvenanceBadge source={l.source} />
                </h2>
                <p className="mt-1 text-xs text-navy-600">
                  {[l.suburb, l.city].filter(Boolean).join(', ')} · {l.ownership} · fire: {l.fire_protection.join(', ') || 'none recorded'} · security:{' '}
                  {l.security.join(', ') || 'none recorded'}
                </p>
                <ul className="mt-3 divide-y divide-navy-800/5 text-sm">
                  {data.assets
                    .filter((a) => a.location_id === l.id)
                    .map((a) => (
                      <EditableAssetRow key={a.id} asset={a} />
                    ))}
                </ul>
              </section>
            ))}

            {data.assets.some((a) => !a.location_id) && (
              <section className="panel p-5">
                <h2 className="text-sm font-semibold text-navy-900">Assets not tied to a location</h2>
                <ul className="mt-3 divide-y divide-navy-800/5 text-sm">
                  {data.assets
                    .filter((a) => !a.location_id)
                    .map((a) => (
                      <EditableAssetRow key={a.id} asset={a} />
                    ))}
                </ul>
              </section>
            )}
          </div>

          <aside className="space-y-4">
            <section className="panel p-5">
              <h2 className="text-sm font-semibold text-navy-900">Recent changes</h2>
              <p className="mt-1 text-xs text-navy-600">Corrections you or your broker make are kept with who changed them and when.</p>
              {data.recent_changes.length === 0 ? (
                <p className="mt-3 text-xs text-navy-500">No corrections yet.</p>
              ) : (
                <ul className="mt-3 space-y-2.5">
                  {data.recent_changes.map((c) => (
                    <li key={c.id} className="rounded-xl border border-navy-800/10 px-3 py-2">
                      <p className="text-sm font-medium text-navy-900">{c.field_label}</p>
                      <p className="mt-0.5 text-xs text-navy-700">
                        {c.from} → {c.to}
                      </p>
                      <p className="mt-1 text-[11px] text-navy-500">
                        by {c.actor_label} · {formatDateTime(c.at)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="panel p-5">
              <h2 className="text-sm font-semibold text-navy-900">Potential exposures your broker will review</h2>
              <p className="mt-1 text-xs text-navy-600">These are areas to discuss with your broker, not confirmed cover or advice.</p>
              <ul className="mt-3 space-y-3">
                {data.exposures.map((e) => (
                  <li key={e.id} className="rounded-xl border border-navy-800/10 p-3">
                    <p className="text-sm font-medium text-navy-900">{e.title}</p>
                    <p className="mt-0.5 text-xs text-navy-600">{e.description}</p>
                    <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <CoverageBadge status={e.coverage_status} />
                      <span className="text-[11px] text-navy-500">{humanise(e.category)}</span>
                    </p>
                  </li>
                ))}
              </ul>
            </section>
            <AdviceNotice />
          </aside>
        </div>
      </div>
    </div>
  )
}

function EditableProfileFieldRow({
  field,
  value,
  source,
}: {
  field: (typeof EDITABLE_FIELDS)[number]
  value: string | number | null
  source: FieldSource
}) {
  const update = useUpdatePortalProfile()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const locked = source === 'verified'

  const save = () => {
    const raw = draft.trim()
    const next = raw === '' ? null : field.numeric ? Number(raw.replace(/[\s,R]/g, '')) : raw
    if (field.numeric && next !== null && !Number.isFinite(next)) return
    update.mutate(
      { changes: { [field.key]: next } },
      {
        onSuccess: () => setEditing(false),
      },
    )
  }

  return (
    <div>
      <dt className="text-[11px] text-navy-500">{field.label}</dt>
      {editing && !locked ? (
        <dd className="mt-1 space-y-2">
          <input
            className="field py-2"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={field.hint}
            inputMode={field.numeric ? 'numeric' : undefined}
            aria-label={field.label}
            autoFocus
          />
          {update.error && <p className="text-xs font-medium text-red-600">{update.error.message}</p>}
          <div className="flex gap-2">
            <Button size="sm" variant="accent" onClick={save} disabled={update.isPending}>
              {update.isPending ? <Loader2 className="animate-spin" /> : <Check />} Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              <X /> Cancel
            </Button>
          </div>
        </dd>
      ) : (
        <dd className="flex flex-wrap items-center gap-2 text-sm font-medium text-navy-900">
          {displayProfileValue(field.key, value)}
          <ProvenanceBadge source={source} />
          {locked ? (
            <span className="text-[10px] font-normal text-navy-500">Verified by your broker</span>
          ) : (
            <button
              type="button"
              onClick={() => {
                setDraft(value === null ? '' : String(value))
                setEditing(true)
                update.reset()
              }}
              className="cursor-pointer text-navy-500 hover:text-brand-600"
              aria-label={`Edit ${field.label}`}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
        </dd>
      )}
    </div>
  )
}

function EditableAssetRow({ asset }: { asset: CommercialAsset }) {
  const update = useUpdatePortalAsset()
  const [editing, setEditing] = useState(false)
  const [valueDraft, setValueDraft] = useState('')
  const [basisDraft, setBasisDraft] = useState<ValueBasis>(asset.value_basis)
  const locked = asset.source === 'verified'
  const source: FieldSource = asset.declared_value === null ? 'missing' : asset.source

  const save = () => {
    const raw = valueDraft.trim()
    const declared_value = raw === '' ? null : Number(raw.replace(/[\s,R]/g, ''))
    if (declared_value !== null && !Number.isFinite(declared_value)) return
    update.mutate(
      { asset_id: asset.id, declared_value, value_basis: basisDraft },
      { onSuccess: () => setEditing(false) },
    )
  }

  return (
    <li className="py-2">
      {editing && !locked ? (
        <div className="space-y-2">
          <p className="text-navy-800">{asset.quantity > 1 ? `${asset.quantity} × ` : ''}{asset.description}</p>
          <div className="flex flex-wrap gap-2">
            <input
              className="field max-w-[10rem] py-2"
              value={valueDraft}
              onChange={(e) => setValueDraft(e.target.value)}
              placeholder="Declared value"
              inputMode="numeric"
              aria-label={`${asset.description} value`}
              autoFocus
            />
            <select
              className="field max-w-[10rem] py-2"
              value={basisDraft}
              onChange={(e) => setBasisDraft(e.target.value as ValueBasis)}
              aria-label={`${asset.description} value basis`}
            >
              {VALUE_BASIS.map((b) => (
                <option key={b} value={b}>
                  {b === 'unknown' ? 'basis not confirmed' : `${b} value`}
                </option>
              ))}
            </select>
          </div>
          {update.error && <p className="text-xs font-medium text-red-600">{update.error.message}</p>}
          <div className="flex gap-2">
            <Button size="sm" variant="accent" onClick={save} disabled={update.isPending}>
              {update.isPending ? <Loader2 className="animate-spin" /> : <Check />} Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              <X /> Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-navy-800">{asset.quantity > 1 ? `${asset.quantity} × ` : ''}{asset.description}</span>
          <span className="flex items-center gap-2 text-xs text-navy-600">
            {asset.declared_value !== null ? rand(asset.declared_value) : 'Value needed'} ·{' '}
            {asset.value_basis === 'unknown' ? 'basis not confirmed' : `${asset.value_basis} value`}
            <ProvenanceBadge source={source} />
            {locked ? (
              <span className="text-[10px] text-navy-500">Verified by your broker</span>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setValueDraft(asset.declared_value === null ? '' : String(asset.declared_value))
                  setBasisDraft(asset.value_basis)
                  setEditing(true)
                  update.reset()
                }}
                className="cursor-pointer text-navy-500 hover:text-brand-600"
                aria-label={`Edit ${asset.description} value`}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
          </span>
        </div>
      )}
    </li>
  )
}
