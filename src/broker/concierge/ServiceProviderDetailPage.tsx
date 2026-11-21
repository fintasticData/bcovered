import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { JOB_STATUS_LABEL, useServiceProvider } from '@/api/serviceProviders'
import { ErrorState, LoadingState, PageHeader } from '../PageHeader'
import { Page } from '../shared/ui'
import { Button } from '@/components/ui/button'
import { ProviderFormDialog } from './ProviderFormDialog'

export default function ServiceProviderDetailPage() {
  const { providerId } = useParams()
  const detail = useServiceProvider(providerId)
  const [editOpen, setEditOpen] = useState(false)

  if (detail.isLoading) return <Page><LoadingState label="Opening provider…" /></Page>
  if (detail.error || !detail.data) {
    return <Page><ErrorState message={detail.error?.message ?? 'Provider not found'} /></Page>
  }

  const p = detail.data

  return (
    <Page>
      <PageHeader
        title={p.trading_name}
        description={`${p.contact_person ?? 'No contact person'} · ${p.active ? 'Active' : 'Inactive'}${p.preferred ? ' · Preferred' : ''}`}
        actions={
          <>
            <Button size="sm" variant="outline" asChild>
              <Link to="/broker/concierge/providers">Directory</Link>
            </Button>
            <Button size="sm" onClick={() => setEditOpen(true)}>
              Edit
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-2xl border border-navy-800/10 bg-white p-4 lg:col-span-2 space-y-4">
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="text-navy-500">Phone</dt><dd className="font-semibold text-navy-900">{p.phone ?? '—'}</dd></div>
            <div><dt className="text-navy-500">Email</dt><dd className="font-semibold text-navy-900">{p.email ?? '—'}</dd></div>
            <div><dt className="text-navy-500">Trades</dt><dd className="font-semibold text-navy-900">{p.trades.map((t) => t.label).join(', ') || '—'}</dd></div>
            <div><dt className="text-navy-500">Areas</dt><dd className="font-semibold text-navy-900">{p.areas.map((a) => a.area_label).join(', ') || '—'}</dd></div>
            <div><dt className="text-navy-500">Standard call-out</dt><dd className="font-semibold text-navy-900">{p.standard_callout_fee_zar != null ? `R ${p.standard_callout_fee_zar}` : '—'}</dd></div>
            <div><dt className="text-navy-500">After-hours</dt><dd className="font-semibold text-navy-900">{p.after_hours_available ? (p.after_hours_callout_fee_zar != null ? `Yes · R ${p.after_hours_callout_fee_zar}` : 'Yes') : 'No'}</dd></div>
          </dl>
          {p.internal_notes && (
            <div>
              <h3 className="text-sm font-semibold text-navy-900">Internal notes</h3>
              <p className="mt-1 text-sm text-navy-700 whitespace-pre-wrap">{p.internal_notes}</p>
            </div>
          )}
          {p.panels.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-navy-900">Insurer panels</h3>
              <ul className="mt-1 space-y-1 text-sm text-navy-800">
                {p.panels.map((pan) => (
                  <li key={pan.id}>{pan.insurer_name} · {pan.trade_label}{pan.active ? '' : ' (inactive)'}</li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-navy-800/10 bg-white p-4">
            <h3 className="text-sm font-semibold text-navy-900">Current jobs</h3>
            <ul className="mt-2 space-y-2 text-sm">
              {(p.jobs_current ?? []).map((j) => (
                <li key={j.id} className="rounded-xl bg-navy-50/80 px-3 py-2">
                  <p className="font-medium text-navy-900">{j.trade_label}</p>
                  <p className="text-xs text-navy-600">{JOB_STATUS_LABEL[j.status]} · {j.service_address}</p>
                  {j.concierge_request_id && (
                    <Link className="text-xs font-semibold text-brand-700 underline" to={`/broker/concierge/${j.concierge_request_id}`}>
                      Open request
                    </Link>
                  )}
                </li>
              ))}
              {(p.jobs_current ?? []).length === 0 && <li className="text-navy-600">No open jobs.</li>}
            </ul>
          </section>
          <section className="rounded-2xl border border-navy-800/10 bg-white p-4">
            <h3 className="text-sm font-semibold text-navy-900">History</h3>
            <ul className="mt-2 space-y-2 text-sm">
              {(p.jobs_history ?? []).slice(0, 8).map((j) => (
                <li key={j.id} className="rounded-xl bg-navy-50/80 px-3 py-2">
                  <p className="font-medium text-navy-900">{j.trade_label}</p>
                  <p className="text-xs text-navy-600">{JOB_STATUS_LABEL[j.status]}</p>
                </li>
              ))}
              {(p.jobs_history ?? []).length === 0 && <li className="text-navy-600">No completed jobs yet.</li>}
            </ul>
          </section>
        </aside>
      </div>

      <ProviderFormDialog open={editOpen} onClose={() => setEditOpen(false)} initial={p} onSaved={() => { setEditOpen(false); void detail.refetch() }} />
    </Page>
  )
}
