import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Loader2, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { newKey, salesApi, useRefreshSales, useSalesProfile } from '@/copilot/salesApi'
import { useClaimsQueue, usePolicyCovers } from '@/copilot/policyClaimsApi'
import { useDataCategory } from '@/lib/supabase/category'
import { useSupabaseAuth } from '@/lib/supabase/client'
import type { ActionInput } from '@/routes'
import { INCIDENT_TYPES } from '../claims/claimLabels'
import { ErrorText } from '../book/bits'
import type { SurfaceProps } from './MotorQuoteSurfaces'

const inputClass = 'w-full rounded-lg border border-navy-800/15 bg-white px-3 py-2 text-sm'

type Opt = { value: string; label: string }

const CHANNELS: Opt[] = [
  { value: 'email', label: 'Email' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'portal', label: 'Insurer portal' },
  { value: 'phone', label: 'Phone' },
  { value: 'in_person', label: 'In person' },
  { value: 'external', label: 'External / elsewhere' },
]

const CONFIRM_SOURCES: Opt[] = [
  { value: 'insurer_email', label: 'Insurer email' },
  { value: 'insurer_portal', label: 'Insurer portal' },
  { value: 'broker_pack', label: 'Broker pack / schedule' },
  { value: 'authorised_party', label: 'Authorised party' },
  { value: 'other', label: 'Other' },
]

const SOURCE_TYPES: Opt[] = [
  { value: 'accepted_quote', label: 'Link accepted quote' },
  { value: 'insurer_schedule', label: 'Attach insurer schedule' },
  { value: 'manual', label: 'Manual entry' },
]

const REQUEST_SOURCES: Opt[] = [
  { value: 'client', label: 'Client instruction' },
  { value: 'insurer', label: 'Insurer' },
  { value: 'broker', label: 'Broker review' },
  { value: 'other', label: 'Other' },
]

const CLIENT_DECISIONS: Opt[] = [
  { value: 'accept', label: 'Accept' },
  { value: 'decline', label: 'Decline' },
  { value: 'pending', label: 'Pending response' },
]

const OUTCOMES: Opt[] = [
  { value: 'declined', label: 'Declined' },
  { value: 'withdrawn', label: 'Withdrawn' },
]

const CLAIM_DECISIONS: Opt[] = [
  { value: 'settlement', label: 'Settlement' },
  { value: 'partial_settlement', label: 'Partial settlement' },
  { value: 'rejection', label: 'Rejection' },
  { value: 'withdrawal', label: 'Withdrawal' },
]

const ACTION_TYPES: Opt[] = [
  { value: 'request_documents', label: 'Request documents' },
  { value: 'follow_up_insurer', label: 'Follow up with insurer' },
  { value: 'record_update', label: 'Record update' },
]

const WAITING_ON: Opt[] = [
  { value: 'client', label: 'Client' },
  { value: 'insurer', label: 'Insurer' },
  { value: 'approval', label: 'Approval' },
  { value: 'broker', label: 'Broker' },
]

const SETTLEMENT_STATUS: Opt[] = [
  { value: 'not_applicable', label: 'Not applicable' },
  { value: 'agreed', label: 'Agreed' },
  { value: 'outstanding', label: 'Outstanding' },
  { value: 'paid', label: 'Paid' },
]

const PAYMENT_REPAIR: Opt[] = [
  { value: 'not_applicable', label: 'Not applicable' },
  { value: 'complete', label: 'Complete' },
  { value: 'outstanding', label: 'Outstanding' },
]

const FIELD_OPTIONS: Record<string, Opt[]> = {
  channel: CHANNELS,
  confirmation_source: CONFIRM_SOURCES,
  decision_source: CONFIRM_SOURCES,
  source_type: SOURCE_TYPES,
  source: REQUEST_SOURCES,
  outcome: OUTCOMES,
  incident_type: INCIDENT_TYPES.map((t) => ({ value: t.value, label: t.label })),
  action_type: ACTION_TYPES,
  waiting_on: WAITING_ON,
  settlement_status: SETTLEMENT_STATUS,
  payment_status: PAYMENT_REPAIR,
  repair_status: PAYMENT_REPAIR,
}

function optionsFor(field: string, actionId: string): Opt[] | undefined {
  if (field === 'decision') {
    if (actionId.includes('claim_resolve')) return CLAIM_DECISIONS
    return CLIENT_DECISIONS
  }
  return FIELD_OPTIONS[field]
}

