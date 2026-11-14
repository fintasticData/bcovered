// Work surfaces for the Prepare motor quotes Route: each action's editor, reusing the private motor quote demo.
import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { CalendarClock, CheckCircle2, Loader2, Search, StickyNote } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ActionOutcome, ActionProgress, RouteProgress } from '@/api/client'
import { salesApi, useSalesProfile } from '@/copilot/salesApi'
import { SAMPLE_MOTOR_REQUEST } from '@/data/qe/sampleMotorRequest'
import { useSupabaseAuth } from '@/lib/supabase/client'
import { buildMotorRequest, coverLabel, formatRand } from '@/lib/qe/sampleQuotes'
import type { MotorFormErrors, MotorQuoteForm } from '@/lib/qe/types'
import { cn } from '@/lib/utils'
import type { ActionInput } from '@/routes'
import { A, CLIENT_FIELDS, cheapest, clientOf, draftOf, outcomeOf, quotedOf, quotesOf, VEHICLE_FIELDS, type MotorDraft } from '@/routes/motorQuotes'
import { Field, inputClass, StageBadge, today } from '../book/bits'
import { MotorRequestForm, type MotorFormSection } from '../quotes/MotorRequestForm'
import { QeOfferDialog } from '../quotes/QeOfferDialog'
import { QeQuoteComparison, SubmittedRequestSummary } from '../quotes/QeQuoteComparison'

export interface SurfaceProps {
  progress: RouteProgress
  action: ActionProgress
  busy: boolean
  /** The last outcome of this action in this visit: field errors to show. */
  outcome: ActionOutcome | null
  run: (input: ActionInput) => void
  goTo: (actionId: string) => void
}

const FIELD_LABEL: Record<string, string> = {
  name: 'name', surname: 'surname', mobile: 'mobile', email: 'email', street: 'street', suburb: 'suburb', postalCode: 'postal code', meadCode: 'M&M code', year: 'model year',
}

function Note({ children }: { children: ReactNode }) {
  return <p className="rounded-lg bg-navy-50/70 px-3 py-2 text-xs text-navy-700">{children}</p>
}

