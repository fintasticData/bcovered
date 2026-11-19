import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { PageHeader, LoadingState, ErrorState } from '@/broker/PageHeader'
import { Page } from '@/broker/shared/ui'
import { INCIDENT_TYPES } from '@/broker/claims/claimLabels'
import { proposeClaimFromNotes } from '@/broker/claims/proposeFromNotes'
import { newKey, policyClaimsApi, useMyCover, usePolicyClaimsMutation } from '@/copilot/policyClaimsApi'

/** Customer-facing incident report using pc_customer_create_claim. */
export default function CustomerReportIncidentPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const cover = useMyCover()
  const create = usePolicyClaimsMutation(policyClaimsApi.customerCreateClaim)
  const prefPolicy = params.get('policyId') ?? ''
  const prefItem = params.get('itemId') ?? ''

  const items = cover.data?.rows ?? []
  const policyOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const i of items) {
      if (i.policy_id) map.set(i.policy_id, i.display_label)
    }
    return [...map.entries()]
  }, [items])

  const [notes, setNotes] = useState('')
  const [form, setForm] = useState({
    policy_id: prefPolicy,
    incident_date: '',
    incident_time: '',
    time_unknown: true,
    incident_type: 'motor_accident',
    description: '',
    item_ids: prefItem ? [prefItem] : ([] as string[]),
  })
  const [confirmed, setConfirmed] = useState(false)

  const applyNotes = () => {
    const draft = proposeClaimFromNotes(notes, items)
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
    if (!confirmed) return
    const incidentAt = form.time_unknown || !form.incident_time
      ? `${form.incident_date}T12:00:00`
      : `${form.incident_date}T${form.incident_time}:00`
    create.mutate(
      {
        incident_at: new Date(incidentAt).toISOString(),
        incident_time_unknown: form.time_unknown || !form.incident_time,
        incident_type: form.incident_type,
        description: form.description,
        policy_id: form.policy_id || null,
        item_ids: form.item_ids,
        key: newKey(),
      },
      {
        onSuccess: () => navigate('/my?tab=claims'),
      },
    )
  }

  if (cover.isLoading) return <div className="p-6"><LoadingState label="Loading your cover…" /></div>
  if (cover.error) return <div className="p-6"><ErrorState message={cover.error.message} /></div>

  return (
    <Page>
      <PageHeader
        title="Report an incident"
        description="Describe what happened in your own words. Review the details before submitting — your broker receives the same claim form."
        actions={
          <Button size="sm" variant="outline" asChild>
            <Link to="/my?tab=claims">Back to My claims</Link>
          </Button>
        }
      />
      <form className="panel mx-auto max-w-2xl space-y-3 p-5" onSubmit={submit}>
        <div className="space-y-2 rounded-xl border border-navy-800/10 bg-navy-50/40 p-3">
          <p className="text-xs font-semibold text-navy-800">Describe the incident</p>
          <textarea
            rows={3}
            className="w-full rounded-lg border border-navy-800/15 bg-white p-2 text-sm"
            placeholder="e.g. I was rear-ended in my Polo on 12 Nov 2026 around 14:30."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <Button type="button" size="sm" variant="outline" onClick={applyNotes} disabled={!notes.trim()}>
            Fill details from my description
          </Button>
        </div>

        {policyOptions.length > 0 && (
          <label className="block text-xs font-semibold text-navy-600">
            Policy (if known)
            <select
              className="mt-1 w-full rounded-lg border p-2 text-sm"
              value={form.policy_id}
              onChange={(e) => setForm({ ...form, policy_id: e.target.value })}
            >
              <option value="">Select…</option>
              {policyOptions.map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
          </label>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold text-navy-600">
            Incident date
            <input required type="date" className="mt-1 w-full rounded-lg border p-2 text-sm" value={form.incident_date} onChange={(e) => setForm({ ...form, incident_date: e.target.value })} />
          </label>
          <label className="text-xs font-semibold text-navy-600">
            Time (if known)
            <input type="time" disabled={form.time_unknown} className="mt-1 w-full rounded-lg border p-2 text-sm" value={form.incident_time} onChange={(e) => setForm({ ...form, incident_time: e.target.value, time_unknown: false })} />
          </label>
        </div>
        <label className="flex items-center gap-2 text-xs text-navy-700">
          <input type="checkbox" checked={form.time_unknown} onChange={(e) => setForm({ ...form, time_unknown: e.target.checked, incident_time: '' })} />
          Time unknown
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
        {items.length > 0 && (
          <fieldset>
            <legend className="text-xs font-semibold text-navy-600">Affected items</legend>
            <ul className="mt-2 space-y-1">
              {items.map((i) => (
                <li key={i.id}>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={form.item_ids.includes(i.id)} onChange={() => toggleItem(i.id)} />
                    {i.display_label}
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        )}
        <label className="flex items-start gap-2 text-xs text-navy-700">
          <input type="checkbox" className="mt-0.5" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          I have reviewed these details and want to submit this incident report to B-Covered.
        </label>
        <Button type="submit" size="sm" variant="accent" disabled={!confirmed || create.isPending}>
          Submit report
        </Button>
        {create.error && <p className="text-xs text-red-700">{(create.error as Error).message}</p>}
        {create.isSuccess && create.data?.reference && (
          <p className="text-xs text-emerald-800">Submitted {create.data.reference}. You can track it under My claims.</p>
        )}
      </form>
    </Page>
  )
}
