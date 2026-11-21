import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { PageHeader, LoadingState, ErrorState } from '../PageHeader'
import { Page } from '../shared/ui'
import {
  newKey,
  policyClaimsApi,
  usePersonInsuredItems,
  usePolicyClaimsMutation,
  usePolicyCovers,
  usePolicyDetail,
} from '@/copilot/policyClaimsApi'
import { brokerFinancialsApi, useBfMutation } from '@/copilot/brokerFinancialsApi'
import { proposeVehicleReplacementFromNotes } from '../claims/proposeFromNotes'
import { zar } from '../shared/ui'

export default function VehicleReplacementFormPage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const personId = params.get('personId') ?? ''
  const policyId = params.get('policyId') ?? ''
  const itemId = params.get('itemId') ?? ''
  const policy = usePolicyDetail(policyId || null)
  const items = usePersonInsuredItems(personId || null)
  const covers = usePolicyCovers({ query: null })
  const create = usePolicyClaimsMutation(policyClaimsApi.createVehicleReplacement)
  const previewComm = useBfMutation(brokerFinancialsApi.previewCommission)
  const [pickerQ, setPickerQ] = useState('')
  const previewPremium = Number(params.get('previewPremium') || '') || 0
  const [newPremium, setNewPremium] = useState(previewPremium > 0 ? String(previewPremium) : '')
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null)

  const vehicles = useMemo(
    () => (items.data?.rows ?? []).filter((i) => i.item_type === 'vehicle' && ['covered', 'awaiting_cover'].includes(i.status)),
    [items.data],
  )

  const pickerRows = useMemo(() => {
    const rows = covers.data?.rows ?? []
    const q = pickerQ.trim().toLowerCase()
    if (!q) return rows.slice(0, 20)
    return rows
      .filter(
        (r) =>
          r.customer_name.toLowerCase().includes(q) ||
          r.client_number.toLowerCase().includes(q) ||
          (r.policy_number ?? '').toLowerCase().includes(q) ||
          (r.item_summary ?? '').toLowerCase().includes(q),
      )
      .slice(0, 20)
  }, [covers.data, pickerQ])

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

  const bindPolicy = (row: { person_id: string; policy_id: string }) => {
    const next = new URLSearchParams(params)
    next.set('personId', row.person_id)
    next.set('policyId', row.policy_id)
    setParams(next, { replace: true })
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
    return (
      <div className="p-6">
        <LoadingState />
      </div>
    )
  }
  if (policyId && policy.error) {
    return (
      <div className="p-6">
        <ErrorState message={policy.error.message} />
      </div>
    )
  }

  return (
    <Page>
      <PageHeader
        title="Replace insured vehicle"
        description="Service requests are always linked to a customer policy. Choose the client cover first, then draft the replacement."
      />
      {!personId || !policyId ? (
        <section className="panel max-w-2xl space-y-3 p-5">
          <p className="text-sm text-navy-800">
            Select the customer policy this change belongs to. The request will appear on that client’s Policies tab and in Service requests.
          </p>
          <input
            className="w-full rounded-lg border border-navy-800/15 px-3 py-2 text-sm"
            placeholder="Search client number, name or policy…"
            value={pickerQ}
            onChange={(e) => setPickerQ(e.target.value)}
          />
          {covers.isLoading ? (
            <LoadingState label="Loading customer policies…" />
          ) : pickerRows.length === 0 ? (
            <p className="text-sm text-navy-600">
              No policies found.{' '}
              <Link className="text-brand-700 underline" to="/broker/policies">
                Open Policies
              </Link>{' '}
              or switch to Demo for sample clients.
            </p>
          ) : (
            <ul className="max-h-80 space-y-1.5 overflow-auto">
              {pickerRows.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className="flex w-full cursor-pointer flex-col rounded-lg border border-navy-800/10 px-3 py-2 text-left hover:bg-sky-50/60"
                    onClick={() => bindPolicy(r)}
                  >
                    <span className="text-sm font-semibold text-navy-900">
                      {r.customer_name} · {r.client_number}
                    </span>
                    <span className="font-mono text-xs text-navy-600">
                      {r.policy_number ?? r.reference} · {r.insurer_name ?? 'Insurer TBD'}
                    </span>
                    <span className="text-xs text-navy-500">{r.item_summary ?? 'No items yet'}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Button size="sm" variant="outline" asChild>
            <Link to="/broker/policies">Cancel · back to Policies</Link>
          </Button>
        </section>
      ) : (
        <form className="panel max-w-2xl space-y-3 p-5" onSubmit={submit}>
          <p className="text-xs text-navy-600">
            <Link className="font-semibold text-brand-700 hover:underline" to={`/broker/customers/people/${personId}?rtab=policies`}>
              {policy.data?.customer_name} · {policy.data?.client_number}
            </Link>
            {' · '}
            <Link className="text-brand-700 hover:underline" to={`/broker/policies/${policyId}`}>
              {policy.data?.policy_number ?? policy.data?.reference}
            </Link>
          </p>
          <div className="space-y-2 rounded-xl border border-navy-800/10 bg-navy-50/40 p-3">
            <p className="text-xs font-semibold text-navy-800">Russ · draft from notes</p>
            <textarea
              rows={3}
              className="w-full rounded-lg border border-navy-800/15 bg-white p-2 text-sm"
              placeholder="e.g. I’ve sold my Polo and bought a 2022 Toyota Corolla CA 123-456 effective 15 Nov 2026"
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
            />
            <Button type="button" size="sm" variant="outline" onClick={applyNotes} disabled={!notesDraft.trim()}>
              Fill form from notes
            </Button>
          </div>
          <label className="block text-xs font-semibold text-navy-600">
            Existing vehicle
            <select
              required
              className="mt-1 w-full rounded-lg border border-navy-800/15 p-2 text-sm"
              value={form.item_id}
              onChange={(e) => setForm({ ...form, item_id: e.target.value })}
            >
              <option value="">Select…</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.display_label}
                </option>
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
              <input
                required
                type="datetime-local"
                className="mt-1 w-full rounded-lg border border-navy-800/15 p-2 text-sm"
                value={form.requested_effective_at}
                onChange={(e) => setForm({ ...form, requested_effective_at: e.target.value })}
              />
            </label>
          </div>
          <label className="block text-xs font-semibold text-navy-600">
            Notes
            <textarea
              className="mt-1 w-full rounded-lg border border-navy-800/15 p-2 text-sm"
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </label>
          <div className="space-y-2 rounded-xl border border-navy-800/10 bg-amber-50/40 p-3">
            <p className="text-xs font-semibold text-navy-800">Commission preview (draft posts nothing)</p>
            <label className="block text-xs font-semibold text-navy-600">
              Replacement monthly premium (ZAR)
              <input
                className="mt-1 w-full rounded-lg border border-navy-800/15 bg-white p-2 text-sm"
                value={newPremium}
                onChange={(e) => setNewPremium(e.target.value)}
                placeholder="e.g. 1400"
              />
            </label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!newPremium || previewComm.isPending || !policy.data}
              onClick={() => {
                const insurerId =
                  (policy.data as { provider_id?: string } | undefined)?.provider_id
                  ?? 'a0000000-0000-4000-8000-000000000101'
                const current = Number(policy.data?.premium_amount ?? 1000)
                const next = Number(newPremium)
                previewComm.mutate(
                  {
                    eligible_amount: next,
                    insurer_id: insurerId,
                    product_line: 'short_term_personal',
                    section: 'vehicle',
                    on: '2025-11-01',
                  },
                  {
                    onSuccess: async (after) => {
                      const { dataCategory } = await import('@/lib/supabase/category')
                      const before = await brokerFinancialsApi.previewCommission(
                        dataCategory.get(),
                        {
                          eligible_amount: current,
                          insurer_id: insurerId,
                          product_line: 'short_term_personal',
                          section: 'vehicle',
                          on: '2025-11-01',
                        },
                      )
                      const afterSplits = (after.splits as Array<Record<string, unknown>>) ?? []
                      const beforeSplits = (before.splits as Array<Record<string, unknown>>) ?? []
                      const brokerageAfter = Number(afterSplits.find((s) => s.recipient_role === 'brokerage')?.amount ?? 0)
                      const adviserAfter = Number(afterSplits.find((s) => s.recipient_role === 'adviser')?.amount ?? 0)
                      const brokerageBefore = Number(beforeSplits.find((s) => s.recipient_role === 'brokerage')?.amount ?? 0)
                      const adviserBefore = Number(beforeSplits.find((s) => s.recipient_role === 'adviser')?.amount ?? 0)
                      setPreview({
                        premiumDelta: next - current,
                        grossDelta: Number(after.gross_amount) - Number(before.gross_amount),
                        brokerageDelta: brokerageAfter - brokerageBefore,
                        adviserDelta: adviserAfter - adviserBefore,
                        afterGross: after.gross_amount,
                        selected: after.selected,
                      })
                    },
                  },
                )
              }}
            >
              Preview premium & commission
            </Button>
            {preview && (
              <ul className="text-xs text-navy-800">
                <li>Premium {Number(preview.premiumDelta) >= 0 ? '+' : ''}{zar(Number(preview.premiumDelta), true)}</li>
                <li>Gross monthly commission {Number(preview.grossDelta) >= 0 ? '+' : ''}{zar(Number(preview.grossDelta), true)}</li>
                <li>Brokerage share {Number(preview.brokerageDelta) >= 0 ? '+' : ''}{zar(Number(preview.brokerageDelta), true)}</li>
                <li>Adviser share {Number(preview.adviserDelta) >= 0 ? '+' : ''}{zar(Number(preview.adviserDelta), true)}</li>
                <li className="text-navy-500">Submitting the request drafts only — no earning is posted until confirmation + earn.</li>
              </ul>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" variant="accent" disabled={create.isPending}>
              Submit request
            </Button>
            <Button type="button" size="sm" variant="outline" asChild>
              <Link to={`/broker/policies/${policyId}`}>Cancel</Link>
            </Button>
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