/** Exact action id → fields. Order matters; first match wins via exact lookup. */
const FIELDS_BY_ACTION: Record<string, string[]> = {
  'policy_setup.source.confirm': ['source_type', 'quote_id', 'policy_number', 'schedule_note'],
  'policy_setup.placement.confirm': ['policy_number', 'confirmed_effective_at', 'confirmation_source', 'insurer_reference'],
  'policy_setup.file.handover': ['channel', 'note'],
  'policy_change.capture.request': ['policy_id', 'requested_effective_at', 'summary', 'notes'],
  'policy_change.review.request_endorsement': ['channel', 'note'],
  'policy_change.confirm.insurer_terms': ['confirmed_effective_at', 'confirmation_source', 'insurer_reference'],
  'policy_change.apply.change': ['channel', 'note'],
  'policy_change.apply.decline': ['outcome', 'reason'],
  'policy_renew.review.cover': ['policy_id', 'renewal_date', 'notes'],
  'policy_renew.compare.attach': ['notes'],
  'policy_renew.decision.record': ['decision', 'due_at', 'evidence'],
  'policy_renew.outcome.confirm': ['confirmation_source', 'confirmed_effective_at'],
  'policy_renew.outcome.non_renew': ['reason'],
  'policy_cancel.capture.instruction': ['policy_id', 'requested_effective_at', 'reason', 'source', 'notes'],
  'policy_cancel.review.submit': ['channel'],
  'policy_cancel.confirm.insurer': ['confirmed_effective_at', 'confirmation_source', 'channel', 'note'],
  'policy_cancel.confirm.close': ['outcome', 'reason'],
  'claim_register.capture.incident': ['policy_id', 'incident_at', 'incident_type', 'description'],
  'claim_register.cover.identify_policy': ['policy_id'],
  'claim_register.evidence.attach': ['notes'],
  'claim_register.evidence.request': ['note', 'due_at'],
  'claim_register.submit.approve': ['channel', 'insurer_reference'],
  'claim_register.submit.ack': ['insurer_reference', 'follow_up_due'],
  'claim_progress.review.file': ['claim_id', 'claim_reference', 'insurer_reference', 'claim_stage'],
  'claim_progress.action.next': ['action_type', 'note', 'due_at'],
  'claim_progress.next.log': ['response', 'next_action', 'waiting_on', 'due_at'],
  'claim_resolve.capture.outcome': ['claim_id', 'claim_reference', 'decision', 'decision_source', 'decision_date', 'settlement_amount'],
  'claim_resolve.settlement.record': ['settlement_status', 'payment_status', 'repair_status'],
  'claim_resolve.settlement.communicate': ['channel', 'note'],
}

function fieldsFor(actionId: string, confirmOnly: boolean): string[] {
  if (FIELDS_BY_ACTION[actionId]) return FIELDS_BY_ACTION[actionId]
  if (actionId.endsWith('.select') || actionId.includes('.client.select')) return []
  if (confirmOnly) return []
  return ['note']
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="text-xs font-semibold text-navy-600">{label}</span>
      {children}
    </label>
  )
}

function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder = 'Choose…',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: Opt[]
  placeholder?: string
}) {
  return (
    <Field label={label}>
      <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </Field>
  )
}

function human(f: string) {
  return f.replace(/_/g, ' ')
}

