import { describe, expect, it } from 'vitest'
import {
  dueDateIn,
  insurerReferenceIn,
  intentOf,
  namesIn,
  noteBodyIn,
  referralCodeIn,
  runTurn,
  splitClauses,
  startDateIn,
  type EntityRef,
  type JobName,
  type MemberRef,
  type PolicyRef,
  type ToolOutcome,
  type ToolPort,
} from '../../../supabase/functions/copilot-agent/planner'

const id = (n: number) => `c0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const NAIDOO = { id: id(101), number: 'AC-S1001', name: 'Naidoo household' }
const NAIDU = { id: id(102), number: 'AC-S1002', name: 'Priyanka Naidu' }
const CAFE = { id: id(103), number: 'AC-S1009', name: "Priya's Spice Café (Priya Naidoo)" }

const records: EntityRef[] = [
  { record_type: 'client', id: id(1), number: 'CL-S1001', name: 'Priya Naidoo', category: 'sample', account: NAIDOO, open_path: `/broker/people/${id(1)}` },
  { record_type: 'client', id: id(2), number: 'CL-S1002', name: 'Priyanka Naidu', category: 'sample', account: NAIDU, open_path: `/broker/people/${id(2)}` },
  { record_type: 'account', ...NAIDOO, category: 'sample', detail: 'Personal account', open_path: `/broker/accounts/${NAIDOO.id}` },
  { record_type: 'account', ...NAIDU, category: 'sample', detail: 'Personal account', open_path: `/broker/accounts/${NAIDU.id}` },
  { record_type: 'account', ...CAFE, category: 'sample', detail: 'Business account', open_path: `/broker/accounts/${CAFE.id}` },
]

const policy = (n: number, account: typeof NAIDOO, line: string, cover: string, status: string, display: string): PolicyRef => ({
  id: id(n), display_number: display, line, cover_type: cover, status, open_path: `/broker/x/${id(n)}`, account,
})
const POLICIES: Record<string, PolicyRef[]> = {
  [id(1)]: [
    policy(301, NAIDOO, 'short_term_personal', 'motor', 'in_force', 'PRO-MV-220145'),
    policy(302, NAIDOO, 'short_term_personal', 'home', 'in_force', 'KM-HH-330410'),
    policy(303, NAIDOO, 'individual_life', 'life', 'application_submitted', 'PL-S1003'),
  ],
  [id(2)]: [
    policy(304, NAIDU, 'short_term_personal', 'motor', 'in_force', 'BG-MV-418833'),
    policy(306, NAIDU, 'short_term_personal', 'motor', 'in_force', 'BG-MV-418900'),
  ],
}

function fakeTools() {
  const calls: Array<{ name: JobName; args: Record<string, unknown> }> = []
  const tools: ToolPort = {
    async call(name, args): Promise<ToolOutcome> {
      calls.push({ name, args })
      switch (name) {
        case 'records.search': {
          const q = String(args.query).toLowerCase()
          const kinds = (args.kinds as string[] | undefined) ?? ['client', 'account', 'policy']
          return { ok: true, data: records.filter((r) => kinds.includes(r.record_type) && (r.name.toLowerCase().includes(q) || r.number?.toLowerCase() === q)) }
        }
        case 'ava.policies.list': {
          const list = POLICIES[String(args.person_id)] ?? []
          return { ok: true, data: list.filter((p) => !args.cover_type || p.cover_type === args.cover_type || (args.cover_type === 'life' && p.line === 'individual_life')) }
        }
        case 'ava.life_application.get': {
          const life = (POLICIES[String(args.person_id)] ?? []).find((p) => p.line === 'individual_life')
          return life ? { ok: true, data: life } : { ok: false, error: { code: 'not_found', message: 'No life application' } }
        }
        case 'interaction.record':
          return { ok: true, data: { record_type: 'interaction', reference: 'NT-S1001', summary: 'Saved note NT-S1001', client_number: 'CL-S1001', policy_number: 'PRO-MV-220145', open_path: '/broker/personal/policies/x', replayed: false } }
        case 'records.overview':
        case 'russ.business.overview':
          return { ok: true, data: { ok: true } }
        default:
          return { ok: false, error: { code: 'failed', message: `unexpected ${name}` } }
      }
    },
  }
  return { tools, calls }
}

const turn = (text: string, extra: Partial<Parameters<typeof runTurn>[0]> = {}) => ({
  copilot: 'ar' as const, category: 'sample' as const, text, conversation_id: 'conv', message_id: 'msg', ...extra,
})

describe('copilot rule planner', () => {
  it('splits a mixed request into instructions without splitting names joined by "and"', () => {
    expect(splitClauses('Find the Naidoo account, add a note to Priya’s motor policy and show me her latest life application.')).toEqual([
      'Find the Naidoo account',
      'add a note to Priya’s motor policy',
      'show me her latest life application',
    ])
    expect(splitClauses('Show policies for Priya and Rajesh Naidoo')).toHaveLength(1)
  })

  it('recognises the jobs and the parts of a note', () => {
    expect(intentOf('Add a note that Priya requested a callback on her motor renewal')).toBe('note')
    expect(intentOf('Arrange a callback for Priya tomorrow')).toBe('task')
    expect(intentOf('show me her latest life application')).toBe('life_application_get')
    expect(intentOf('Start a life application for Priya')).toBe('life_application_create')
    expect(intentOf('Create a client called Sipho Dlamini')).toBe('create_client')
    expect(intentOf('Show the Karoo Logistics scheme members')).toBe('members')
    expect(noteBodyIn('Add a note that Priya requested a callback on her motor renewal')).toBe('Priya requested a callback on her motor renewal')
    expect(noteBodyIn('Add a note: asked about windscreen cover')).toBe('asked about windscreen cover')
    expect(namesIn('Find the Naidoo account')).toEqual([{ text: 'Naidoo', kind: 'account' }])
    expect(namesIn('add a note to Priya’s motor policy')).toEqual([{ text: 'Priya', kind: 'client' }])
    expect(dueDateIn('callback tomorrow', new Date('2026-11-14T10:00:00Z'))).toBe('2026-11-15')
  })

  it('runs the brief example: resolves the account and client, asks for note wording, retrieves the life application', async () => {
    const { tools, calls } = fakeTools()
    const res = await runTurn(turn('Find the Naidoo account, add a note to Priya’s motor policy and show me her latest life application'), tools)
    expect(res.steps.map((s) => s.status)).toEqual(['retrieved', 'needs_input', 'retrieved'])
    expect(res.steps[0].subject?.name).toBe('Naidoo household')
    expect(res.steps[1].handled_by).toBe('ava')
    expect(res.steps[1].policy?.display_number).toBe('PRO-MV-220145')
    expect(res.steps[1].input?.field).toBe('body')
    expect(res.steps[2].policy?.display_number).toBe('PL-S1003')
    expect(calls.some((c) => c.name === 'interaction.record')).toBe(false)
  })

  it('saves the note once the wording is supplied, with a stable idempotency key per step', async () => {
    const { tools, calls } = fakeTools()
    const res = await runTurn(
      turn('Find the Naidoo account, add a note to Priya’s motor policy and show me her latest life application', { steps: { 1: { values: { body: 'Asked to review the excess' } } } }),
      tools,
    )
    expect(res.steps[1].status).toBe('saved')
    expect(res.steps[1].receipt?.reference).toBe('NT-S1001')
    const write = calls.find((c) => c.name === 'interaction.record')!
    expect(write.args).toMatchObject({ person_id: id(1), policy_id: id(301), body: 'Asked to review the excess', idempotency_key: 'conv:msg:1', copilot: 'ava' })
  })

  it('offers a picker when a partial name matches two clients, and uses the picked ID', async () => {
    const { tools } = fakeTools()
    const first = await runTurn(turn('Find Priy', {}), tools)
    expect(first.steps[0].status).toBe('needs_choice')
    const options = first.steps[0].choices as EntityRef[]
    expect(options.filter((c) => c.record_type === 'client').map((c) => c.name)).toEqual(['Priya Naidoo', 'Priyanka Naidu'])
    const picked = options.find((c) => c.id === id(2))!
    const second = await runTurn(turn('Find Priy', { steps: { 0: { choice: picked } } }), tools)
    expect(second.steps[0].status).toBe('retrieved')
    expect(second.steps[0].subject?.id).toBe(id(2))
  })

  it('treats a client and the account named after them as one person', async () => {
    const { tools } = fakeTools()
    const res = await runTurn(turn('Find Priyanka Naidu'), tools)
    expect(res.steps[0].status).toBe('retrieved')
    expect(res.steps[0].subject?.record_type).toBe('client')
    expect(res.steps[0].subject?.id).toBe(id(2))
  })

  it('asks which policy when several qualify, before writing', async () => {
    const { tools, calls } = fakeTools()
    const chip = records[1]
    const res = await runTurn(turn(`Add a note to @[Priyanka Naidu · CL-S1002](client:${chip.id})'s motor policy: wants roadside assist`, { entities: [chip] }), tools)
    expect(res.steps[0].status).toBe('needs_choice')
    expect(res.steps[0].choice_kind).toBe('policy')
    expect(calls.some((c) => c.name === 'interaction.record')).toBe(false)
  })

  it('opened from a policy, saves a note on that policy without asking for the client again', async () => {
    const { tools, calls } = fakeTools()
    const res = await runTurn(
      turn('Add a note: asked about windscreen cover', { copilot: 'ava', context: { person: records[0], policy: POLICIES[id(1)][0] } }),
      tools,
    )
    expect(res.steps[0].status).toBe('saved')
    expect(calls.find((c) => c.name === 'interaction.record')!.args).toMatchObject({ policy_id: id(301), person_id: id(1) })
  })

  it('hands a business account to Russ while keeping the conversation with Ava', async () => {
    const { tools } = fakeTools()
    const cafe = records[4]
    const res = await runTurn(turn(`Show @[Priya's Spice Café · AC-S1009](account:${cafe.id})`, { copilot: 'ava', entities: [cafe] }), tools)
    expect(res.steps[0].handled_by).toBe('russ')
    expect(res.steps[0].handed_off).toBe(true)
    expect(res.steps[0].job).toBe('russ.business.overview')
  })

  it('refuses a record from the other category before calling any job', async () => {
    const { tools, calls } = fakeTools()
    const live = { ...records[0], category: 'live' as const }
    const res = await runTurn(turn(`Add a note to @[Priya Naidoo · CL-1001](client:${live.id}): test`, { entities: [live] }), tools)
    expect(res.steps[0].status).toBe('refused')
    expect(calls).toHaveLength(0)
  })
})