function SelectClient({ progress, busy, run }: SurfaceProps) {
  const auth = useSupabaseAuth()
  const profile = useSalesProfile()
  const scope = profile.data?.book_restricted ? 'mine' : 'team'
  const [query, setQuery] = useState('')
  const grid = useQuery({
    queryKey: ['supabase', auth.userId, 'sample', 'sales', 'route-client-picker', scope, query.trim()],
    queryFn: () => salesApi.grid('sample', { scope, query: query.trim() || null }),
    enabled: auth.status === 'signed_in' && profile.isSuccess,
    retry: false,
    placeholderData: (prev) => prev,
  })
  const current = progress.run.subject_id
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 text-navy-500" aria-hidden />
        <input className={inputClass} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search Sample clients by name or client number" aria-label="Search Sample clients" />
      </div>
      {auth.status !== 'signed_in' && <Note>Sign in to the database to list your Sample clients.</Note>}
      {grid.isLoading && <p className="flex items-center gap-2 text-xs text-navy-600"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading Sample clients…</p>}
      {grid.error && <Note>{(grid.error as Error).message}</Note>}
      {grid.data && grid.data.rows.length === 0 && <Note>No Sample clients yet. Add one in My workspace (Sample), then come back.</Note>}
      <ul className="max-h-80 space-y-1.5 overflow-y-auto pr-1" aria-label="Sample clients">
        {grid.data?.rows.map((c) => (
          <li key={c.id} className={cn('flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm', c.id === current ? 'border-brand-500 bg-brand-50/60' : 'border-navy-800/10')}>
            <span className="min-w-0">
              <span className="block truncate font-medium text-navy-900">{c.name}</span>
              <span className="flex items-center gap-1.5 text-xs text-navy-600"><span className="font-mono">{c.client_number}</span> <StageBadge stage={c.stage} /></span>
            </span>
            <Button size="sm" variant={c.id === current ? 'outline' : 'accent'} disabled={busy} onClick={() => run({ person_id: c.id })}>
              {c.id === current ? 'Selected' : 'Select'}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** One part of the motor request, edited with the demo's own form and confirmed through the Route action. */
function RequestPart({ progress, busy, outcome, run, sections, fields, submitLabel, confirm }: SurfaceProps & { sections: MotorFormSection[]; fields: readonly string[]; submitLabel: string; confirm: boolean }) {
  const saved = draftOf(progress.run.state)
  const [draft, setDraft] = useState<MotorDraft | null>(saved)
  if (!draft || !saved) return <Note>Select a Sample client first.</Note>
  const errors = (outcome?.fields ?? {}) as MotorFormErrors
  const filled = ((progress.run.state.filled_from_sample ?? []) as string[]).filter((f) => fields.includes(f))
  const submit = () => {
    const input: ActionInput = Object.fromEntries(fields.map((f) => [f, draft[f as keyof MotorDraft]]))
    if (fields.includes('cover')) input.cover = draft.cover
    if (confirm) input.confirmed = true
    run(input)
  }
  return (
    <div className="space-y-3">
      {filled.length > 0 && (
        <Note>Filled from the demo sample because the client record has none: {filled.map((f) => FIELD_LABEL[f] ?? f).join(', ')}. Change them if you have the client’s own details.</Note>
      )}
      <MotorRequestForm
        form={draft}
        errors={errors}
        starter={SAMPLE_MOTOR_REQUEST}
        sections={sections}
        submitLabel={submitLabel}
        busy={busy}
        onChange={(field, value) => setDraft((d) => (d ? { ...d, [field]: value } : d))}
        onSubmit={submit}
      />
    </div>
  )
}

function GetQuotes({ progress, busy, run, goTo, action }: SurfaceProps) {
  const draft = draftOf(progress.run.state)
  if (!draft) return <Note>Select a Sample client first.</Note>
  const request = buildMotorRequest({ ...draft, cover: draft.cover || '0' } as MotorQuoteForm)
  return (
    <div className="space-y-3">
      {action.status === 'stale' && <Note>The request changed after the last quotes. Get sample quotes again before recording an outcome.</Note>}
      {draft.cover ? <SubmittedRequestSummary request={request} onEdit={() => goTo(A.vehicle)} /> : <Note>Choose cover first.</Note>}
      <div className="flex justify-end">
        <Button variant="accent" disabled={busy || !draft.cover} onClick={() => run({})}>
          {busy ? <Loader2 className="animate-spin" /> : <Search />} Get sample quotes
        </Button>
      </div>
    </div>
  )
}

function Compare({ progress, busy, run }: SurfaceProps) {
  const quotes = quotesOf(progress.run.state)
  const [open, setOpen] = useState<number | null>(null)
  if (!quotes) return <Note>Get sample quotes first.</Note>
  const openQuote = quotes.result.quotes?.find((q) => q.quoteID === open)
  return (
    <div className="space-y-3">
      <QeQuoteComparison result={quotes.result} request={quotes.request} onOpen={setOpen} />
      <div className="flex flex-wrap items-center justify-end gap-2">
        <p className="text-xs text-navy-600">Sample premiums are fixed demo values, not insurer offers.</p>
        <Button variant="accent" disabled={busy} onClick={() => run({ confirmed: true })}>
          <CheckCircle2 /> Confirm I’ve reviewed the quotes
        </Button>
      </div>
      {openQuote && <QeOfferDialog quote={openQuote} request={quotes.request} onClose={() => setOpen(null)} />}
    </div>
  )
}

function Preferred({ progress, busy, run, outcome }: SurfaceProps) {
  const quoted = quotedOf(progress.run.state)
  const low = cheapest(quoted)
  const [choice, setChoice] = useState<number | null>(low?.quoteID ?? null)
  const client = clientOf(progress.run.state)
  return (
    <div className="space-y-3">
      <fieldset className="space-y-1.5">
        <legend className="mb-1 text-xs font-semibold text-navy-700">The client’s preferred quote</legend>
        {quoted.map((q) => (
          <label key={q.quoteID} className={cn('flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm', choice === q.quoteID ? 'border-brand-500 bg-brand-50/60' : 'border-navy-800/10')}>
            <span className="flex items-center gap-2">
              <input type="radio" name="preferred" checked={choice === q.quoteID} onChange={() => setChoice(q.quoteID)} />
              <span className="font-medium text-navy-900">{q.insurerName}</span>
              {q.quoteID === low?.quoteID && quoted.length > 1 && <span className="rounded bg-emerald-50 px-1 text-[11px] font-semibold text-emerald-800">Lowest premium</span>}
            </span>
            <span className="font-semibold text-navy-900">{formatRand(q.totalPremium)}/month</span>
          </label>
        ))}
      </fieldset>
      {outcome?.fields?.quote_id && <p className="text-xs text-red-700">{outcome.fields.quote_id}</p>}
      <Note>Saves a Sample note on {client?.name ?? 'the client'}’s Communications timeline, labelled Demo · Sample quotes. It is kept with the client’s record.</Note>
      <div className="flex justify-end">
        <Button variant="accent" disabled={busy || choice === null} onClick={() => run({ confirmed: true, quote_id: choice })}>
          {busy ? <Loader2 className="animate-spin" /> : <StickyNote />} Record preferred quote
        </Button>
      </div>
    </div>
  )
}

function FollowUp({ progress, busy, run, outcome }: SurfaceProps) {
  const [due, setDue] = useState(() => new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const client = clientOf(progress.run.state)
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
        <Field label="Follow up on" htmlFor="rt-due">
          <input id="rt-due" type="date" min={today()} className={inputClass} value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <Field label="Note" htmlFor="rt-note">
          <input id="rt-note" className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Call back once she has spoken to her husband" />
        </Field>
      </div>
      {outcome?.fields && (outcome.fields.note || outcome.fields.due_date) && <p className="text-xs text-red-700">{[outcome.fields.due_date, outcome.fields.note].filter(Boolean).join(' ')}</p>}
      <Note>Creates a Sample follow-up on {client?.name ?? 'the client'}’s record (Open follow-ups).</Note>
      <div className="flex justify-end">
        <Button variant="accent" disabled={busy || note.trim().length < 3} onClick={() => run({ confirmed: true, due_date: due, note: note.trim() })}>
          {busy ? <Loader2 className="animate-spin" /> : <CalendarClock />} Mark for follow-up
        </Button>
      </div>
    </div>
  )
}

const ReviewClient = (p: SurfaceProps) => <RequestPart {...p} sections={['policyholder', 'address']} fields={CLIENT_FIELDS} submitLabel="Confirm client details" confirm />
const ReviewVehicle = (p: SurfaceProps) => <RequestPart {...p} sections={['vehicle']} fields={VEHICLE_FIELDS} submitLabel="Confirm vehicle" confirm={false} />
const ChooseCover = (p: SurfaceProps) => <RequestPart {...p} sections={['cover']} fields={['cover']} submitLabel="Save cover" confirm={false} />

export const MOTOR_SURFACES: Record<string, (p: SurfaceProps) => ReactNode> = {
  [A.select]: SelectClient,
  [A.review]: ReviewClient,
  [A.vehicle]: ReviewVehicle,
  [A.cover]: ChooseCover,
  [A.quotes]: GetQuotes,
  [A.compare]: Compare,
  [A.preferred]: Preferred,
  [A.followUp]: FollowUp,
}

/** What the finished Route produced, with the place to see it on the client's record. */
export function MotorOutcomeCard({ progress }: { progress: RouteProgress }) {
  const outcome = outcomeOf(progress.run.state)
  const client = clientOf(progress.run.state)
  const draft = draftOf(progress.run.state)
  if (!outcome || !client) return null
  const tab = outcome.kind === 'preferred' ? 'comms' : 'overview'
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
      <p className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4" /> {progress.route.title} is complete</p>
      <p className="mt-1">
        {outcome.kind === 'preferred'
          ? `Preferred quote ${outcome.insurer} at ${formatRand(outcome.premium ?? 0)}/month (${coverLabel(draft?.cover || undefined)}) saved as note ${outcome.reference}.`
          : `Follow-up ${outcome.reference} due ${outcome.due_date}: ${outcome.note}.`}
      </p>
      <Link to={`/broker/book/clients/${client.person_id}?rtab=${tab}`} className="mt-2 inline-block text-xs font-semibold text-emerald-800 underline">
        Open {client.name}’s {outcome.kind === 'preferred' ? 'Communications' : 'follow-ups'}
      </Link>
    </div>
  )
}