function HubClientSelect({ busy, run, progress }: SurfaceProps) {
  const auth = useSupabaseAuth()
  const category = useDataCategory()
  const profile = useSalesProfile()
  const refresh = useRefreshSales()
  const scope = profile.data?.book_restricted ? 'mine' : 'team'
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [key, setKey] = useState(newKey)
  const [form, setForm] = useState({ first_names: '', surname: '', phone: '', email: '' })
  const grid = useQuery({
    queryKey: ['supabase', auth.userId, category, 'sales', 'hub-client-picker', scope, query.trim()],
    queryFn: () => salesApi.grid(category, { scope, query: query.trim() || null }),
    enabled: auth.status === 'signed_in' && profile.isSuccess,
    retry: false,
    placeholderData: (prev) => prev,
  })
  const create = useMutation({
    mutationFn: () =>
      salesApi.capture(category, {
        first_names: form.first_names.trim(),
        surname: form.surname.trim(),
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        interest: 'Policy',
        note: 'Created from Routes · Confirm client',
        key,
      }),
    onSuccess: (r) => {
      const personId = String(r.person_id ?? r.client_id ?? '')
      void refresh()
      setCreating(false)
      setForm({ first_names: '', surname: '', phone: '', email: '' })
      setKey(newKey())
      if (personId) run({ person_id: personId })
    },
  })
  const rows = grid.data?.rows ?? []
  const canCreate = auth.status === 'signed_in' && Boolean(profile.data?.member)
  const valid = form.first_names.trim() && form.surname.trim() && (form.phone.trim() || form.email.trim())

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Search className="h-4 w-4 shrink-0 text-navy-500" aria-hidden />
        <input
          className={`${inputClass} min-w-0 flex-1`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search clients by name or number"
          aria-label="Search clients"
        />
        <Button type="button" size="sm" variant={creating ? 'accent' : 'outline'} disabled={!canCreate || busy} onClick={() => setCreating((v) => !v)}>
          <Plus /> Add client
        </Button>
      </div>
      {creating && (
        <form
          className="grid gap-2 rounded-xl border border-brand-500/30 bg-brand-50/40 p-3 sm:grid-cols-2"
          onSubmit={(e: FormEvent) => {
            e.preventDefault()
            if (valid && !create.isPending) create.mutate()
          }}
        >
          <Field label="First names"><input className={inputClass} value={form.first_names} onChange={(e) => setForm((f) => ({ ...f, first_names: e.target.value }))} /></Field>
          <Field label="Surname"><input className={inputClass} value={form.surname} onChange={(e) => setForm((f) => ({ ...f, surname: e.target.value }))} /></Field>
          <Field label="Mobile"><input className={inputClass} value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /></Field>
          <Field label="Email"><input className={inputClass} value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></Field>
          <div className="sm:col-span-2 flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
            <Button type="submit" size="sm" variant="accent" disabled={!valid || create.isPending}>
              {create.isPending ? <Loader2 className="animate-spin" /> : <Plus />} Create and select
            </Button>
          </div>
          <ErrorText error={create.error} />
        </form>
      )}
      <ul className="max-h-56 space-y-1 overflow-y-auto">
        {rows.slice(0, 20).map((r) => (
          <li key={r.id}>
            <button
              type="button"
              disabled={busy}
              className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm ${
                progress.run.subject_id === r.id ? 'border-brand-500 bg-brand-50' : 'border-navy-800/10 bg-white hover:border-brand-500/40'
              }`}
              onClick={() => run({ person_id: r.id })}
            >
              <span>
                <span className="font-medium text-navy-900">{r.name}</span>{' '}
                <span className="font-mono text-xs text-navy-500">{r.client_number}</span>
              </span>
              <span className="text-xs font-semibold text-brand-700">{progress.run.subject_id === r.id ? 'Selected' : 'Select'}</span>
            </button>
          </li>
        ))}
        {!grid.isLoading && rows.length === 0 && <li className="text-xs text-navy-500">No clients match. Use Add client.</li>}
      </ul>
    </div>
  )
}

/** Hub route action editors: correct fields, dropdowns, and Add/select CRUD. */
export function HubFormSurface(props: SurfaceProps) {
  const { action, busy, run, progress, outcome } = props
  if (action.id.includes('.client.select')) {
    return <HubClientSelect {...props} />
  }

  const state = progress.run.state as Record<string, unknown>
  const personId = (progress.run.subject_id || (state.client as { person_id?: string } | undefined)?.person_id || '') as string
  const [form, setForm] = useState<Record<string, string>>(() => ({
    policy_id: (state.policy_id as string) || progress.run.policy_id || '',
    claim_id: (state.claim_id as string) || progress.run.claim_id || '',
    source_type: (state.source_type as string) || '',
  }))
  const [confirmed, setConfirmed] = useState(false)
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const covers = usePolicyCovers({ person_id: personId || null })
  const claims = useClaimsQueue({ person_id: personId || null })
  const policyOpts = useMemo(
    () =>
      (covers.data?.rows ?? []).map((p) => ({
        value: p.policy_id,
        label: `${p.policy_number ?? p.reference ?? 'Policy'} · ${p.insurer_name ?? 'Insurer'}`,
      })),
    [covers.data?.rows],
  )
  const claimOpts = useMemo(
    () =>
      (claims.data?.rows ?? []).map((c) => ({
        value: c.id,
        label: `${c.reference} · ${c.incident_type.replace(/_/g, ' ')}`,
      })),
    [claims.data?.rows],
  )

  const fields = fieldsFor(action.id, Boolean(action.confirm) && action.kind === 'review')
  const sourceType = form.source_type || ''

  const visibleFields = fields.filter((f) => {
    if (action.id === 'policy_setup.source.confirm') {
      if (f === 'quote_id') return sourceType === 'accepted_quote'
      if (f === 'schedule_note') return sourceType === 'insurer_schedule'
      if (f === 'policy_number') return sourceType === 'manual' || sourceType === 'insurer_schedule'
    }
    return true
  })

  const input: ActionInput = {
    ...Object.fromEntries(visibleFields.map((f) => [f, form[f] ?? ''])),
    ...(form.policy_id ? { policy_id: form.policy_id } : {}),
    ...(form.claim_id ? { claim_id: form.claim_id } : {}),
    ...(action.confirm ? { confirmed } : {}),
  }

  const renderField = (f: string) => {
    if (f === 'policy_id') {
      return (
        <div key={f} className="space-y-1 sm:col-span-2">
          <SelectField label="Policy" value={form.policy_id ?? ''} onChange={(v) => set('policy_id', v)} options={policyOpts} placeholder={personId ? 'Select policy…' : 'Select a client first'} />
          {personId && (
            <div className="flex flex-wrap gap-2 text-xs">
              <Link className="inline-flex items-center gap-1 font-semibold text-brand-700 underline" to={`/broker/routes?start=policy_setup&personId=${personId}`}>
                <Plus className="h-3 w-3" /> Set up a policy
              </Link>
              <Link className="font-semibold text-brand-700 underline" to={`/broker/customers/people/${personId}?rtab=policies`}>
                Open client policies
              </Link>
            </div>
          )}
        </div>
      )
    }
    if (f === 'claim_id') {
      return (
        <div key={f} className="space-y-1 sm:col-span-2">
          <SelectField label="Claim" value={form.claim_id ?? ''} onChange={(v) => set('claim_id', v)} options={claimOpts} placeholder={personId ? 'Select claim…' : 'Select a client first'} />
          {personId && (
            <Link
              className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 underline"
              to={`/broker/claims/new?personId=${personId}${form.policy_id ? `&policyId=${form.policy_id}` : ''}&returnRun=${progress.run.id}&returnAction=${action.id}`}
            >
              <Plus className="h-3 w-3" /> Add / report incident
            </Link>
          )}
        </div>
      )
    }
    const opts = optionsFor(f, action.id)
    if (opts) {
      return (
        <SelectField
          key={f}
          label={human(f)}
          value={form[f] ?? ''}
          onChange={(v) => set(f, v)}
          options={opts}
        />
      )
    }
    const long = ['description', 'note', 'notes', 'summary', 'reason', 'response', 'evidence', 'schedule_note', 'next_action'].includes(f)
    const dateLike = f.includes('date') || f.includes('due') || f.endsWith('_at')
    return (
      <Field key={f} label={human(f)}>
        {long ? (
          <textarea className={inputClass} rows={2} value={form[f] ?? ''} onChange={(e) => set(f, e.target.value)} />
        ) : dateLike ? (
          <input
            type={f === 'incident_at' ? 'datetime-local' : 'date'}
            className={inputClass}
            value={form[f] ?? ''}
            onChange={(e) => set(f, e.target.value)}
          />
        ) : (
          <input className={inputClass} value={form[f] ?? ''} onChange={(e) => set(f, e.target.value)} />
        )}
      </Field>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-navy-700">{action.handover}</p>

      {action.id === 'policy_setup.source.confirm' && (
        <div className="flex flex-wrap gap-2 text-xs">
          {personId && sourceType === 'accepted_quote' && (
            <Link className="inline-flex items-center gap-1 font-semibold text-brand-700 underline" to={`/broker/book/clients/${personId}`}>
              <Plus className="h-3 w-3" /> Add / open quotes on client
            </Link>
          )}
          {personId && sourceType === 'insurer_schedule' && (
            <p className="text-navy-600">Paste a schedule reference or note below. File the schedule on the client record after save.</p>
          )}
        </div>
      )}

      {(action.id.includes('capture.request') || action.id.includes('incident')) && personId && (
        <div className="flex flex-wrap gap-2 text-xs">
          {action.id.includes('incident') && (
            <Link
              className="inline-flex items-center gap-1 font-semibold text-brand-700 underline"
              to={`/broker/claims/new?personId=${personId}${form.policy_id ? `&policyId=${form.policy_id}` : ''}&returnRun=${progress.run.id}&returnAction=${action.id}`}
            >
              <Plus className="h-3 w-3" /> Open full incident form
            </Link>
          )}
          {action.id.includes('capture.request') && (
            <Link
              className="inline-flex items-center gap-1 font-semibold text-brand-700 underline"
              to={`/broker/policies/requests/new?personId=${personId}${form.policy_id ? `&policyId=${form.policy_id}` : ''}&returnRun=${progress.run.id}&returnAction=${action.id}`}
            >
              <Plus className="h-3 w-3" /> Open vehicle replacement form
            </Link>
          )}
        </div>
      )}

      {visibleFields.length > 0 && <div className="grid gap-2 sm:grid-cols-2">{visibleFields.map(renderField)}</div>}

      {outcome?.fields && (
        <ul className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {Object.entries(outcome.fields).map(([k, v]) => (
            <li key={k}>{v}</li>
          ))}
        </ul>
      )}
      {action.confirm && (
        <label className="flex items-center gap-2 text-sm text-navy-800">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> I confirm {action.label.toLowerCase()}
        </label>
      )}
      <Button variant="accent" disabled={busy || (action.confirm && !confirmed)} onClick={() => run(input)}>
        {action.label}
      </Button>
    </div>
  )
}
