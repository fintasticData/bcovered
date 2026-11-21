import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { useLogLeadActivity, useSaveLeadQualification } from '@/api/hooks'
import { Button } from '@/components/ui/button'
import { formatDateTime } from '@/lib/utils'
import type { LeadDetail } from '@/server/api'
import type { LeadActivityEntry } from '@/server/db/schema'

function Provenance({ field, confirmed, research }: { field: string; confirmed?: Record<string, string>; research?: boolean }) {
  const src = confirmed?.[field]
  if (src === 'broker') return <span className="text-[10px] font-semibold text-emerald-800">Broker confirmed</span>
  if (src === 'customer') return <span className="text-[10px] font-semibold text-emerald-800">Customer confirmed</span>
  if (research) return <span className="text-[10px] font-semibold text-navy-500">From research</span>
  return null
}

const FIELDS = [
  ['contact_person', 'Contact person', 'Who to speak to'],
  ['confirmed_cover_need', 'Confirmed cover need', 'e.g. Commercial property'],
  ['assets', 'Assets or items to insure', 'Workshop equipment, stock…'],
  ['estimated_values', 'Estimated values', 'Where relevant'],
  ['existing_cover', 'Existing cover', 'Insurer or none'],
  ['renewal_date', 'Renewal date', 'YYYY-MM-DD'],
] as const

