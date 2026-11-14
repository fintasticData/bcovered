import { beforeEach, describe, expect, it } from 'vitest'
import '../api'
import { registerRoute, routeIntentOf, type ClientSnapshot, type RoutePort } from '@/routes'
import { A, chooseCover, compareQuotes, getQuotes, markFollowUp, reviewClient, reviewVehicle, selectClient, STALE_REASON } from '@/routes/motorQuotes'
import { runRussRouteTurn as russTurn, type RouteOps } from '@/routes/russ'
import { SEED_IDS } from '../db/seed'
import { db } from '../db/store'
import { getRouteProgress, runRouteAction, startRoute } from '../routesApi'

const broker = { userId: SEED_IDS.users.broker }
const PERSON = '7d0c0a8e-0000-4000-8000-00000000c001'

const client = (over: Partial<ClientSnapshot> = {}): ClientSnapshot => ({
  person_id: PERSON,
  client_number: 'CL-S1001',
  name: 'Ayanda Sample',
  first_names: 'Ayanda',
  surname: 'Sample',
  phone: '082 555 0101',
  email: null,
  category: 'sample',
  ...over,
})

/** Stands in for Supabase: one saved record per idempotency key, like copilot_replay. */
function fakePort(snapshot: ClientSnapshot = client()) {
  const saved = new Map<string, { id: string; reference: string; body?: string; title?: string }>()
  let fail = false
  const write = (key: string, extra: { body?: string; title?: string }) => {
    if (fail) throw new Error('Supabase is unreachable.')
    if (!saved.has(key)) saved.set(key, { id: `rec-${saved.size + 1}`, reference: `NT-S${1001 + saved.size}`, ...extra })
    return saved.get(key)!
  }
  const port: RoutePort = {
    clientRecord: async () => snapshot,
    logNote: async (a) => write(a.key, { body: a.body }),
    followUp: async (a) => write(a.key, { title: a.title }),
  }
  return { port, saved, failNext: (v: boolean) => (fail = v) }
}

let n = 0
const key = () => `test-key-${++n}-${Math.random().toString(36).slice(2)}`

async function act(port: RoutePort, runId: string, actionId: string, input: Record<string, unknown> = {}, as: 'person' | 'russ' = 'person') {
  return runRouteAction(broker, { run_id: runId, action_id: actionId, input: input as never, key: key() }, port, as)
}

/** Russ through the same route functions as the buttons, acting as Russ. */
const russOps = (port: RoutePort): RouteOps => ({
  start: (b) => startRoute(broker, b, port, 'russ'),
  progress: async (id) => getRouteProgress(broker, { run_id: id }, 'russ'),
  runAction: (b) => runRouteAction(broker, b, port, 'russ'),
})
async function runRussRouteTurn(_auth: unknown, req: { text: string; run_id?: string; person_id?: string }, port: RoutePort) {
  const turn = await russTurn(russOps(port), req)
  if (!turn) throw new Error('not a Route turn')
  return turn
}

const statusOf = (p: Awaited<ReturnType<typeof act>>['progress'], id: string) => p.phases.flatMap((x) => x.actions).find((a) => a.id === id)!

beforeEach(() => db.reset())

