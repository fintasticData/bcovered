// Route 1: Prepare motor quotes, built on the private motor quote demo (fixed Demo · Sample quotes, never an insurer
// offer). The outcome is written to the client's Communications timeline or follow-ups in Supabase (Sample).
import { SAMPLE_MOTOR_REQUEST } from '@/data/qe/sampleMotorRequest'
import { buildMotorRequest, coverLabel, formatRand, formFromRequest, getSampleQuotes, isCoverCode, isQuoted, validateMotorForm } from '@/lib/qe/sampleQuotes'
import type { CoverCode, MotorQuoteForm, QeInsurerQuote, QeMotorRequest, QeResult } from '@/lib/qe/types'
import type { Json } from '@/server/db/schema'
import { registerRoute, type ActionInput, type Check, type ClientSnapshot, type RouteAction, type RouteDefinition, type RouteState } from './definitions'

/** The request draft as the broker edits it. Cover starts unset so the broker always chooses it. */
export type MotorDraft = Omit<MotorQuoteForm, 'cover'> & { cover: CoverCode | '' }

export interface MotorQuotes {
  request: QeMotorRequest
  result: QeResult
  at: string
}

export interface MotorOutcome {
  kind: 'preferred' | 'follow_up'
  reference: string
  record_id: string
  insurer?: string
  premium?: number
  due_date?: string
  note?: string
}

export const CLIENT_FIELDS = ['name', 'surname', 'mobile', 'email', 'street', 'suburb', 'postalCode'] as const
export const VEHICLE_FIELDS = ['meadCode', 'year'] as const
type DraftField = (typeof CLIENT_FIELDS)[number] | (typeof VEHICLE_FIELDS)[number]

export const STALE_REASON = 'Quotes are out of date: Get sample quotes again'

export const A = {
  select: 'motor_quotes.client.select',
  review: 'motor_quotes.client.review',
  vehicle: 'motor_quotes.request.vehicle',
  cover: 'motor_quotes.request.cover',
  quotes: 'motor_quotes.compare.get_quotes',
  compare: 'motor_quotes.compare.review',
  preferred: 'motor_quotes.outcome.preferred',
  followUp: 'motor_quotes.outcome.follow_up',
} as const

// ---------------------------------------------------------------- state helpers (shared with the guide)

export const clientOf = (s: RouteState) => (s.client ?? null) as ClientSnapshot | null
export const draftOf = (s: RouteState) => (s.form ?? null) as unknown as MotorDraft | null
export const quotesOf = (s: RouteState) => (s.quotes ?? null) as unknown as MotorQuotes | null
export const outcomeOf = (s: RouteState) => (s.outcome ?? null) as unknown as MotorOutcome | null
export const quotedOf = (s: RouteState) => (quotesOf(s)?.result.quotes ?? []).filter(isQuoted)
const asJson = (v: unknown) => v as Json

const validMobile = (v: string | null) => Boolean(v && /^(\+27|0)\d{9}$/.test(v.replace(/\s/g, '')))
const validEmail = (v: string | null) => Boolean(v && /^\S+@\S+\.\S+$/.test(v.trim()))

/** The client's own name and contact details; demo sample values fill whatever the client record does not have. */
export function draftForClient(c: ClientSnapshot): { draft: MotorDraft; filled: string[] } {
  const base = formFromRequest(SAMPLE_MOTOR_REQUEST)
  const filled: string[] = ['street', 'suburb', 'postalCode', 'meadCode', 'year']
  if (!validMobile(c.phone)) filled.push('mobile')
  if (!validEmail(c.email)) filled.push('email')
  return {
    draft: {
      ...base,
      name: c.first_names,
      surname: c.surname,
      mobile: validMobile(c.phone) ? c.phone!.replace(/\s/g, '') : base.mobile,
      email: validEmail(c.email) ? c.email!.trim() : base.email,
      cover: '',
    },
    filled,
  }
}

