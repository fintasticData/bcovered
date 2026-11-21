import { useState, type FormEvent } from 'react'
import { RussCaseActions } from './RussCaseActions'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader, LoadingState, ErrorState } from '../PageHeader'
import { Page, zar } from '../shared/ui'
import { newKey, usePolicyClaimsMutation, useServiceRequestDetail, policyClaimsApi } from '@/copilot/policyClaimsApi'
import { brokerFinancialsApi, useBfMutation } from '@/copilot/brokerFinancialsApi'
import { StatusBadge } from '@/components/StatusBadge'

export default function ServiceRequestDetailPage() {
  const { requestId } = useParams<{ requestId: string }>()
  const { data, isLoading, error, refetch } = useServiceRequestDetail(requestId)
  const transition = usePolicyClaimsMutation(policyClaimsApi.transitionRequest)
  const confirm = usePolicyClaimsMutation(policyClaimsApi.confirmVehicleReplacement)
  const earn = useBfMutation(brokerFinancialsApi.confirmReplacementAndEarn)
  const [note, setNote] = useState('')
  const [earnFlash, setEarnFlash] = useState<string | null>(null)
  const [confirmForm, setConfirmForm] = useState({
    confirmed_effective_at: '',
    confirmation_source: 'insurer_email',
    insurer_reference: '',
    revised_premium: '',
    reason: '',
  })

  if (isLoading) return <div className="p-6"><LoadingState /></div>
  if (error || !data) return <div className="p-6"><ErrorState message={error?.message ?? 'Request not found'} /></div>

  const runTransition = (to: string) => {
    transition.mutate(
      { request_id: data.id, to_status: to, note: note || null, key: newKey() },
      { onSuccess: () => { setNote(''); void refetch() } },
    )
  }

  const submitConfirm = (e: FormEvent) => {
    e.preventDefault()
    confirm.mutate(
      {
        request_id: data.id,
        confirmed_effective_at: new Date(confirmForm.confirmed_effective_at).toISOString(),
        confirmation_source: confirmForm.confirmation_source,
        insurer_reference: confirmForm.insurer_reference || null,
        revised_premium: confirmForm.revised_premium ? Number(confirmForm.revised_premium) : null,
        key: newKey(),
      },
      { onSuccess: () => void refetch() },
    )
  }

  return (
    <Page>
      <PageHeader
        title={data.reference}
        description={`${data.customer_name} · ${data.client_number} · ${data.request_type.replace(/_/g, ' ')}`}
        actions={
          <>
            <Button size="sm" variant="outline" asChild>
              <Link to={`/broker/customers/people/${data.person_id}?rtab=policies`}><ArrowLeft /> Client</Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link to={`/broker/policies/${data.policy_id}`}>Policy</Link>
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge status={data.status} />
        <span className="text-xs text-navy-600">Next: {data.next_action ?? '—'}</span>
        {data.due_at && <span className="text-xs text-navy-600">Due {new Date(data.due_at).toLocaleDateString()}</span>}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel space-y-2 p-4">
          <h2 className="text-sm font-semibold">Current cover</h2>
          <pre className="overflow-auto rounded-lg bg-navy-50 p-3 text-xs text-navy-800">{JSON.stringify(data.current_snapshot ?? {}, null, 2)}</pre>
        </section>
        <section className="panel space-y-2 p-4">
          <h2 className="text-sm font-semibold">Requested change</h2>
          <pre className="overflow-auto rounded-lg bg-amber-50 p-3 text-xs text-navy-800">{JSON.stringify(data.requested_change ?? {}, null, 2)}</pre>
        </section>
      </div>

      <section className="panel mt-4 space-y-3 p-4">
        <h2 className="text-sm font-semibold">Workflow actions</h2>
        <textarea
          className="w-full rounded-lg border border-navy-800/15 p-2 text-sm"
          rows={2}
          placeholder="Note for this transition"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          {data.status === 'requested' && (
            <Button size="sm" onClick={() => runTransition('in_review')} disabled={transition.isPending}>Start review</Button>
          )}
          {['requested', 'in_review'].includes(data.status) && (
            <Button size="sm" variant="outline" onClick={() => runTransition('awaiting_customer')} disabled={transition.isPending}>Awaiting customer</Button>
          )}
          {['in_review', 'awaiting_customer'].includes(data.status) && (
            <Button size="sm" onClick={() => runTransition('awaiting_confirmation')} disabled={transition.isPending}>Sent to insurer</Button>
          )}
          {['requested', 'in_review', 'awaiting_customer', 'awaiting_confirmation'].includes(data.status) && (
            <>
              <Button size="sm" variant="outline" onClick={() => runTransition('declined')} disabled={transition.isPending}>Decline</Button>
              <Button size="sm" variant="outline" onClick={() => runTransition('withdrawn')} disabled={transition.isPending}>Withdraw</Button>
            </>
          )}
        </div>
        {transition.error && <p className="text-xs text-red-700">{(transition.error as Error).message}</p>}
      </section>

      {data.status === 'awaiting_confirmation' && (
        <form className="panel mt-4 space-y-3 p-4" onSubmit={submitConfirm}>
          <h2 className="text-sm font-semibold">Record confirmation</h2>
          <p className="text-xs text-navy-600">Creates a new policy version and endorsement. Safe to retry with the same key.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold text-navy-600">
              Confirmed effective
              <input required type="datetime-local" className="mt-1 w-full rounded-lg border border-navy-800/15 p-2 text-sm" value={confirmForm.confirmed_effective_at} onChange={(e) => setConfirmForm({ ...confirmForm, confirmed_effective_at: e.target.value })} />
            </label>
            <label className="text-xs font-semibold text-navy-600">
              Confirmation source
              <select className="mt-1 w-full rounded-lg border border-navy-800/15 p-2 text-sm" value={confirmForm.confirmation_source} onChange={(e) => setConfirmForm({ ...confirmForm, confirmation_source: e.target.value })}>
                <option value="insurer_email">Insurer email</option>
                <option value="insurer_portal">Insurer portal</option>
                <option value="authorised_party">Authorised party</option>
                <option value="phone">Phone</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-navy-600">
              Insurer reference
              <input className="mt-1 w-full rounded-lg border border-navy-800/15 p-2 text-sm" value={confirmForm.insurer_reference} onChange={(e) => setConfirmForm({ ...confirmForm, insurer_reference: e.target.value })} />
            </label>
            <label className="text-xs font-semibold text-navy-600">
              Revised premium (optional)
              <input type="number" step="0.01" className="mt-1 w-full rounded-lg border border-navy-800/15 p-2 text-sm" value={confirmForm.revised_premium} onChange={(e) => setConfirmForm({ ...confirmForm, revised_premium: e.target.value })} />
            </label>
          </div>
          <Button type="submit" size="sm" variant="accent" disabled={confirm.isPending}>Confirm replacement</Button>
          {confirm.error && <p className="text-xs text-red-700">{(confirm.error as Error).message}</p>}
          {confirm.isSuccess && <p className="text-xs text-emerald-800">Confirmation recorded.</p>}
        </form>
      )}

      {(data.status === 'confirmed' || confirm.isSuccess) && (
        <section className="panel mt-4 space-y-3 p-4">
          <h2 className="text-sm font-semibold">Post commission earning</h2>
          <p className="text-xs text-navy-600">
            Demo-only: updates the policy premium and posts the November earning on the active scale. Does not move real money.
          </p>
          <Button
            size="sm"
            variant="accent"
            disabled={earn.isPending || !data.policy_id}
            onClick={() => {
              const premium = confirmForm.revised_premium
                ? Number(confirmForm.revised_premium)
                : Number((data.requested_change as Record<string, unknown> | null)?.new_premium ?? 1400)
              earn.mutate(
                {
                  policy_id: data.policy_id,
                  new_premium: premium || 1400,
                  period: '2025-11-01',
                  section: 'vehicle',
                  event_ref: `bf:hv:earn:nov:${premium || 1400}`,
                  scenario_id: 'broker-financials-highveld',
                },
                {
                  onSuccess: (r) => {
                    setEarnFlash(String(r.summary ?? 'Earning posted'))
                    void refetch()
                  },
                },
              )
            }}
          >
            {earn.isPending ? 'Posting…' : `Update premium & post earning${confirmForm.revised_premium ? ` (${zar(Number(confirmForm.revised_premium), true)})` : ''}`}
          </Button>
          {earn.error && <p className="text-xs text-red-700">{(earn.error as Error).message}</p>}
          {earnFlash && (
            <p className="text-xs text-emerald-800">
              {earnFlash}{' '}
              <Link className="underline" to="/broker/financials?tab=transactions">Open broker financials</Link>
            </p>
          )}
        </section>
      )}

      <div className="mt-4">
        <RussCaseActions requestId={data.id} onChanged={() => void refetch()} />
      </div>

      <section className="panel mt-4 space-y-2 p-4">
        <h2 className="text-sm font-semibold">Activity</h2>
        <ul className="space-y-2 text-xs text-navy-700">
          {(data.events ?? []).map((ev) => (
            <li key={ev.id} className="rounded-lg border border-navy-800/10 px-3 py-2">
              <span className="font-semibold">{ev.event_type}</span>
              {ev.from_status && <> · {ev.from_status} → {ev.to_status}</>}
              <span className="text-navy-500"> · {new Date(ev.created_at).toLocaleString()}</span>
              {ev.note && <p className="mt-1">{ev.note}</p>}
            </li>
          ))}
        </ul>
      </section>
    </Page>
  )
}
