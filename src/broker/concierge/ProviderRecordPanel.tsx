import { useState } from 'react'
import { Link } from 'react-router-dom'
import { JOB_STATUS_LABEL, useServiceProvider } from '@/api/serviceProviders'
import { LoadingState, ErrorState } from '../PageHeader'
import { Button } from '@/components/ui/button'
import { ProviderFormDialog } from './ProviderFormDialog'
import { StatusBadge } from '@/components/StatusBadge'

export function ProviderRecordPanel({
  providerId,
  onClose,
  onCreateJob,
}: {
  providerId: string
  onClose?: () => void
  onCreateJob?: () => void
}) {
  const detail = useServiceProvider(providerId)
  const [editOpen, setEditOpen] = useState(false)

  if (detail.isLoading) return <div className="p-4"><LoadingState label="Opening provider…" /></div>
  if (detail.error || !detail.data) {
    return <div className="p-4"><ErrorState message={detail.error?.message ?? 'Provider not found'} /></div>
  }

  const p = detail.data

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-xl font-bold text-navy-950">{p.trading_name}</h2>
            <StatusBadge status={p.active ? 'active' : 'inactive'} />
            {p.preferred && (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                Preferred
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-navy-600">
            {p.contact_person ?? 'No contact person'}
            {p.after_hours_available ? ' · After-hours available' : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {onClose && (
            <Button size="sm" variant="outline" onClick={onClose}>
              Close
            </Button>
          )}
          {onCreateJob && (
            <Button size="sm" variant="accent" onClick={onCreateJob}>
              Create job
            </Button>
          )}
          <Button size="sm" onClick={() => setEditOpen(true)}>
            Edit
          </Button>
        </div>
      </div>

      <section className="rounded-2xl border border-navy-800/10 bg-white p-4">
        <h3 className="text-xs font-semibold tracking-wide text-navy-500 uppercase">Contact & coverage</h3>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-[11px] font-semibold text-navy-500 uppercase">Phone</dt>
            <dd className="font-medium text-navy-900">{p.phone ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold text-navy-500 uppercase">Email</dt>
            <dd className="font-medium text-navy-900 break-all">{p.email ?? '—'}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-[11px] font-semibold text-navy-500 uppercase">Address</dt>
            <dd className="font-medium text-navy-900">
              {p.address_formatted ||
                [p.street_address, p.suburb, p.city, p.province, p.postal_code].filter(Boolean).join(', ') ||
                '—'}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold text-navy-500 uppercase">Website</dt>
            <dd className="font-medium text-navy-900 break-all">{p.website ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold text-navy-500 uppercase">Trades</dt>
            <dd className="mt-1 flex flex-wrap gap-1">
              {p.trades.map((t) => (
                <span key={t.id} className="rounded-full bg-navy-50 px-2 py-0.5 text-[11px] font-semibold text-navy-800">
                  {t.label}
                </span>
              ))}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold text-navy-500 uppercase">Areas</dt>
            <dd className="font-medium text-navy-900">{p.areas.map((a) => a.area_label).join(', ') || '—'}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold text-navy-500 uppercase">Standard call-out</dt>
            <dd className="font-medium text-navy-900">
              {p.standard_callout_fee_zar != null ? `R ${p.standard_callout_fee_zar}` : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold text-navy-500 uppercase">After-hours call-out</dt>
            <dd className="font-medium text-navy-900">
              {p.after_hours_callout_fee_zar != null ? `R ${p.after_hours_callout_fee_zar}` : '—'}
            </dd>
          </div>
        </dl>
        {p.internal_notes && (
          <div className="mt-4 rounded-xl bg-navy-50/80 px-3 py-2 text-sm text-navy-800 whitespace-pre-wrap">
            <p className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Internal notes</p>
            <p className="mt-1">{p.internal_notes}</p>
          </div>
        )}
      </section>

      {(p.panels?.length ?? 0) > 0 && (
        <section className="rounded-2xl border border-navy-800/10 bg-white p-4">
          <h3 className="text-xs font-semibold tracking-wide text-navy-500 uppercase">Insurer panels</h3>
          <ul className="mt-2 space-y-1 text-sm text-navy-800">
            {p.panels.map((pan) => (
              <li key={pan.id}>
                {pan.insurer_name} · {pan.trade_label}
                {!pan.active ? ' (inactive)' : ''}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-2xl border border-navy-800/10 bg-white p-4">
        <h3 className="text-xs font-semibold tracking-wide text-navy-500 uppercase">Current jobs</h3>
        <ul className="mt-2 space-y-2">
          {(p.jobs_current ?? []).map((j) => (
            <li key={j.id} className="rounded-xl border border-navy-800/10 bg-navy-50/70 px-3 py-2 text-sm">
              <p className="font-semibold text-navy-900">
                {j.trade_label} · {JOB_STATUS_LABEL[j.status]}
              </p>
              <p className="text-xs text-navy-600">{j.service_address}</p>
              {j.concierge_request_id && (
                <Link
                  className="mt-1 inline-block text-xs font-semibold text-brand-700 underline"
                  to={`/broker/concierge/${j.concierge_request_id}`}
                >
                  Open request
                </Link>
              )}
            </li>
          ))}
          {(p.jobs_current ?? []).length === 0 && (
            <li className="text-sm text-navy-600">No open jobs for this provider.</li>
          )}
        </ul>
      </section>

      <section className="rounded-2xl border border-navy-800/10 bg-white p-4">
        <h3 className="text-xs font-semibold tracking-wide text-navy-500 uppercase">History</h3>
        <ul className="mt-2 space-y-2">
          {(p.jobs_history ?? []).slice(0, 10).map((j) => (
            <li key={j.id} className="rounded-xl bg-navy-50/70 px-3 py-2 text-sm">
              <p className="font-medium text-navy-900">
                {j.trade_label} · {JOB_STATUS_LABEL[j.status]}
              </p>
            </li>
          ))}
          {(p.jobs_history ?? []).length === 0 && (
            <li className="text-sm text-navy-600">No completed jobs yet.</li>
          )}
        </ul>
      </section>

      <ProviderFormDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        initial={p}
        onSaved={() => {
          setEditOpen(false)
          void detail.refetch()
        }}
      />
    </div>
  )
}