describe('copilot sales book rules', () => {
  const ME: MemberRef = { member_id: id(901), name: 'Naledi Mokoena', role: 'broker', role_label: 'Broker', referral_code: 'NALEDI-MZRL', referral_path: '/r/NALEDI-MZRL?mode=sample', is_me: true }
  const LERATO: MemberRef = { member_id: id(902), name: 'Lerato Dube', role: 'agent', role_label: 'Agent', referral_code: 'LERATO-QSA4', referral_path: '/r/LERATO-QSA4?mode=sample', service_area: 'Benoni' }
  const THANDI = { id: id(950), client_number: 'CL-S1150', name: 'Thandi Customer', contact_stage: 'prospect', category: 'sample', open_path: `/broker/book/clients/${id(950)}`, account: null, assigned: LERATO, referred_by: LERATO }
  const OFFER = { id: id(960), reference: 'OF-S1001', status: 'draft', person_id: id(950), insurer: 'Santam', product: 'motor', premium_amount: 865.5, premium_frequency: 'monthly' }
  const thandiRef: EntityRef = { record_type: 'client', id: id(950), number: 'CL-S1150', name: 'Thandi Customer', category: 'sample', open_path: THANDI.open_path }

  function salesTools(offers: Array<typeof OFFER> = [OFFER]) {
    const calls: Array<{ name: JobName; args: Record<string, unknown> }> = []
    const receipt = (extra: Record<string, unknown>) => ({ client_id: id(950), client_number: 'CL-S1150', client_name: 'Thandi Customer', replayed: false, ...extra })
    const tools: ToolPort = {
      async call(name, args): Promise<ToolOutcome> {
        calls.push({ name, args })
        switch (name) {
          case 'sales.team.list':
            return { ok: true, data: [ME, LERATO] }
          case 'sales.team.invite':
            return { ok: true, data: { record_type: 'team_member', reference: LERATO.referral_code, member: LERATO, invite_status: 'pending', invite_path: '/team/join/tok123', existing: false, summary: 'Added Lerato Dube as an agent in Benoni. Customer referral code LERATO-QSA4', open_path: '/broker/book?tab=team' } }
          case 'records.search':
            return { ok: true, data: String(args.query).toUpperCase() === 'CL-S1150' ? [thandiRef] : [] }
          case 'sales.client.record':
            return { ok: true, data: { ...THANDI, offers } }
          case 'sales.enquiry.capture':
            return { ok: true, data: receipt({ record_type: 'enquiry', reference: 'EN-S1002', person: THANDI, summary: 'Loaded enquiry EN-S1002 for Sipho Dlamini', open_path: THANDI.open_path }) }
          case 'sales.offer.create':
            return args.premium_amount || args.quote_option_id
              ? { ok: true, data: receipt({ record_type: 'offer', reference: 'OF-S1001', offer: OFFER, message: { text: 'Hi Thandi', phone: '27835550101' }, summary: 'Prepared offer OF-S1001', open_path: THANDI.open_path }) }
              : { ok: true, data: { outcome: 'needs_input', reason: 'choose_quote', summary: '2 quotes qualify', choices: [{ id: id(970), number: 'Option A', name: 'Santam · motor', detail: 'R865.50 per month · Sample quote' }, { id: id(971), number: 'Option B', name: 'Old Mutual · motor', detail: 'R910.00 per month · Sample quote' }] } }
          case 'sales.offer.sent':
            return { ok: true, data: receipt({ record_type: 'offer', reference: 'OF-S1001', offer: { ...OFFER, status: 'sent' }, summary: 'Logged offer OF-S1001 as sent by whatsapp (NT-S1009)', open_path: THANDI.open_path }) }
          case 'sales.followup.create':
            return { ok: true, data: receipt({ record_type: 'task', reference: 'TK-S1004', summary: 'Created follow-up TK-S1004', open_path: THANDI.open_path }) }
          case 'sales.sale.record':
            return { ok: true, data: receipt({ record_type: 'sale', reference: 'SL-S1001', offer: { ...OFFER, status: 'sold' }, summary: 'Recorded sale SL-S1001', open_path: THANDI.open_path }) }
          case 'sales.book.grid':
            return { ok: true, data: { rows: [{ name: 'Thandi Customer', client_number: 'CL-S1150', stage: 'sold' }], totals: { new_enquiry: 0, offer_sent: 0, accepted: 0, sold: 1 } } }
          default:
            return { ok: false, error: { code: 'failed', message: `unexpected ${name}` } }
        }
      },
    }
    return { tools, calls }
  }

  it('recognises the sales instructions without stealing notes', () => {
    expect(intentOf('Set up my brokerage')).toBe('sales_setup')
    expect(intentOf('Invite Lerato as a sub-broker in Benoni')).toBe('sales_invite')
    expect(intentOf('Add Lerato as my agent')).toBe('sales_invite')
    expect(intentOf('give me her customer referral link')).toBe('sales_referral_link')
    expect(intentOf('Load this prospect against Lerato’s code')).toBe('sales_load_prospect')
    expect(intentOf('Prepare a motor offer for client CL-S1150')).toBe('sales_prepare_offer')
    expect(intentOf('I sent the offer on WhatsApp')).toBe('sales_offer_sent')
    expect(intentOf('The client accepted')).toBe('sales_accept')
    expect(intentOf('The insurer confirmed cover')).toBe('sales_sale')
    expect(intentOf('Show Lerato’s referrals, latest comms and sales')).toBe('sales_book')
    expect(intentOf('Add a note that the agent confirmed cover')).toBe('note')
    expect(referralCodeIn('against LERATO-QSA4 for CL-1042')).toBe('LERATO-QSA4')
    expect(insurerReferenceIn('insurer confirmed cover, reference SAN-MV-778812, starting 2026-12-01')).toBe('SAN-MV-778812')
    expect(startDateIn('starting 1 December', new Date('2026-11-14T10:00:00Z'))).toBe('2026-12-01')
  })

  it('adds Lerato as an agent and returns her working customer referral link', async () => {
    const { tools, calls } = salesTools()
    const res = await runTurn(turn('Add Lerato Dube as my agent in Benoni and give me her customer referral link', { origin: 'https://app.example' }), tools)
    expect(res.steps.map((s) => s.status)).toEqual(['saved', 'retrieved'])
    expect(calls.find((c) => c.name === 'sales.team.invite')!.args).toMatchObject({ full_name: 'Lerato Dube', role: 'agent', service_area: 'Benoni' })
    expect(res.steps[1].summary).toContain('https://app.example/r/LERATO-QSA4')
    expect(res.steps[1].links.find((l) => l.label === 'Copy referral link')?.copy).toBe('https://app.example/r/LERATO-QSA4?mode=sample')
    expect(res.steps[0].links.some((l) => l.label === 'Copy team invitation')).toBe(true)
    expect(calls.some((c) => c.name === 'records.search')).toBe(false)
  })

  it('loads a prospect against a team member’s code', async () => {
    const { tools, calls } = salesTools()
    const res = await runTurn(turn('Load prospect Sipho Dlamini 082 555 0101 against Lerato’s code'), tools)
    expect(res.steps[0].status).toBe('saved')
    expect(calls.find((c) => c.name === 'sales.enquiry.capture')!.args).toMatchObject({ first_names: 'Sipho', surname: 'Dlamini', referral_code: 'LERATO-QSA4', phone: '082 555 0101' })
  })

  it('shows quote choices for an offer, then logs it as sent with a dated follow-up linked to the offer', async () => {
    const { tools, calls } = salesTools()
    const first = await runTurn(turn('Prepare a motor offer for client CL-S1150'), tools)
    expect(first.steps[0].status).toBe('needs_choice')
    expect(first.steps[0].choices).toHaveLength(2)
    const second = await runTurn(turn('Prepare a motor offer for client CL-S1150', { steps: { 0: { choice: first.steps[0].choices![0] } } }), tools)
    expect(second.steps[0].status).toBe('saved')
    expect(calls.filter((c) => c.name === 'sales.offer.create').at(-1)!.args).toMatchObject({ quote_option_id: id(970), person_id: id(950) })
    expect(second.context.offer?.reference).toBe('OF-S1001')

    const sent = await runTurn(turn('I sent the offer on WhatsApp. Log it and remind me on Monday', { context: second.context }), tools)
    expect(sent.steps.map((s) => s.job)).toEqual(['sales.offer.sent', 'sales.followup.create'])
    expect(calls.find((c) => c.name === 'sales.followup.create')!.args).toMatchObject({ offer_id: id(960), person_id: id(950) })
  })

  it('asks for the insurer reference and start date before recording a sale, then records it', async () => {
    const accepted = { ...OFFER, status: 'accepted' }
    const { tools, calls } = salesTools([accepted])
    const ask = await runTurn(turn('The insurer confirmed cover', { context: { person: thandiRef } }), tools)
    expect(ask.steps[0].status).toBe('needs_input')
    expect(ask.steps[0].input?.field).toBe('sale_details')
    const done = await runTurn(turn('The insurer confirmed cover', { context: { person: thandiRef }, steps: { 0: { values: { sale_details: 'SAN-MV-778812, starting 2026-12-01' } } } }), tools)
    expect(done.steps[0].status).toBe('saved')
    expect(calls.find((c) => c.name === 'sales.sale.record')!.args).toMatchObject({ offer_id: id(960), insurer_reference: 'SAN-MV-778812', cover_start_date: '2026-12-01' })
  })

  it('opens Lerato’s referrals in the client grid', async () => {
    const { tools, calls } = salesTools()
    const res = await runTurn(turn('Show Lerato’s referrals, latest comms and sales'), tools)
    expect(res.steps[0].status).toBe('retrieved')
    expect(calls.find((c) => c.name === 'sales.book.grid')!.args).toMatchObject({ member_id: id(902) })
    expect(res.steps[0].links[0].to).toBe(`/broker/book?member=${id(902)}`)
  })
})
