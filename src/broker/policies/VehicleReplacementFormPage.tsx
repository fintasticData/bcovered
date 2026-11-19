import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { PageHeader, LoadingState, ErrorState } from '../PageHeader'
import { Page } from '../shared/ui'
import { newKey, policyClaimsApi, usePersonInsuredItems, usePolicyClaimsMutation, usePolicyDetail } from '@/copilot/policyClaimsApi'
import { proposeVehicleReplacementFromNotes } from '../claims/proposeFromNotes'

export default function VehicleReplacementFormPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const personId = params.get('personId') ?? ''
  const policyId = params.get('policyId') ?? ''
  const itemId = params.get('itemId') ?? ''
  const policy = usePolicyDetail(policyId || null)
  const items = usePersonInsuredItems(personId || null)
  const create = usePolicyClaimsMutation(policyClaimsApi.createVehicleReplacement)

  const vehicles = useMemo(
    () => (items.data?.rows ?? []).filter((i) => i.item_type === 'vehicle' && ['covered', 'awaiting_cover'].includes(i.status)),
    [items.data],
  )

  const [notesDraft, setNotesDraft] = useState('')
  const [form, setForm] = useState({
    item_id: itemId,
    make: '',
    model: '',
    year: '',
    registration: '',
    vin: '',
    requested_effective_at: '',
    notes: '',
  })

  const applyNotes = () => {
    const draft = proposeVehicleReplacementFromNotes(notesDraft)
    setForm((f) => ({ ...f, ...draft, notes: draft.notes || notesDraft || f.notes }))
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!personId || !policyId || !form.item_id) return
    create.mutate(
      {
        person_id: personId,
        policy_id: policyId,
        item_id: form.item_id,
        requested_effective_at: new Date(form.requested_effective_at).toISOString(),
        replacement: {
          make: form.make,
          model: form.model,
          year: form.year ? Number(form.year) : null,
          registration: form.registration || null,
          vin: form.vin || null,
        },
        notes: form.notes || null,
        key: newKey(),
      },
      {
        onSuccess: (res) => {
          if (res.request_id) navigate(`/broker/policies/requests/${res.request_id}`)
        },
      },
    )
  }

  if ((policyId && policy.isLoading) || (personId && items.isLoading)) {
    return <div className="p-6"><LoadingState /></div>
  }
  if (policyId && policy.error) return <div className="p-6"><ErrorState message={policy.error.message} /></div>

  return (
    <Page>
      <PageHeader
        title="Replace insured vehicle"
        description="Paste the customer’s request for Russ to draft the replacement, then review before submitting. The existing vehicle stays current until confirmation takes effect."
      />
      {!personId || !policyId ? (
        <p className="panel p-4 text-sm text-navy-700">
          Start this form from a client policy or item so the client and policy are prefilled.{' '}
          <Link className="text-brand-700 underline" to="/broker/policies?view=policies">Open Policies</Link>
        </p>
      ) : (
        <form className="panel max-w-2xl space-y-3 p-5" onSubmit={submit}>
          <p className="text-xs text-navy-600">
            {policy.data?.customer_name} · {policy.data?.client_number} · {policy.data?.policy_number ?? policy.data?.reference}
          </p>
          <div className="space-y-2 rounded-xl border border-navy-800/10 bg-navy-50/40 p-3">
            <p className="text-xs font-semibold text-navy-800">Russ · draft from notes</p>
            <textarea
              rows={3}
              className="w-full rounded-lg border border-navy-800/15 bg-white p-2 text-sm"
              placeholder='e.g. I’ve sold my Polo and bought a 2022 Toyota Corolla CA 123-456 effective 15 Nov 2026'
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
            />
            <Button type="button" size="sm" variant="outline" onClick={applyNotes} disabled={!notesDraft.trim()}>
              Fill form from notes
            </Button>
          </div>
          <label className="block text-xs font-semibold text-navy-600">
            Existing vehicle
            <select required className="mt-1 w-full rounded-lg border border-navy-800/15 p-2 text-sm" value={form.item_id} onChange={(e) => setForm({ ...form, item_id: e.target.value })}>
              <option value="">Select…</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>{v.display_label}</option>
              ))}
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Make" value={form.make} onChange={(v) => setForm({ ...form, make: v })} required />
            <Field label="Model" value={form.model} onChange={(v) => setForm({ ...form, model: v })} required />
            <Field label="Year" value={form.year} onChange={(v) => setForm({ ...form, year: v })} />
            <Field label="Registration" value={form.registration} onChange={(v) => setForm({ ...form, registration: v })} />
            <Field label="VIN" value={form.vin} onChange={(v) => setForm({ ...form, vin: v })} />
            <label className="text-xs font-semibold text-navy-600">
              Requested effective
              <input required type="datetime-local" className="mt-1 w-full rounded-lg border border-navy-800/15 p-2 text-sm" value={form.requested_effective_at} onChange={(e) => setForm({ ...form, requested_effective_at: e.target.value })} />
            </label>
          </div>
          <label className="block text-xs font-semibold text-navy-600">
            Notes
            <textarea className="mt-1 w-full rounded-lg border border-navy-800/15 p-2 text-sm" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </label>
          <div className="flex gap-2">
            <Button type="submit" size="sm" variant="accent" disabled={create.isPending}>Submit request</Button>
            <Button type="button" size="sm" variant="outline" asChild><Link to={`/broker/policies/${policyId}`}>Cancel</Link></Button>
          </div>
          {create.error && <p className="text-xs text-red-700">{(create.error as Error).message}</p>}
        </form>
      )}
    </Page>
  )
}

function Field({ label, value, onChange, required }: { label: string; value: string; onChange: (v: string) => void; required?: boolean }) {
  return (
    <label className="text-xs font-semibold text-navy-600">
      {label}
      <input required={required} className="mt-1 w-full rounded-lg border border-navy-800/15 p-2 text-sm" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}