function edits(input: ActionInput, fields: readonly DraftField[]): Partial<MotorDraft> {
  const out: Partial<MotorDraft> = {}
  for (const f of fields) if (typeof input[f] === 'string') out[f] = input[f] as string
  return out
}

function fieldErrors(draft: MotorDraft, fields: readonly string[]) {
  const all = validateMotorForm({ ...draft, cover: draft.cover || '0' })
  return Object.fromEntries(Object.entries(all).filter(([k]) => fields.includes(k))) as Record<string, string>
}

const differs = (draft: MotorDraft, patch: Partial<MotorDraft>) => Object.entries(patch).some(([k, v]) => draft[k as keyof MotorDraft] !== v)

function needDraft(s: RouteState): Check | null {
  return draftOf(s) ? null : { status: 'blocked', reason: 'Select a Sample client first.' }
}

const errorsCheck = (errors: Record<string, string>, what: string): Check =>
  Object.keys(errors).length ? { status: 'needs_input', reason: `${what}: ${Object.values(errors).join(' ')}`, fields: errors } : { status: 'ok' }

export const cheapest = (quotes: QeInsurerQuote[]) => [...quotes].sort((a, b) => a.totalPremium - b.totalPremium)[0]

// ---------------------------------------------------------------- actions

export const selectClient: RouteAction = {
  id: A.select,
  label: 'Select sample client',
  kind: 'select',
  requires: [],
  russ: 'auto',
  handover: 'Choose the Sample client to prepare motor quotes for.',
  invalidates: { actions: [A.review, A.vehicle, A.cover, A.quotes, A.compare], reason: 'The client changed: review the details again' },
  check: (_s, input) => (typeof input.person_id === 'string' && input.person_id ? { status: 'ok' } : { status: 'needs_input', reason: 'Choose a Sample client.' }),
  async effect({ input, port }) {
    const c = await port.clientRecord(input.person_id as string)
    if (c.category !== 'sample') throw new Error('Routes run on Sample clients only. Choose a Sample client.')
    return asJson(c)
  },
  apply(s, _input, receipt) {
    const c = receipt as ClientSnapshot
    const prev = clientOf(s)
    const changed = prev?.person_id !== c.person_id
    const { draft, filled } = draftForClient(c)
    const patch: RouteState = changed ? { client: asJson(c), form: asJson(draft), filled_from_sample: filled, quotes: null, outcome: null } : { client: asJson(c) }
    return {
      patch,
      summary: `${c.name} (${c.client_number})`,
      changed: Boolean(prev) && changed,
      subject: { id: c.person_id, label: `${c.name} (${c.client_number})` },
    }
  },
}

export const reviewClient: RouteAction = {
  id: A.review,
  label: 'Review client details',
  kind: 'review',
  requires: [A.select],
  confirm: true,
  russ: 'person',
  handover: 'Check the policyholder’s name, contact details and address, then confirm them.',
  invalidates: { actions: [A.quotes, A.compare], reason: STALE_REASON },
  check(s, input) {
    const blocked = needDraft(s)
    if (blocked) return blocked
    return errorsCheck(fieldErrors({ ...draftOf(s)!, ...edits(input, CLIENT_FIELDS) }, CLIENT_FIELDS), 'Fix the client details')
  },
  apply(s, input) {
    const draft = draftOf(s)!
    const patch = edits(input, CLIENT_FIELDS)
    const next = { ...draft, ...patch }
    return { patch: { form: asJson(next) }, summary: `${next.name} ${next.surname} · ${next.mobile} · ${next.suburb}`, changed: differs(draft, patch) }
  },
}

export const reviewVehicle: RouteAction = {
  id: A.vehicle,
  label: 'Review vehicle',
  kind: 'form',
  requires: [A.review],
  russ: 'auto',
  handover: 'Check the vehicle’s M&M code and model year.',
  invalidates: { actions: [A.quotes, A.compare], reason: STALE_REASON },
  check(s, input) {
    const blocked = needDraft(s)
    if (blocked) return blocked
    return errorsCheck(fieldErrors({ ...draftOf(s)!, ...edits(input, VEHICLE_FIELDS) }, VEHICLE_FIELDS), 'Check the vehicle')
  },
  apply(s, input) {
    const draft = draftOf(s)!
    const patch = edits(input, VEHICLE_FIELDS)
    const next = { ...draft, ...patch }
    return { patch: { form: asJson(next) }, summary: `M&M ${next.meadCode} · ${next.year}`, changed: differs(draft, patch) }
  },
}