describe('Route engine', () => {
  it('starts from a client, resumes the same run and blocks actions whose prerequisites are missing', async () => {
    const { port } = fakePort()
    const s = await startRoute(broker, { definition_id: 'motor_quotes', person_id: PERSON, key: key() }, port)
    expect(s.outcome.status).toBe('done')
    expect(s.progress.run.subject_label).toBe('Ayanda Sample (CL-S1001)')
    expect(statusOf(s.progress, A.select).status).toBe('done')
    expect(s.progress.next?.id).toBe(A.review)
    expect(statusOf(s.progress, A.cover)).toMatchObject({ status: 'blocked', reason: 'Review vehicle comes first.' })

    const again = await startRoute(broker, { definition_id: 'motor_quotes', person_id: PERSON, key: key() }, port)
    expect(again.resumed).toBe(true)
    expect(again.progress.run.id).toBe(s.progress.run.id)

    const early = await act(port, s.progress.run.id, A.quotes)
    expect(early.outcome).toMatchObject({ status: 'blocked', message: 'Review client details comes first.' })
  })

  it('fills missing contact details from the demo sample and leaves cover unset', async () => {
    const { port } = fakePort()
    const s = await startRoute(broker, { definition_id: 'motor_quotes', person_id: PERSON, key: key() }, port)
    const form = s.progress.run.state.form as Record<string, string>
    expect(form).toMatchObject({ name: 'Ayanda', surname: 'Sample', mobile: '0825550101', email: 'lerato.sample@example.com', cover: '' })
    expect(s.progress.run.state.filled_from_sample).toContain('email')
  })

  it('refuses Live clients', async () => {
    const { port } = fakePort(client({ category: 'live' }))
    const s = await startRoute(broker, { definition_id: 'motor_quotes', person_id: PERSON, key: key() }, port)
    expect(s.outcome).toMatchObject({ status: 'failed', message: 'Routes run on Sample clients only. Choose a Sample client.' })
    expect(statusOf(s.progress, A.select).status).toBe('available')
  })

  it('needs an explicit confirmation for reviews and keeps a failed action open with its reason', async () => {
    const { port } = fakePort()
    const run = (await startRoute(broker, { definition_id: 'motor_quotes', person_id: PERSON, key: key() }, port)).progress.run.id
    const unconfirmed = await act(port, run, A.review)
    expect(unconfirmed.outcome).toMatchObject({ status: 'needs_input', message: 'Confirm “Review client details” to continue.' })
    const bad = await act(port, run, A.review, { confirmed: true, email: 'not-an-email' })
    expect(bad.outcome.status).toBe('needs_input')
    expect(bad.outcome.fields).toHaveProperty('email')
    expect(statusOf(bad.progress, A.review)).toMatchObject({ status: 'available', last_issue: { status: 'needs_input' } })
    const ok = await act(port, run, A.review, { confirmed: true, email: 'ayanda@example.com' })
    expect(ok.outcome.status).toBe('done')
    expect(statusOf(ok.progress, A.review).done?.by).toBe('Thabo Nkosi')
    expect(statusOf(ok.progress, A.review).last_issue).toBeNull()
  })

  it('replays a repeated key instead of running the action twice', async () => {
    const { port, saved } = fakePort()
    const run = (await startRoute(broker, { definition_id: 'motor_quotes', person_id: PERSON, key: key() }, port)).progress.run.id
    await act(port, run, A.review, { confirmed: true })
    await act(port, run, A.vehicle)
    await act(port, run, A.cover, { cover: '0' })
    await act(port, run, A.quotes)
    await act(port, run, A.compare, { confirmed: true })
    const quoteId = (getRouteProgress(broker, { run_id: run }).run.state.quotes as { result: { quotes: Array<{ quoteID: number; hasQuote: boolean }> } }).result.quotes[0].quoteID
    const k = key()
    const first = await runRouteAction(broker, { run_id: run, action_id: A.preferred, input: { confirmed: true, quote_id: quoteId }, key: k }, port)
    const second = await runRouteAction(broker, { run_id: run, action_id: A.preferred, input: { confirmed: true, quote_id: quoteId }, key: k }, port)
    expect(first.outcome.status).toBe('done')
    expect(second.outcome.replayed).toBe(true)
    expect(saved.size).toBe(1)
    expect(db.snapshot().route_action_results.filter((r) => r.action_id === A.preferred)).toHaveLength(1)
  })

  it('marks quotes out of date when the vehicle or cover changes, and blocks the outcome until quotes are fetched again', async () => {
    const { port } = fakePort()
    const run = (await startRoute(broker, { definition_id: 'motor_quotes', person_id: PERSON, key: key() }, port)).progress.run.id
    await act(port, run, A.review, { confirmed: true })
    await act(port, run, A.vehicle)
    await act(port, run, A.cover, { cover: '0' })
    await act(port, run, A.quotes)
    await act(port, run, A.compare, { confirmed: true })

    const changed = await act(port, run, A.cover, { cover: '1' })
    expect(statusOf(changed.progress, A.quotes)).toMatchObject({ status: 'stale', reason: STALE_REASON })
    expect(statusOf(changed.progress, A.preferred)).toMatchObject({ status: 'blocked', reason: STALE_REASON })
    expect(changed.progress.next?.id).toBe(A.quotes)
    expect(changed.progress.phases.find((p) => p.id === 'motor_quotes.compare')!.status).toBe('current')
    expect((changed.progress.run.state.client as ClientSnapshot).name).toBe('Ayanda Sample')

    const sameVehicle = await act(port, run, A.vehicle)
    expect(statusOf(sameVehicle.progress, A.quotes).status).toBe('stale')
    const fresh = await act(port, run, A.quotes)
    expect(statusOf(fresh.progress, A.compare)).toMatchObject({ status: 'stale', reason: 'New quotes: compare them again' })
    const compared = await act(port, run, A.compare, { confirmed: true })
    expect(statusOf(compared.progress, A.preferred).status).toBe('available')

    const vehicle = await act(port, run, A.vehicle, { meadCode: '87654321' })
    expect(statusOf(vehicle.progress, A.compare)).toMatchObject({ status: 'blocked', reason: STALE_REASON })
  })

  it('records the outcome only once Supabase confirms it, and completes the run', async () => {
    const { port, saved, failNext } = fakePort()
    const run = (await startRoute(broker, { definition_id: 'motor_quotes', person_id: PERSON, key: key() }, port)).progress.run.id
    await act(port, run, A.review, { confirmed: true })
    await act(port, run, A.vehicle)
    await act(port, run, A.cover, { cover: '0' })
    await act(port, run, A.quotes)
    await act(port, run, A.compare, { confirmed: true })
    failNext(true)
    const failed = await act(port, run, A.followUp, { confirmed: true, due_date: '2099-01-15', note: 'Call after payday' })
    expect(failed.outcome).toMatchObject({ status: 'failed', message: 'Supabase is unreachable.' })
    expect(failed.progress.complete).toBe(false)
    failNext(false)
    const ok = await act(port, run, A.followUp, { confirmed: true, due_date: '2099-01-15', note: 'Call after payday' })
    expect(ok.outcome.status).toBe('done')
    expect(ok.progress.complete).toBe(true)
    expect(ok.progress.run.status).toBe('completed')
    expect(statusOf(ok.progress, A.preferred).status).toBe('not_needed')
    expect([...saved.values()][0].title).toBe('Motor quotes follow-up: Call after payday')
    const after = await act(port, run, A.cover, { cover: '2' })
    expect(after.outcome).toMatchObject({ status: 'blocked', message: 'This Route is complete.' })
  })

  it('never lets Russ do a person action', async () => {
    const { port } = fakePort()
    const run = (await startRoute(broker, { definition_id: 'motor_quotes', person_id: PERSON, key: key() }, port)).progress.run.id
    const r = await act(port, run, A.review, { confirmed: true }, 'russ')
    expect(r.outcome.status).toBe('blocked')
    expect(r.outcome.message).toMatch(/^Needs you:/)
    expect(statusOf(r.progress, A.review).status).toBe('available')
  })

  it('runs a second Route built only from a new definition', async () => {
    registerRoute({
      id: 'test_quick_quote',
      title: 'Quick sample quote',
      outcome: 'A follow-up after a quick comparison.',
      subject: 'client',
      category: 'sample',
      intents: ['quick sample quote'],
      selectActionId: A.select,
      phases: [
        { id: 'q.client', title: 'Client', complete: 'all', actions: [selectClient, reviewClient] },
        { id: 'q.quote', title: 'Quote', complete: 'all', actions: [reviewVehicle, chooseCover, getQuotes, compareQuotes] },
        { id: 'q.next', title: 'Next step', complete: 'any', actions: [markFollowUp] },
      ],
    })
    expect(routeIntentOf('Can you do a quick sample quote for her?')?.id).toBe('test_quick_quote')
    const { port } = fakePort()
    const s = await startRoute(broker, { definition_id: 'test_quick_quote', person_id: PERSON, key: key() }, port)
    const run = s.progress.run.id
    expect(s.progress.phases.map((p) => p.title)).toEqual(['Client', 'Quote', 'Next step'])
    await act(port, run, A.review, { confirmed: true })
    const russ = await runRussRouteTurn(broker, { text: 'continue', run_id: run }, port)
    expect(russ.paused_at?.id).toBe(A.cover)
    await act(port, run, A.cover, { cover: '0' })
    await runRussRouteTurn(broker, { text: 'continue', run_id: run }, port)
    await act(port, run, A.compare, { confirmed: true })
    const done = await act(port, run, A.followUp, { confirmed: true, due_date: '2099-02-01', note: 'Send by email' })
    expect(done.progress.complete).toBe(true)
  })
})

