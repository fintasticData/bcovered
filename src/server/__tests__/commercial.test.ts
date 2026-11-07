import { beforeEach, describe, expect, it } from 'vitest'
import { decideApproval, getOverview, listApprovals, listIdentities, sendMessage, startConversation, type Auth } from '../api'
import { handleCopilotCommand } from '../agents/copilotCommands'
import { RESTAURANT_GROUP } from '../demo/scenarios'
import { SEED_IDS, TENANT_ID } from '../db/seed'
import { db, Repo } from '../db/store'
import { hashPayload } from '../lib/hash'
import { ToolError } from '../lib/errors'
import { commercialTurn, initialCommercialState } from '../llm/commercialIntake'
import { configureRunner, kick } from '../jobs/runner'
import { invokeTool, type Actor } from '../tools/registry'

const visitor: Auth = { userId: null }
const broker: Auth = { userId: SEED_IDS.users.broker }
const brokerActor: Actor = { type: 'user', id: SEED_IDS.users.broker, role: 'broker' }
const agent: Actor = { type: 'agent', id: 'test_agent', role: 'agent' }
const repo = () => new Repo(TENANT_ID)

async function runRestaurantScenario() {
  let view = startConversation(visitor, { channel: 'public', assistant: 'business_discovery' })
  for (const line of RESTAURANT_GROUP.script) {
    view = await sendMessage(visitor, { conversation_id: view.conversation.id, text: line })
  }
  expect(view.job_id).toBeTruthy()
  await kick(TENANT_ID, view.job_id!)
  return view
}

beforeEach(() => {
  db.reset()
  configureRunner({ stepDelayMs: 0 })
})

describe('Business Discovery intake', () => {
  it('asks the brief’s structure question first and only template-relevant questions after', () => {
    const templates = repo().list('industry_risk_templates')
    let state = initialCommercialState()
    const first = commercialTurn(state, RESTAURANT_GROUP.script[0], templates)
    expect(first.reply).toContain(
      'Are the three restaurants owned by the same legal entity, and do you currently have one policy covering all three?',
    )
    const asked: string[] = []
    let submitted = false
    for (const line of RESTAURANT_GROUP.script) {
      const turn = commercialTurn(state, line, templates)
      state = turn.state
      if (state.asking) asked.push(state.asking)
      submitted ||= turn.submit
    }
    expect(submitted).toBe(true)
    expect(asked.indexOf('consent')).toBeLessThan(asked.indexOf('full_name'))
    expect(new Set(asked).size).toBe(asked.length)
    expect(state.facts).toMatchObject({
      industry_key: 'restaurants_hospitality',
      registered_name: 'Kasi Kitchen Group (Pty) Ltd',
      location_count: 3,
      location_names: ['Maboneng', 'Rosebank', 'Soweto'],
      same_entity: true,
      single_policy: true,
      ownership: 'leased',
      annual_turnover: 18_000_000,
      employee_count: 64,
      equipment_value_per_location: 450_000,
      stock_value_per_location: 60_000,
      backup_power: 'partial',
      backup_power_locations: ['Rosebank'],
      fire_suppression: true,
      vehicle_count: 2,
      vehicle_location: 'Maboneng',
      seating_per_location: 90,
      card_payments: true,
      online_orders: true,
      current_insurer: 'Protea Insure',
      renewal_month: 'March',
      claims_last_5_years: 1,
    })
    expect(state.contact).toEqual({ full_name: 'Nomsa Dlamini', email: 'nomsa@kasikitchen.example.demo', phone: '0825550190' })
  })

  it('does not capture contact details when consent is declined', () => {
    const templates = repo().list('industry_risk_templates')
    let state = initialCommercialState()
    for (const line of RESTAURANT_GROUP.script.slice(0, 14)) state = commercialTurn(state, line, templates).state
    const declined = commercialTurn(state, 'I don’t agree', templates)
    expect(declined.state.stage).toBe('declined')
    expect(commercialTurn(declined.state, 'Nomsa Dlamini', templates).state.contact.full_name).toBeUndefined()
  })
})