export const chooseCover: RouteAction = {
  id: A.cover,
  label: 'Choose cover',
  kind: 'form',
  requires: [A.vehicle],
  russ: 'person',
  handover: 'Choose the cover type: comprehensive, third party fire and theft, third party only, theft only or total loss.',
  invalidates: { actions: [A.quotes, A.compare], reason: STALE_REASON },
  check(s, input) {
    const blocked = needDraft(s)
    if (blocked) return blocked
    return typeof input.cover === 'string' && isCoverCode(input.cover)
      ? { status: 'ok' }
      : { status: 'needs_input', reason: 'Choose a cover type.', fields: { cover: 'Choose a cover type.' } }
  },
  apply(s, input) {
    const draft = draftOf(s)!
    const cover = input.cover as CoverCode
    return { patch: { form: asJson({ ...draft, cover }) }, summary: coverLabel(cover), changed: draft.cover !== '' && draft.cover !== cover }
  },
}

export const getQuotes: RouteAction = {
  id: A.quotes,
  label: 'Get sample quotes',
  kind: 'run',
  requires: [A.review, A.vehicle, A.cover],
  russ: 'auto',
  handover: 'Get the sample quotes for this request.',
  invalidates: { actions: [A.compare], reason: 'New quotes: compare them again' },
  check(s) {
    const blocked = needDraft(s)
    if (blocked) return blocked
    const draft = draftOf(s)!
    if (!draft.cover) return { status: 'blocked', reason: 'Choose cover first.' }
    return errorsCheck(validateMotorForm(draft as MotorQuoteForm) as Record<string, string>, 'Fix the request')
  },
  apply(s) {
    const request = buildMotorRequest(draftOf(s)! as MotorQuoteForm)
    const result = getSampleQuotes(request)
    const quotes = result.quotes ?? []
    const quoted = quotes.filter(isQuoted)
    const low = cheapest(quoted)
    return {
      patch: { quotes: asJson({ request, result, at: new Date().toISOString() } satisfies MotorQuotes) },
      summary: `${quotes.length} sample insurers responded; ${quoted.length} quoted${low ? `, lowest ${formatRand(low.totalPremium)}/month (${low.insurerName})` : ''}`,
      changed: true,
    }
  },
}

export const compareQuotes: RouteAction = {
  id: A.compare,
  label: 'Compare three quotes',
  kind: 'review',
  requires: [A.quotes],
  confirm: true,
  russ: 'person',
  handover: 'Review the sample quotes side by side, then confirm you have compared them.',
  check: (s) => (quotesOf(s) ? { status: 'ok' } : { status: 'blocked', reason: 'Get sample quotes first.' }),
  apply(s) {
    const quoted = quotedOf(s)
    const low = cheapest(quoted)
    return { patch: {}, summary: `Compared ${quotesOf(s)!.result.quotes?.length ?? 0} responses${low ? `; lowest ${low.insurerName} at ${formatRand(low.totalPremium)}/month` : ''}` }
  },
}

export function preferredNote(s: RouteState, q: QeInsurerQuote) {
  const d = draftOf(s)!
  return `Preferred sample motor quote: ${q.insurerName} at ${formatRand(q.totalPremium)}/month, ${coverLabel(d.cover || undefined).toLowerCase()} cover, M&M ${d.meadCode} (${d.year}). Recorded with the Route "Prepare motor quotes" from Demo · Sample quotes; not an insurer offer.`
}

