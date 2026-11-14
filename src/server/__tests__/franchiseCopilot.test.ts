import { describe, expect, it } from 'vitest'
import {
  enquiryStatusIn,
  franchiseIntentOf,
  franchiseSetupParams,
  periodIn,
  runFranchiseTurn,
  type FranchiseTools,
  type FranchiseTurnInput,
} from '../../../supabase/functions/copilot-agent/franchise'
import { intentOf } from '../../../supabase/functions/copilot-agent/planner'

const SETUP = 'Set up Benoni Motors as a franchisee, add its Benoni outlet and route enquiries to Lerato.'
const UNCONTACTED = 'Show me franchise enquiries nobody has contacted yet.'
const SALES = 'Which outlets brought us sales this month?'

const turn = (text: string, extra: Partial<FranchiseTurnInput> = {}): FranchiseTurnInput => ({
  copilot: 'russ', category: 'sample', text, conversation_id: 'conv-1', message_id: 'msg-0001', origin: 'https://app.example', ...extra,
})

function fakeTools(responses: Record<string, unknown>) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = []
  const tools: FranchiseTools = {
    async call(name, args) {
      calls.push({ name, args })
      const r = responses[name]
      if (r && typeof r === 'object' && 'error' in (r as object)) return { ok: false, error: (r as { error: { code: string; message: string } }).error }
      return { ok: true, data: r }
    },
  }
  return { tools, calls }
}

const OUTLET = {
  id: 'o0000000-0000-4000-8000-000000000001', label: 'Benoni Motors - Benoni outlet', referral_code: 'BENONI-7KQ2',
  referral_path: '/r/BENONI-7KQ2?mode=sample', receiving: { name: 'Lerato Dube' },
}

describe('franchise intents', () => {
  it('recognises the three Russ franchise requests', () => {
    expect(franchiseIntentOf(SETUP)).toBe('franchise_setup')
    expect(franchiseIntentOf(UNCONTACTED)).toBe('franchise_enquiries')
    expect(franchiseIntentOf(SALES)).toBe('franchise_sales')
    expect(franchiseIntentOf('Add a Boksburg outlet to Benoni Motors and route enquiries to Sipho')).toBe('franchise_setup')
    expect(franchiseIntentOf('How are our outlets converting this year?')).toBe('franchise_sales')
  })

  it('leaves ordinary sales book requests to the planner', () => {
    expect(franchiseIntentOf('Invite Lerato Dube as an agent in Benoni')).toBeNull()
    expect(franchiseIntentOf('Show Lerato’s referrals, comms and sales')).toBeNull()
    expect(franchiseIntentOf('Prepare a motor offer for CL-S1001')).toBeNull()
    expect(intentOf(SETUP)).not.toBe('sales_setup')
  })

  it('reads the franchisee, outlet, area and receiving broker in one sentence', () => {
    expect(franchiseSetupParams(SETUP)).toMatchObject({
      partner_name: 'Benoni Motors', outlet_name: 'Benoni outlet', service_area: 'Benoni', receiving: 'Lerato', sales_mode: null,
    })
    expect(franchiseSetupParams('Add a Boksburg outlet to Benoni Motors, route enquiries to Sipho Mokoena. The outlet sells at the outlet.')).toMatchObject({
      partner_name: 'Benoni Motors', outlet_name: 'Boksburg outlet', receiving: 'Sipho Mokoena', sales_mode: 'sell',
    })
    expect(franchiseSetupParams('Register Sandton Auto as a franchisee and invite Thabo Nkosi as outlet manager thabo@sandtonauto.co.za')).toMatchObject({
      partner_name: 'Sandton Auto', manager_name: 'Thabo Nkosi', manager_email: 'thabo@sandtonauto.co.za',
    })
  })

  it('reads enquiry status and reporting periods', () => {
    expect(enquiryStatusIn(UNCONTACTED)).toBe('uncontacted')
    expect(enquiryStatusIn('franchise enquiries that have not been contacted')).toBe('uncontacted')
    expect(enquiryStatusIn('franchise enquiries that sold')).toBe('sold')
    const now = new Date('2026-11-14T10:00:00Z')
    expect(periodIn(SALES, now)).toEqual({ from: '2026-11-01', to: '2026-11-14', label: 'this month' })
    expect(periodIn('last month', now)).toEqual({ from: '2026-10-01', to: '2026-10-31', label: 'last month' })
  })
})