describe('commercial_discovery_review vertical slice', () => {
  it('turns the conversation into a persisted profile, Risk Twin, exposures, tasks and a draft pack awaiting approval', async () => {
    const view = await runRestaurantScenario()
    const r = repo()
    const job = r.require('jobs', view.job_id!)
    expect(job.status).toBe('awaiting_approval')

    const profile = r.find('business_profiles', (p) => p.registered_name === 'Kasi Kitchen Group (Pty) Ltd')!
    expect(profile).toBeTruthy()
    expect(r.require('customers', profile.customer_id).customer_type).toBe('commercial')
    expect(profile.field_sources.registration_number).toBe('missing')
    expect(profile.field_sources.annual_turnover).toBe('declared')
    expect(profile.field_sources.industry_key).toBe('inferred')

    const locations = r.list('business_locations', (l) => l.business_profile_id === profile.id)
    expect(locations.map((l) => l.suburb).sort()).toEqual(['Maboneng', 'Rosebank', 'Soweto'])
    expect(locations.find((l) => l.suburb === 'Rosebank')!.backup_power).toBe(true)
    expect(locations.find((l) => l.suburb === 'Soweto')!.backup_power).toBe(false)

    const assets = r.list('commercial_assets', (a) => a.business_profile_id === profile.id)
    expect(assets.every((a) => ['replacement', 'market', 'book', 'unknown'].includes(a.value_basis))).toBe(true)
    expect(assets.filter((a) => a.asset_class === 'machinery').every((a) => a.value_basis === 'replacement')).toBe(true)

    const twin = r.find('business_risk_profiles', (p) => p.business_profile_id === profile.id && p.status === 'current')!
    expect(twin.edge_count).toBeGreaterThan(10)
    const exposures = r.list('risk_exposures', (e) => e.risk_profile_id === twin.id)
    expect(exposures.length).toBeGreaterThanOrEqual(8)
    expect(exposures.every((e) => e.coverage_status === 'awaiting_broker_review')).toBe(true)
    expect(exposures.every((e) => e.priority_inputs.length > 0)).toBe(true)
    const stock = exposures.find((e) => e.rule_key === 'stock_deterioration')!
    expect(stock.priority).toBe('high')
    expect(stock.priority_inputs.some((i) => /Prior claim/.test(i))).toBe(true)

    const tasks = r.list('tasks', (t) => t.subject_id === profile.id)
    expect(tasks.some((t) => t.title === 'Fire suppression service certificate for each kitchen')).toBe(true)
    expect(tasks.some((t) => /Lease agreements/.test(t.title))).toBe(true)
    expect(tasks.some((t) => t.audience === 'broker')).toBe(true)

    const submission = r.find('commercial_submissions', (s) => s.business_profile_id === profile.id)!
    expect(submission.status).toBe('awaiting_approval')
    expect(submission.validation?.valid).toBe(true)
    expect(submission.pack?.broker_summary).toContain('Nothing has been sent to an insurer')
    const sections = r.list('submission_sections', (x) => x.submission_id === submission.id)
    expect(sections.map((x) => x.cover_class)).toEqual(expect.arrayContaining(['fire_allied_perils', 'business_interruption', 'deterioration_of_stock', 'sasria']))
    expect(sections.find((x) => x.cover_class === 'machinery_breakdown')!.sum_insured).toBe(1_350_000)

    const [pending] = listApprovals(broker, { status: ['pending'] })
    expect(pending.approval.approval_type).toBe('underwriting_submission')
    expect(pending.approval.payload_hash).toBe(hashPayload(submission.pack))

    decideApproval(broker, { approval_id: pending.approval.id, decision: 'approved', payload_hash: pending.approval.payload_hash })
    await kick(TENANT_ID, job.id)
    expect(r.require('jobs', job.id).status).toBe('completed')
    expect(r.require('commercial_submissions', submission.id).status).toBe('ready_for_market')
    expect(r.list('communications', (c) => c.customer_id === profile.customer_id && c.channel === 'in_app')).toHaveLength(1)
  })

  it('lands the new business contact on the business portal and personal customers on the personal portal', async () => {
    await runRestaurantScenario()
    const identities = listIdentities()
    expect(identities.find((i) => i.full_name === 'Nomsa Dlamini')?.home).toBe('/portal/business')
    expect(identities.find((i) => i.full_name === 'Johan van der Merwe')?.home).toBe('/portal')
    expect(identities.find((i) => i.role === 'broker')?.home).toBe('/broker')
    expect(getOverview(broker).kpis.approvals_pending).toBe(1)
  })

  it('blocks agents from approving and from finalising without approval', async () => {
    await runRestaurantScenario()
    const r = repo()
    const submission = r.list('commercial_submissions')[0]
    const [pending] = listApprovals(broker, { status: ['pending'] })
    expect(() =>
      invokeTool('approval.resolve', { approval_id: pending.approval.id, decision: 'approved', payload_hash: pending.approval.payload_hash }, { repo: r, actor: agent }),
    ).toThrowError(/not permitted/)
    try {
      invokeTool('underwriting.finalise_submission', { submission_id: submission.id }, { repo: r, actor: agent })
      expect.unreachable()
    } catch (e) {
      expect((e as ToolError).code).toBe('approval_required')
    }
  })

  it('rejects an approval when a broker edits the pack after the request', async () => {
    await runRestaurantScenario()
    const r = repo()
    const submission = r.list('commercial_submissions')[0]
    const section = r.find('submission_sections', (x) => x.submission_id === submission.id && x.cover_class === 'public_liability')!
    invokeTool('underwriting.update_section', { section_id: section.id, status: 'included', limit_of_indemnity: 10_000_000 }, { repo: r, actor: brokerActor })
    const [pending] = listApprovals(broker, { status: ['pending'] })
    expect(() =>
      decideApproval(broker, { approval_id: pending.approval.id, decision: 'approved', payload_hash: pending.approval.payload_hash }),
    ).toThrowError(/changed/)
  })

  it('re-runs from the submission step when the broker requests changes, keeping broker edits', async () => {
    const view = await runRestaurantScenario()
    const r = repo()
    const submission = r.list('commercial_submissions')[0]
    const [pending] = listApprovals(broker, { status: ['pending'] })
    decideApproval(broker, { approval_id: pending.approval.id, decision: 'changes_requested', note: 'Add the landlord liability limit', payload_hash: pending.approval.payload_hash })
    expect(r.require('jobs', view.job_id!).status).toBe('awaiting_information')
    const section = r.find('submission_sections', (x) => x.submission_id === submission.id && x.cover_class === 'public_liability')!
    invokeTool('underwriting.update_section', { section_id: section.id, status: 'included', limit_of_indemnity: 10_000_000 }, { repo: r, actor: brokerActor })
    invokeTool('job.resume', { job_id: view.job_id }, { repo: r, actor: brokerActor })
    await kick(TENANT_ID, view.job_id!)
    const fresh = listApprovals(broker, { status: ['pending'] })
    expect(fresh).toHaveLength(1)
    const after = r.require('commercial_submissions', submission.id)
    expect(after.pack?.broker_summary).toContain('landlord liability limit')
    expect(r.require('submission_sections', section.id).limit_of_indemnity).toBe(10_000_000)
    expect(r.list('business_profiles', (p) => p.registered_name.startsWith('Kasi'))).toHaveLength(1)
  })

  it('never lets an agent overwrite a verified profile value', () => {
    expect(() =>
      invokeTool('business.update_profile', { profile_id: SEED_IDS.business.ubuntu, changes: { registration_number: '2016/654321/07' }, source: 'declared' }, { repo: repo(), actor: agent }),
    ).toThrowError(/Verified values/)
  })
})

