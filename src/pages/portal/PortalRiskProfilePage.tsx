import { Link, Navigate } from 'react-router-dom'
import { ArrowLeft, MapPin } from 'lucide-react'
import { ApiError } from '@/api/client'
import { usePortalBusiness } from '@/api/hooks'
import { AdviceNotice, CoverageBadge, ProvenanceBadge } from '@/components/commercial/badges'
import { humanise } from '@/components/StatusBadge'
import type { FieldSource } from '@/server/db/commercialSchema'
import { compactRand } from '@/server/domain/commercial/format'
import { rand } from '@/lib/quote'
import { ErrorState, LoadingState } from '@/broker/PageHeader'

const LEGEND: Array<[FieldSource, string]> = [
  ['verified', 'Checked by your broker against a document'],
  ['declared', 'What you told us, not yet checked'],
  ['inferred', 'Worked out by an agent; please confirm it'],
  ['missing', 'Still needed'],
]

export default function PortalRiskProfilePage() {
  const { data, isLoading, error } = usePortalBusiness()
  if (isLoading) return <div className="container-x py-10"><LoadingState /></div>
  if (error instanceof ApiError && error.code === 'not_found') return <Navigate to="/portal/business" replace />
  if (error || !data) return <div className="container-x py-10"><ErrorState message={error?.message ?? 'Could not load your risk profile'} /></div>
  const p = data.profile
  const src = (k: string): FieldSource => p.field_sources[k] ?? 'missing'
  const fields: Array<[string, string, FieldSource]> = [
    ['Registered name', p.registered_name, src('registered_name')],
    ['Trading name', p.trading_name ?? 'Not given', src('trading_name')],
    ['Industry', data.industry_name, src('industry_key')],
    ['Registration number', p.registration_number ?? 'Not given', src('registration_number')],
    ['VAT number', p.vat_number ?? 'Not given', src('vat_number')],
    ['Years trading', p.years_trading?.toString() ?? 'Not given', src('years_trading')],
    ['Annual turnover', p.annual_turnover !== null ? compactRand(p.annual_turnover) : 'Not given', src('annual_turnover')],
    ['Employees', p.employee_count?.toString() ?? 'Not given', src('employee_count')],
    ['Current insurer', p.existing_cover?.insurer ?? 'Not given', src('existing_cover')],
    ['Claims in five years', p.loss_history?.claims_last_5_years?.toString() ?? 'Not given', src('loss_history')],
  ]

  return (
    <div className="bg-mist">
      <div className="container-x py-10">
        <Link to="/portal/business" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600">
          <ArrowLeft className="h-3.5 w-3.5" /> Business portal
        </Link>
        <h1 className="mt-2 font-display text-3xl font-bold text-navy-900">Your business risk profile</h1>
        <p className="mt-2 max-w-3xl text-sm text-navy-600">
          This is how our agents understand {p.trading_name ?? p.registered_name}. Each detail shows where it came from, so you can see what still needs
          confirming. Tell your broker if anything is wrong.
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
                {fields.map(([k, v, s]) => (
                  <div key={k}>
                    <dt className="text-[11px] text-navy-500">{k}</dt>
                    <dd className="flex flex-wrap items-center gap-2 text-sm font-medium text-navy-900">
                      {v} <ProvenanceBadge source={s} />
                    </dd>
                  </div>
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
                      <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                        <span className="text-navy-800">{a.quantity > 1 ? `${a.quantity} × ` : ''}{a.description}</span>
                        <span className="flex items-center gap-2 text-xs text-navy-600">
                          {a.declared_value !== null ? rand(a.declared_value) : 'Value needed'} · {a.value_basis === 'unknown' ? 'basis not confirmed' : `${a.value_basis} value`}
                          <ProvenanceBadge source={a.declared_value === null ? 'missing' : a.source} />
                        </span>
                      </li>
                    ))}
                </ul>
              </section>
            ))}
          </div>

          <aside className="space-y-4">
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
