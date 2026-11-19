import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { PageHeader, LoadingState } from '../PageHeader'
import { Page } from '../shared/ui'
import { newKey, policyClaimsApi, usePersonInsuredItems, usePolicyClaimsMutation, usePolicyDetail } from '@/copilot/policyClaimsApi'
import { INCIDENT_TYPES } from './claimLabels'
import { proposeClaimFromNotes } from './proposeFromNotes'

export default function ReportIncidentFormPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const personId = params.get('personId') ?? ''
  const policyId = params.get('policyId') ?? ''
  const itemId = params.get('itemId') ?? ''
  const initialNotes = params.get('notes') ?? ''
  const policy = usePolicyDetail(policyId || null)
  const items = usePersonInsuredItems(personId || null)
  const create = usePolicyClaimsMutation(policyClaimsApi.createClaim)

  const [notes, setNotes] = useState(initialNotes)
  const [form, setForm] = useState({
    incident_date: '',
    incident_time: '',
    time_unknown: false,
    incident_type: 'motor_accident',
    description: '',
    item_ids: itemId ? [itemId] : ([] as string[]),
  })

  useEffect(() => {
    if (!initialNotes || !items.data?.rows) return
    const draft = proposeClaimFromNotes(initialNotes, items.data.rows)
    setForm((f) => ({
      ...f,
      ...draft,
      item_ids: draft.item_ids?.length ? draft.item_ids : f.item_ids,
    }))
  }, [initialNotes, items.data?.rows])

  const applyNotes = () => {
    const draft = proposeClaimFromNotes(notes, items.data?.rows ?? [])
    setForm((f) => ({
      ...f,
      ...draft,
      item_ids: draft.item_ids?.length ? draft.item_ids : f.item_ids,
      description: draft.description || f.description,
    }))
  }

  const toggleItem = (id: string) => {
    setForm((f) => ({
      ...f,
      item_ids: f.item_ids.includes(id) ? f.item_ids.filter((x) => x !== id) : [...f.item_ids, id],
    }))
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!personId) return
    const incidentAt = form.time_unknown || !form.incident_time
      ? `${form.incident_date}T12:00:00`
      : `${form.incident_date}T${form.incident_time}:00`
    create.mutate(
      {
        person_id: personId,
        policy_id: policyId || null,
        incident_at: new Date(incidentAt).toISOString(),
        incident_time_unknown: form.time_unknown || !form.incident_time,
        incident_type: form.incident_type,
        description: form.description,
        item_ids: form.item_ids,
        key: newKey(),
      },
      {
        onSuccess: (res) => {
          if (res.claim_id) navigate(`/broker/claims/${res.claim_id}`)
        },
      },
    )
  }

  if (personId && items.isLoading) return <div className="p-6"><LoadingState /></div>

  return (
    <Page>
      <PageHeader title="Report an incident" description="Create a claim. Paste call notes for Russ to draft fields, then review before submitting. Evidence can be added later." />
      {!personId ? (
        <p className="panel p-4 text-sm">
          Select a client first from{' '}
          <Link className="text-brand-700 underline" to="/broker/customers">Customer Area</Link>
          {' '}or open Report an incident from a policy.
        </p>
      ) : (
        <form className="panel max-w-2xl space-y-3 p-5" onSubmit={submit}>
          <p className="text-xs text-navy-600">
            {policy.data ? `${policy.data.customer_name} · ${policy.data.client_number}` : `Person ${personId.slice(0, 8)}…`}
            {policy.data?.policy_number ? ` · ${policy.data.policy_number}` : ''}
          </p>

          <div className="space-y-2 rounded-xl border border-navy-800/10 bg-navy-50/40 p-3">
            <p className="text-xs font-semibold text-navy-800">Russ · draft from notes</p>
            <textarea
              rows={3}
              className="w-full rounded-lg border border-navy-800/15 bg-white p-2 text-sm"
              placeholder="e.g. Client called: rear-ended in the Polo on 12 Nov 2026 around 14:30. Photos still outstanding."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <Button type="button" size="sm" variant="outline" onClick={applyNotes} disabled={!notes.trim()}>
              Fill form from notes
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold text-navy-600">
              Incident date
              <input required type="date" className="mt-1 w-full rounded-lg border p-2 text-sm" value={form.incident_date} onChange={(e) => setForm({ ...form, incident_date: e.target.value })} />
            </label>
            <label className="text-xs font-semibold text-navy-600">
              Time (if known)
              <input type="time" disabled={form.time_unknown} className="mt-1 w-full rounded-lg border p-2 text-sm" value={form.incident_time} onChange={(e) => setForm({ ...form, incident_time: e.target.value })} />
            </label>
          </div>
          <label className="flex items-center gap-2 text-xs text-navy-700">
            <input type="checkbox" checked={form.time_unknown} onChange={(e) => setForm({ ...form, time_unknown: e.target.checked, incident_time: '' })} />
            Time unknown (may need policy-version review if cover changed that day)
          </label>
          <label className="block text-xs font-semibold text-navy-600">
            Type
            <select className="mt-1 w-full rounded-lg border p-2 text-sm" value={form.incident_type} onChange={(e) => setForm({ ...form, incident_type: e.target.value })}>
              {INCIDENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
          <label className="block text-xs font-semibold text-navy-600">
            Description
            <textarea required minLength={20} rows={4} className="mt-1 w-full rounded-lg border p-2 text-sm" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </label>
          <fieldset>
            <legend className="text-xs font-semibold text-navy-600">Affected items</legend>
            <ul className="mt-2 space-y-1">
              {(items.data?.rows ?? []).map((i) => (
                <li key={i.id}>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={form.item_ids.includes(i.id)} onChange={() => toggleItem(i.id)} />
                    {i.display_label}
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
          <Button type="submit" size="sm" variant="accent" disabled={create.isPending}>Submit report</Button>
          {create.error && <p className="text-xs text-red-700">{(create.error as Error).message}</p>}
          {create.isSuccess && create.data?.reference && (
            <p className="text-xs text-emerald-800">Created {create.data.reference}. You can add evidence on the claim.</p>
          )}
        </form>
      )}
    </Page>
  )
}