describe('Broker Copilot commercial review', () => {
  it('reviews Ubuntu Foods from existing records without creating a duplicate profile', async () => {
    const r = repo()
    const out = handleCopilotCommand(r, brokerActor, 'Review Ubuntu Foods and identify outstanding insurance questions', 'commercial')
    expect(out.view.kind).toBe('business')
    const jobId = out.view.kind === 'business' ? out.view.job_id! : ''
    await kick(TENANT_ID, jobId)
    expect(r.require('jobs', jobId).status).toBe('awaiting_approval')
    expect(r.list('business_profiles', (p) => p.registered_name === 'Ubuntu Foods (Pty) Ltd')).toHaveLength(1)
    expect(r.list('customers', (c) => c.full_name === 'Ubuntu Foods (Pty) Ltd')).toHaveLength(1)
    const exposures = r.list('risk_exposures', (e) => e.business_profile_id === SEED_IDS.business.ubuntu)
    expect(exposures.find((e) => e.rule_key === 'valuation_gap')?.priority_inputs.some((i) => /book value/.test(i))).toBe(true)
    expect(exposures.some((e) => e.rule_key === 'customer_concentration')).toBe(true)

    const again = handleCopilotCommand(r, brokerActor, 'Review Ubuntu Foods', 'commercial')
    expect(again.view.kind === 'business' && again.view.job_id).toBe(jobId)
  })
})
