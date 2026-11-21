import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Plus, Search, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader, LoadingState, ErrorState } from '../PageHeader'
import { Page } from '../shared/ui'
import { useClaimsQueue } from '@/copilot/policyClaimsApi'
import { StatusBadge } from '@/components/StatusBadge'
import { RouteStartButtons } from '../routes/RouteActionsMenu'
import { ReportClaimSlideout } from '@/pages/my/ReportClaimSlideout'
import { ClaimsRussSlideout } from './ClaimsRussSlideout'

const BATCH_CAP = 12

export default function ClaimsQueuePage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const filter = params.get('filter') ?? ''
  const { data, isLoading, error, refetch } = useClaimsQueue({ query: q || null, filter: filter || null })
  const [selected, setSelected] = useState<string[]>([])
  const [slideoutOpen, setSlideoutOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const reportPersonId = params.get('personId')
  const reportPolicyId = params.get('policyId')

  useEffect(() => {
    const flag = params.get('reportClaim')
    if (flag !== '1' && flag !== 'true') return
    setReportOpen(true)
    const next = new URLSearchParams(params)
    next.delete('reportClaim')
    setParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open once from URL
  }, [params.get('reportClaim')])

  const rows = data?.rows ?? []
  const selectedRows = useMemo(() => rows.filter((r) => selected.includes(r.id)), [rows, selected])

  const toggle = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= BATCH_CAP) return prev
      return [...prev, id]
    })
  }

  const toggleAllVisible = () => {
    const ids = rows.slice(0, BATCH_CAP).map((r) => r.id)
    const allOn = ids.every((id) => selected.includes(id))
    setSelected(allOn ? [] : ids)
  }

  return (
    <Page>
      <PageHeader
        title="Claims"
        description="Brokerage-wide claims across clients you can access. Select up to 12 cases for Russ follow-ups, or open a claim to work it."
        actions={
          <Button size="sm" variant="accent" type="button" onClick={() => setReportOpen(true)}>
            <Plus /> Report an incident
          </Button>
        }
      />

      <ReportClaimSlideout
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        mode="broker"
        target={
          reportPersonId
            ? { personId: reportPersonId, policyId: reportPolicyId }
            : null
        }
        onDone={(res) => {
          void refetch()
          if (res.claim_id) {
            window.location.assign(`/broker/claims/${res.claim_id}?view=fintastic`)
          }
        }}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <label className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-navy-400" />
          <input
            className="w-full rounded-lg border border-navy-800/15 bg-white py-2 pr-3 pl-8 text-sm"
            placeholder="Search client or claim reference…"
            value={q}
            onChange={(e) => {
              const next = new URLSearchParams(params)
              if (e.target.value) next.set('q', e.target.value)
              else next.delete('q')
              setParams(next)
            }}
          />
        </label>
        <select
          className="rounded-lg border border-navy-800/15 bg-white px-2 py-2 text-sm"
          value={filter}
          onChange={(e) => {
            const next = new URLSearchParams(params)
            if (e.target.value) next.set('filter', e.target.value)
            else next.delete('filter')
            setParams(next)
          }}
        >
          <option value="">All claims</option>
          <option value="new">New incidents</option>
          <option value="missing_evidence">Missing evidence</option>
          <option value="awaiting_insurer">Awaiting insurer</option>
          <option value="overdue">Overdue follow-ups</option>
          <option value="version_review">Schedule review required</option>
          <option value="handler">By next action</option>
        </select>
      </div>

      {selected.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-brand-200 bg-brand-50/60 px-3 py-2">
          <p className="text-xs font-semibold text-navy-800">{selected.length} selected (max {BATCH_CAP})</p>
          <Button size="sm" variant="accent" onClick={() => setSlideoutOpen(true)}>
            Open Russ actions
          </Button>
          <Button size="sm" variant="outline" onClick={() => setSelected([])}>Clear</Button>
        </div>
      )}

      <ClaimsRussSlideout
        open={slideoutOpen}
        onClose={() => setSlideoutOpen(false)}
        selected={selectedRows.map((r) => ({
          id: r.id,
          reference: r.reference,
          customer_name: r.customer_name,
          person_id: r.person_id,
          status: r.status,
          incident_at: r.incident_at,
          due_at: r.due_at,
        }))}
        onCleared={() => setSelected([])}
      />

      {isLoading ? (
        <LoadingState label="Loading claims…" />
      ) : error ? (
        <ErrorState message={error.message} />
      ) : rows.length === 0 ? (
        <div className="panel flex flex-col items-center gap-2 border-dashed p-10 text-center">
          <ShieldAlert className="h-8 w-8 text-navy-300" />
          <p className="text-sm text-navy-600">No claims match this filter.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-navy-800/10">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead className="bg-navy-50 text-[11px] font-semibold tracking-wide text-navy-500 uppercase">
              <tr>
                <th className="px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label="Select visible claims"
                    checked={rows.slice(0, BATCH_CAP).length > 0 && rows.slice(0, BATCH_CAP).every((r) => selected.includes(r.id))}
                    onChange={toggleAllVisible}
                  />
                </th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Incident</th>
                <th className="px-3 py-2">Items</th>
                <th className="px-3 py-2">Insurer</th>
                <th className="px-3 py-2">Insurer ref</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Owner</th>
                <th className="px-3 py-2">Next action</th>
                <th className="px-3 py-2">Due</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const customerNew =
                  r.intake_source === 'customer' && !r.broker_acknowledged_at
                return (
                <tr
                  key={r.id}
                  className={
                    customerNew
                      ? 'border-t border-rose-200 bg-rose-50/50 hover:bg-rose-50'
                      : 'border-t border-navy-800/10 hover:bg-sky-50/40'
                  }
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label={`Select ${r.reference}`}
                      checked={selected.includes(r.id)}
                      disabled={!selected.includes(r.id) && selected.length >= BATCH_CAP}
                      onChange={() => toggle(r.id)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Link className="font-medium text-navy-900 hover:underline" to={`/broker/claims/${r.id}?view=fintastic`}>{r.customer_name}</Link>
                    <div className="font-mono text-[10px] text-navy-500">
                      <Link className="text-brand-700 hover:underline" to={`/broker/customers/people/${r.person_id}?rtab=claims`}>{r.client_number}</Link>
                      {' · '}{r.reference}
                    </div>
                    {customerNew && (
                      <span className="mt-0.5 inline-block rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-rose-900 uppercase">
                        Customer reported
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="capitalize">{r.incident_type.replace(/_/g, ' ')}</div>
                    <div className="text-xs text-navy-500">{r.incident_at ? new Date(r.incident_at).toLocaleString() : '—'}</div>
                  </td>
                  <td className="px-3 py-2 text-navy-700">{r.affected_summary ?? '—'}</td>
                  <td className="px-3 py-2">{r.insurer_name ?? '—'}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.insurer_reference ?? '—'}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={r.status} />
                    {r.version_review_needed && <span className="ml-1 text-[10px] font-semibold text-amber-800">Schedule review required</span>}
                  </td>
                  <td className="px-3 py-2">{r.owner_name ?? '—'}</td>
                  <td className="px-3 py-2 text-navy-700">{r.next_action ?? '—'}</td>
                  <td className="px-3 py-2 text-xs">{r.due_at ? new Date(r.due_at).toLocaleDateString() : '—'}</td>
                  <td className="px-3 py-2">
                    <RouteStartButtons
                      personId={r.person_id}
                      claimId={r.id}
                      actions={
                        r.status === 'closed'
                          ? []
                          : [
                              { definition_id: 'claim_progress', label: 'Progress' },
                              { definition_id: 'claim_resolve', label: 'Resolve' },
                            ]
                      }
                    />
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      )}
    </Page>
  )
}
