import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  newConciergeKey,
  STATUS_LABEL,
  useConciergeMutations,
  useConciergeRequest,
} from '@/api/concierge'
import { JOB_STATUS_LABEL } from '@/api/serviceProviders'
import { ErrorState, LoadingState, PageHeader } from '../PageHeader'
import { Page } from '../shared/ui'
import { Button } from '@/components/ui/button'
import { AllocateProviderPanel } from './AllocateProviderPanel'

export default function ConciergeRequestDetailPage() {
  const { requestId } = useParams()
  const [params] = useSearchParams()
  const detail = useConciergeRequest(requestId)
  const mut = useConciergeMutations()
  const [infoAction, setInfoAction] = useState('Upload receipt')
  const [infoMessage, setInfoMessage] = useState('Please upload proof of purchase.')
  const [teamId, setTeamId] = useState('')
  const [note, setNote] = useState('')
  const [outcome, setOutcome] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [allocateOpen, setAllocateOpen] = useState(
    () => params.get('allocate') === '1' || Boolean(params.get('preselectProvider')),
  )
  const [focusJobId, setFocusJobId] = useState<string | null>(null)

  if (detail.isLoading) return <Page><LoadingState label="Opening request…" /></Page>
  if (detail.error || !detail.data) {
    return <Page><ErrorState message={detail.error?.message ?? 'Not found'} /></Page>
  }

  const r = detail.data
  const partners = r.pilot_partners
  const selectedTeam = teamId || partners[0]?.team_id || ''
  const jobs = r.service_jobs ?? []

  const run = async (fn: () => Promise<unknown>) => {
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed')
    }
  }

  return (
    <Page>
      <PageHeader
        title={r.reference ?? 'Concierge request'}
        description={`${r.title} · ${r.customer_name ?? 'Customer'} · ${STATUS_LABEL[r.status]}`}
        actions={
          <>
            <Button size="sm" variant="outline" asChild>
              <Link to={`/broker/customers/people/${r.person_id}`}>Customer record</Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link to="/broker/concierge/providers">Service providers</Link>
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setFocusJobId(null)
                setAllocateOpen(true)
              }}
            >
              Allocate provider
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-2xl border border-navy-800/10 bg-white p-4 lg:col-span-2">
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="text-navy-500">Owner</dt><dd className="font-semibold text-navy-900">{r.owner_name ?? '—'}</dd></div>
            <div><dt className="text-navy-500">Next action</dt><dd className="font-semibold text-navy-900">{r.next_action ?? '—'}</dd></div>
            <div><dt className="text-navy-500">Item</dt><dd className="font-semibold text-navy-900">{r.item_label ?? '—'}</dd></div>
            <div><dt className="text-navy-500">Address</dt><dd className="font-semibold text-navy-900">{r.item_address ?? '—'}</dd></div>
            <div><dt className="text-navy-500">Servicing partner</dt><dd className="font-semibold text-navy-900">{r.servicing_insurer_name ?? '—'}</dd></div>
          </dl>

          <h3 className="mt-5 text-sm font-semibold text-navy-900">Service jobs</h3>
          {jobs.length === 0 ? (
            <p className="mt-2 text-sm text-navy-600">No physical service jobs yet. Use Allocate provider when a trade visit is needed.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {jobs.map((j) => (
                <li key={j.id} className="rounded-xl border border-navy-800/10 bg-navy-50/70 px-3 py-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-navy-950">
                        {j.trade_label} · {JOB_STATUS_LABEL[j.status]}
                      </p>
                      <p className="text-xs text-navy-600">{j.work_description}</p>
                      <p className="mt-1 text-xs text-navy-700">
                        {j.current_allocation?.provider_name ?? 'No provider yet'}
                        {j.appointment_at
                          ? ` · ${new Date(j.appointment_at).toLocaleString('en-ZA')}`
                          : ''}
                      </p>
                      <p className="mt-1 text-[11px] text-navy-500">
                        Authority: {j.authority_status ?? '—'} · Payer: {j.payment_responsibility ?? '—'}
                        {j.quoted_callout_fee_zar != null ? ` · Call-out R ${j.quoted_callout_fee_zar}` : ''}
                      </p>
                      {(j.allocations?.length ?? 0) > 1 && (
                        <p className="mt-1 text-[11px] text-navy-500">
                          Attempts:{' '}
                          {j.allocations.map((a) => `#${a.attempt_no} ${a.provider_name} (${a.status})`).join(' · ')}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setFocusJobId(j.id)
                          setAllocateOpen(true)
                        }}
                      >
                        {j.current_allocation ? 'Manage' : 'Allocate'}
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <h3 className="mt-5 text-sm font-semibold text-navy-900">Timeline</h3>
          <ol className="mt-2 space-y-2">
            {r.events.map((ev) => (
              <li key={ev.id} className="rounded-xl bg-navy-50/80 px-3 py-2 text-sm">
                <p className="text-navy-900">{ev.body ?? ev.event_type}</p>
                <p className="text-[11px] text-navy-500">
                  {ev.visibility} · {ev.author ?? 'System'} · {new Date(ev.created_at).toLocaleString('en-ZA')}
                </p>
              </li>
            ))}
          </ol>

          {r.documents.length > 0 && (
            <>
              <h3 className="mt-5 text-sm font-semibold text-navy-900">Documents</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {r.documents.map((d) => (
                  <li key={d.id} className="font-medium text-navy-800">{d.label}</li>
                ))}
              </ul>
            </>
          )}
        </section>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-navy-800/10 bg-white p-4">
            <h3 className="text-sm font-semibold text-navy-900">Request information</h3>
            <input className="field mt-2" value={infoAction} onChange={(e) => setInfoAction(e.target.value)} placeholder="Next action label" />
            <textarea className="field mt-2 min-h-[70px]" value={infoMessage} onChange={(e) => setInfoMessage(e.target.value)} />
            <Button
              size="sm"
              className="mt-2 w-full"
              disabled={mut.requestInfo.isPending}
              onClick={() =>
                void run(() =>
                  mut.requestInfo.mutateAsync({
                    requestId: r.id,
                    nextAction: infoAction,
                    message: infoMessage,
                    key: newConciergeKey(),
                  }),
                )
              }
            >
              Ask customer
            </Button>
          </section>

          <section className="rounded-2xl border border-navy-800/10 bg-white p-4">
            <h3 className="text-sm font-semibold text-navy-900">Refer to pilot partner</h3>
            <select className="field mt-2" value={selectedTeam} onChange={(e) => setTeamId(e.target.value)}>
              {partners.map((p) => (
                <option key={p.team_id} value={p.team_id}>
                  {p.insurer_name} · {p.name}
                </option>
              ))}
            </select>
            <textarea className="field mt-2 min-h-[60px]" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Handover note" />
            <Button
              size="sm"
              className="mt-2 w-full"
              disabled={!selectedTeam || mut.referPartner.isPending}
              onClick={() =>
                void run(() =>
                  mut.referPartner.mutateAsync({
                    requestId: r.id,
                    teamId: selectedTeam,
                    note,
                    key: newConciergeKey(),
                  }),
                )
              }
            >
              Refer
            </Button>
          </section>

          <section className="rounded-2xl border border-navy-800/10 bg-white p-4">
            <h3 className="text-sm font-semibold text-navy-900">Record outcome</h3>
            <textarea className="field mt-2 min-h-[60px]" value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="Outcome summary" />
            <Button
              size="sm"
              variant="outline"
              className="mt-2 w-full"
              disabled={!outcome || mut.recordOutcome.isPending}
              onClick={() =>
                void run(() =>
                  mut.recordOutcome.mutateAsync({
                    requestId: r.id,
                    summary: outcome,
                    completed: true,
                  }),
                )
              }
            >
              Complete request
            </Button>
          </section>

          {error && <p className="text-sm text-red-700">{error}</p>}
        </aside>
      </div>

      <AllocateProviderPanel
        request={r}
        open={allocateOpen}
        jobId={focusJobId}
        onClose={() => {
          setAllocateOpen(false)
          setFocusJobId(null)
          void detail.refetch()
        }}
      />
    </Page>
  )
}