export function QualificationPanel({ data }: { data: LeadDetail }) {
  const lead = data.lead
  const save = useSaveLeadQualification()
  const log = useLogLeadActivity()
  const q = lead.qualification
  const acceptedOrLater = lead.status === 'accepted' || lead.status === 'live' || lead.status === 'closed'
  const [editing, setEditing] = useState(!acceptedOrLater)
  const [form, setForm] = useState({
    contact_person: q.contact_person ?? '',
    confirmed_cover_need: q.confirmed_cover_need ?? lead.product_category ?? '',
    assets: q.assets ?? '',
    estimated_values: q.estimated_values ?? '',
    existing_cover: q.existing_cover ?? '',
    renewal_date: q.renewal_date ?? '',
    next_action: lead.next_action ?? '',
    next_action_due: lead.next_action_due_at ? lead.next_action_due_at.slice(0, 10) : '',
  })
  const [activityKind, setActivityKind] = useState<'contact' | 'note' | 'follow_up'>('contact')
  const [outcome, setOutcome] = useState('Reached')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const researchHint = Boolean(data.prospect || lead.source === 'russ_research')

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const saveQual = (markQualified?: boolean) => {
    setError(null)
    save.mutate(
      {
        lead_id: lead.id,
        contact_person: form.contact_person,
        confirmed_cover_need: form.confirmed_cover_need,
        assets: form.assets,
        estimated_values: form.estimated_values,
        existing_cover: form.existing_cover,
        renewal_date: form.renewal_date,
        next_action: form.next_action || undefined,
        next_action_due_at: form.next_action_due ? new Date(`${form.next_action_due}T09:00:00`).toISOString() : null,
        mark_qualified: markQualified,
      },
      {
        onSuccess: () => {
          if (acceptedOrLater) setEditing(false)
        },
        onError: (e) => setError((e as Error).message),
      },
    )
  }

  const submitActivity = () => {
    setError(null)
    log.mutate(
      {
        lead_id: lead.id,
        kind: activityKind,
        outcome: activityKind === 'contact' ? outcome : undefined,
        note: note.trim() || undefined,
        successful_contact: activityKind === 'contact' && outcome === 'Reached',
        next_action: activityKind === 'follow_up' ? form.next_action || note.trim() || 'Follow up' : undefined,
        next_action_due_at:
          activityKind === 'follow_up' && form.next_action_due
            ? new Date(`${form.next_action_due}T09:00:00`).toISOString()
            : undefined,
      },
      {
        onSuccess: () => {
          setNote('')
        },
        onError: (e) => setError((e as Error).message),
      },
    )
  }

  const activities = ([...(lead.activity ?? [])] as LeadActivityEntry[]).sort((a, b) => b.at.localeCompare(a.at))

  return (
    <div className="space-y-6">
      <section id="lead-qualify" className="panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-navy-900">Qualification</h2>
            <p className="mt-0.5 text-xs text-navy-600">
              {editing
                ? 'Save partial information. Research stays labelled separately until you confirm it.'
                : 'Confirmed summary. Edit only when something needs updating.'}
            </p>
          </div>
          {acceptedOrLater && !editing && (
            <button
              type="button"
              className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-navy-700 ring-1 ring-navy-800/10 hover:bg-mist"
              onClick={() => setEditing(true)}
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit qualification
            </button>
          )}
        </div>

        {!editing ? (
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            {FIELDS.map(([key, label]) => (
              <div key={key}>
                <dt className="flex items-center justify-between gap-2 text-[10px] font-semibold tracking-wide text-navy-500 uppercase">
                  {label}
                  <Provenance field={key} confirmed={lead.qualification_confirmed} research={researchHint && !lead.qualification_confirmed?.[key]} />
                </dt>
                <dd className="mt-0.5 text-sm text-navy-900">{form[key]?.trim() || '—'}</dd>
              </div>
            ))}
            <div className="sm:col-span-2">
              <dt className="text-[10px] font-semibold tracking-wide text-navy-500 uppercase">Next follow-up</dt>
              <dd className="mt-0.5 text-sm text-navy-900">
                {form.next_action?.trim() || '—'}
                {form.next_action_due ? ` · due ${form.next_action_due}` : ''}
              </dd>
            </div>
          </dl>
        ) : (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {FIELDS.map(([key, label, ph]) => (
                <label key={key} className="block text-xs font-medium text-navy-700">
                  <span className="flex items-center justify-between gap-2">
                    {label}
                    <Provenance field={key} confirmed={lead.qualification_confirmed} research={researchHint && !lead.qualification_confirmed?.[key]} />
                  </span>
                  <input className="field mt-1" value={form[key]} onChange={(e) => set(key, e.target.value)} placeholder={ph} />
                </label>
              ))}
              <label className="block text-xs font-medium text-navy-700 sm:col-span-2">
                Next follow-up
                <input className="field mt-1" value={form.next_action} onChange={(e) => set('next_action', e.target.value)} placeholder="Confirm workshop assets and values" />
              </label>
              <label className="block text-xs font-medium text-navy-700">
                Due
                <input type="date" className="field mt-1" value={form.next_action_due} onChange={(e) => set('next_action_due', e.target.value)} />
              </label>
            </div>
            {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" variant="accent" disabled={save.isPending} onClick={() => saveQual(false)}>
                {save.isPending ? 'Saving…' : 'Save'}
              </Button>
              {(lead.status === 'lead' || lead.status === 'contacted') && (
                <Button size="sm" variant="outline" disabled={save.isPending} onClick={() => saveQual(true)}>
                  Mark qualified
                </Button>
              )}
              {acceptedOrLater && (
                <Button size="sm" variant="ghost" type="button" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              )}
            </div>
          </>
        )}
      </section>

      <section className="panel p-5">
        <h2 className="text-sm font-semibold text-navy-900">Activity</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {(['contact', 'note', 'follow_up'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setActivityKind(k)}
              className={`cursor-pointer rounded-full px-3 py-1 text-xs font-semibold ${activityKind === k ? 'bg-navy-800 text-white' : 'bg-mist text-navy-700'}`}
            >
              {k === 'contact' ? 'Log contact' : k === 'note' ? 'Add note' : 'Set follow-up'}
            </button>
          ))}
        </div>
        {activityKind === 'contact' && (
          <label className="mt-3 block text-xs font-medium text-navy-700">
            Outcome
            <select className="field mt-1" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
              <option value="Reached">Reached</option>
              <option value="No answer">No answer</option>
              <option value="Left message">Left message</option>
              <option value="Wrong number">Wrong number</option>
            </select>
          </label>
        )}
        <label className="mt-3 block text-xs font-medium text-navy-700">
          {activityKind === 'note' ? 'Note' : 'Detail'}
          <textarea className="field mt-1 min-h-[3.5rem]" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened…" />
        </label>
        <Button size="sm" className="mt-3" disabled={log.isPending} onClick={submitActivity}>
          {log.isPending ? 'Saving…' : 'Record'}
        </Button>
        <ul className="mt-4 space-y-2">
          {activities.length === 0 && <li className="text-xs text-navy-500">No activity yet.</li>}
          {activities.map((a) => (
            <li key={a.id} className="rounded-lg border border-navy-800/10 px-3 py-2 text-xs text-navy-800">
              <span className="font-semibold capitalize">{a.kind.replace('_', ' ')}</span>
              {a.outcome ? ` · ${a.outcome}` : ''}
              {a.note ? ` — ${a.note}` : ''}
              <span className="mt-0.5 block text-[11px] text-navy-500">{formatDateTime(a.at)}{a.by ? ` · ${a.by}` : ''}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