describe('runFranchiseTurn', () => {
  it('sets up the franchisee and returns the customer link and QR code', async () => {
    const { tools, calls } = fakeTools({
      'franchise.setup': {
        outcome: 'saved', created_partner: true, summary: 'Set up Benoni Motors with its Benoni outlet. Enquiries go to Lerato Dube (refer to broker). Customer code BENONI-7KQ2',
        outlet: OUTLET, open_path: `/broker/franchise?tab=franchisees&outlet=${OUTLET.id}`, invite_path: null, replayed: false,
      },
    })
    const r = await runFranchiseTurn(turn(SETUP), tools)
    expect(calls[0]).toMatchObject({ name: 'franchise.setup', args: { partner_name: 'Benoni Motors', outlet_name: 'Benoni outlet', receiving_member_name: 'Lerato', copilot: 'russ' } })
    const step = r.steps[0]
    expect(step.status).toBe('saved')
    expect(step.summary).toContain('https://app.example/r/BENONI-7KQ2?mode=sample')
    expect(step.links.map((l) => l.label)).toEqual(expect.arrayContaining(['Copy customer link', 'Download QR code', 'Open outlet']))
  })

  it('asks which broker when the name matches several team members, then uses the choice', async () => {
    const choices = [
      { member_id: 'm1', name: 'Lerato Dube', referral_code: 'LERATO-AAAA', detail: 'Agent · Benoni' },
      { member_id: 'm2', name: 'Lerato Mokoena', referral_code: 'LERATO-BBBB', detail: 'Broker' },
    ]
    const first = fakeTools({ 'franchise.setup': { outcome: 'needs_input', reason: 'ambiguous_member', summary: 'More than one team member matches "Lerato".', choices } })
    const r1 = await runFranchiseTurn(turn(SETUP), first.tools)
    expect(r1.steps[0].status).toBe('needs_choice')
    expect(r1.steps[0].choices?.map((c) => c.id)).toEqual(['m1', 'm2'])

    const second = fakeTools({ 'franchise.setup': { outcome: 'saved', summary: 'Set up', outlet: OUTLET, open_path: '/broker/franchise' } })
    const choice = { record_type: 'team_member', id: 'm2', number: 'LERATO-BBBB', name: 'Lerato Mokoena', category: 'sample' as const }
    await runFranchiseTurn(turn(SETUP, { steps: { 0: { choice } } }), second.tools)
    expect(second.calls[0].args).toMatchObject({ receiving_member_id: 'm2', receiving_member_name: undefined })
  })

  it('lists franchise enquiries nobody has contacted, with a filtered grid link', async () => {
    const { tools, calls } = fakeTools({
      'franchise.enquiries.grid': {
        rows: [{ reference: 'EN-S1001', name: 'Thandi Customer', phone: '083 555 0101', received_at: '2026-11-14T10:00:00Z', client: { client_number: 'CL-S1001' }, outlet: { label: OUTLET.label }, handler: { name: 'Lerato Dube' } }],
        totals: { received: 1, uncontacted: 1 },
      },
    })
    const r = await runFranchiseTurn(turn(UNCONTACTED), tools)
    expect(calls[0]).toMatchObject({ name: 'franchise.enquiries.grid', args: { status: 'uncontacted' } })
    expect(r.steps[0].summary).toContain('EN-S1001 Thandi Customer (CL-S1001) from Benoni Motors - Benoni outlet, Lerato Dube')
    expect(r.steps[0].links[0].to).toBe('/broker/franchise?tab=enquiries&status=uncontacted')
  })

  it('shows confirmed sales by originating outlet for the sale-date period', async () => {
    const { tools, calls } = fakeTools({
      'franchise.sales': { by_outlet: [{ label: OUTLET.label, sales: 2 }, { label: 'Benoni Motors - Boksburg outlet', sales: 1 }], totals: { sales: 3, outlets: 2 }, rows: [] },
    })
    const r = await runFranchiseTurn(turn(SALES, { category: 'live' }), tools)
    expect(calls[0].name).toBe('franchise.sales')
    expect(calls[0].args.from).toMatch(/^\d{4}-\d{2}-01$/)
    expect(r.steps[0].summary).toMatch(/^3 confirmed sales from 2 outlets this month \(Live, by sale date\)/)
    expect(r.steps[0].links[0].to).toContain('view=sales')
  })
})