export const recordPreferred: RouteAction = {
  id: A.preferred,
  label: 'Record preferred quote',
  kind: 'decision',
  requires: [A.compare],
  confirm: true,
  russ: 'person',
  handover: 'Choose the client’s preferred quote to note it on their record, or mark the client for follow-up.',
  check(s, input) {
    const q = quotedOf(s).find((x) => x.quoteID === input.quote_id)
    return q ? { status: 'ok' } : { status: 'needs_input', reason: 'Choose one of the quoted insurers.', fields: { quote_id: 'Choose one of the quoted insurers.' } }
  },
  async effect({ state, input, key, port }) {
    const q = quotedOf(state).find((x) => x.quoteID === input.quote_id)!
    return asJson(await port.logNote({ person_id: clientOf(state)!.person_id, body: preferredNote(state, q), key }))
  },
  apply(s, input, receipt) {
    const q = quotedOf(s).find((x) => x.quoteID === input.quote_id)!
    const r = receipt as { id: string; reference: string }
    const outcome: MotorOutcome = { kind: 'preferred', reference: r.reference, record_id: r.id, insurer: q.insurerName, premium: q.totalPremium }
    return { patch: { outcome: asJson(outcome) }, summary: `${q.insurerName} at ${formatRand(q.totalPremium)}/month noted on the client’s record (${r.reference})` }
  },
}

const isoDay = /^\d{4}-\d{2}-\d{2}$/

export const markFollowUp: RouteAction = {
  id: A.followUp,
  label: 'Mark for follow-up',
  kind: 'decision',
  requires: [A.compare],
  confirm: true,
  russ: 'person',
  handover: 'Set a follow-up date and a short note.',
  check(_s, input) {
    const fields: Record<string, string> = {}
    const note = typeof input.note === 'string' ? input.note.trim() : ''
    const due = typeof input.due_date === 'string' ? input.due_date : ''
    if (note.length < 3) fields.note = 'Add a short note, e.g. call back after she checks with her husband.'
    if (!isoDay.test(due)) fields.due_date = 'Choose a follow-up date.'
    else if (due < new Date().toISOString().slice(0, 10)) fields.due_date = 'The follow-up date cannot be in the past.'
    return Object.keys(fields).length ? { status: 'needs_input', reason: Object.values(fields).join(' '), fields } : { status: 'ok' }
  },
  async effect({ state, input, key, port }) {
    const title = `Motor quotes follow-up: ${(input.note as string).trim()}`
    return asJson(await port.followUp({ person_id: clientOf(state)!.person_id, title, due_date: `${input.due_date as string}T09:00:00`, key }))
  },
  apply(_s, input, receipt) {
    const r = receipt as { id: string; reference: string }
    const outcome: MotorOutcome = { kind: 'follow_up', reference: r.reference, record_id: r.id, due_date: input.due_date as string, note: (input.note as string).trim() }
    return { patch: { outcome: asJson(outcome) }, summary: `Follow-up ${r.reference} due ${input.due_date as string}` }
  },
}

export const MOTOR_QUOTES: RouteDefinition = registerRoute({
  id: 'motor_quotes',
  title: 'Prepare motor quotes',
  outcome: 'Three sample motor quotes compared, with the client’s preferred quote or a follow-up saved on their record.',
  subject: 'client',
  category: 'sample',
  intents: ['prepare motor quotes', 'prepare motor quote', 'motor quotes', 'motor quote', 'quote her car', 'quote his car', 'car insurance quote'],
  selectActionId: A.select,
  badge: 'Demo · Sample quotes',
  phases: [
    { id: 'motor_quotes.client', title: 'Confirm client', complete: 'all', actions: [selectClient, reviewClient] },
    { id: 'motor_quotes.request', title: 'Prepare quote request', complete: 'all', actions: [reviewVehicle, chooseCover] },
    { id: 'motor_quotes.compare', title: 'Compare quotes', complete: 'all', actions: [getQuotes, compareQuotes] },
    { id: 'motor_quotes.outcome', title: 'Record outcome', complete: 'any', actions: [recordPreferred, markFollowUp] },
  ],
})