describe('Prepare motor quotes acceptance', () => {
  it('runs through buttons and Russ on the same saved progress and survives a reload', async () => {
    const { port, saved } = fakePort()
    expect(routeIntentOf('Prepare motor quotes for Ayanda')?.id).toBe('motor_quotes')

    // 1–2. Start from a Sample client and finish phase 1 with the buttons.
    const run = (await startRoute(broker, { definition_id: 'motor_quotes', person_id: PERSON, key: key() }, port)).progress.run.id
    const phase1 = await act(port, run, A.review, { confirmed: true })
    expect(phase1.progress.phases[0].status).toBe('done')

    // 3. Russ continues: Review vehicle runs automatically, then it pauses at Choose cover.
    const russ = await runRussRouteTurn(broker, { text: 'continue', run_id: run }, port)
    expect(russ.ran.map((r) => r.action_id)).toEqual([A.vehicle])
    expect(russ.paused_at).toMatchObject({ id: A.cover, label: 'Choose cover' })
    expect(statusOf(russ.progress, A.vehicle).done).toMatchObject({ by: 'Russ', by_type: 'agent' })

    // 4. The broker chooses cover in the guide.
    await act(port, run, A.cover, { cover: '0' })

    // 5. Reload: the same run reopens at Get sample quotes with the client and choices intact.
    const stored = JSON.parse(JSON.stringify(db.snapshot()))
    db.reset()
    expect(db.snapshot().route_runs).toHaveLength(0)
    db.hydrate(stored)
    const reopened = getRouteProgress(broker, { run_id: run })
    expect(reopened.next?.id).toBe(A.quotes)
    expect(reopened.run.subject_label).toBe('Ayanda Sample (CL-S1001)')
    expect((reopened.run.state.form as Record<string, string>).cover).toBe('0')

    // 6. Russ gets quotes, the broker compares them and records the preferred quote.
    const quotes = await runRussRouteTurn(broker, { text: 'continue', run_id: run }, port)
    expect(quotes.ran.map((r) => r.action_id)).toEqual([A.quotes])
    expect(quotes.paused_at?.id).toBe(A.compare)
    const result = (quotes.progress.run.state.quotes as { result: { quotes: unknown[] } }).result
    expect(result.quotes).toHaveLength(3)
    await act(port, run, A.compare, { confirmed: true })
    const done = await act(port, run, A.preferred, { confirmed: true, quote_id: 700101 })
    expect(done.outcome.message).toContain('Demo Insurer A at R780/month')
    expect(done.progress.complete).toBe(true)
    expect([...saved.values()][0].body).toContain('Demo · Sample quotes; not an insurer offer')
  })
})
