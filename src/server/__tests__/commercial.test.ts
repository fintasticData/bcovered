import { beforeEach, describe, expect, it } from 'vitest'
import { decideApproval, getOverview, listApprovals, listIdentities, sendMessage, startConversation, type Auth } from '../api'
import { handleCopilotCommand } from '../agents/copilotCommands'
import { getRiskTwinPortfolio, loadCompletedSubmissions, loadDemoBusinesses, startTwinBuildForProfile } from '../commercialApi'
import { RESTAURANT_GROUP } from '../demo/scenarios'
import { SEED_IDS, TENANT_ID } from '../db/seed'
import { db, Repo } from '../db/store'
import { hashPayload } from '../lib/hash'
import { ToolError } from '../lib/errors'
import { commercialTurn, initialCommercialState } from '../llm/commercialIntake'
import { configureRunner, kick } from '../jobs/runner'
import { invokeTool, type Actor } from '../tools/registry'
import { INDUSTRY_TEMPLATES } from '../domain/commercial/industryTemplates'
import { COVER_CLASSES } from '../domain/commercial/coverClasses'
import { BUSINESS_COVER_AREAS, BUSINESS_INDUSTRIES } from '@/data/business'

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

describe('Public business catalogue', () => {
  it('lists every industry template exactly once and only real cover groups', () => {
    const templateKeys = INDUSTRY_TEMPLATES.map((t) => t.key).sort()
    expect(BUSINESS_INDUSTRIES.map((i) => i.key).sort()).toEqual(templateKeys)
    const groups = new Set(COVER_CLASSES.map((c) => c.group))
    expect(BUSINESS_COVER_AREAS.map((a) => a.group).sort()).toEqual([...groups].sort())
  })
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

describe('Risk Twin portfolio', () => {
  const ubuntu = SEED_IDS.business.ubuntu
  const viewJob = (out: ReturnType<typeof handleCopilotCommand>) => (out.view.kind === 'business' ? out.view.job_id : null)

  it('lists Ubuntu Foods without a Twin until one is built, then with its exposures and no submission', async () => {
    const before = getRiskTwinPortfolio(broker)
    expect(before.twins).toHaveLength(0)
    expect(before.without_twin.map((r) => r.profile.id)).toContain(ubuntu)

    const { job_id } = startTwinBuildForProfile(broker, { profile_id: ubuntu })
    await kick(TENANT_ID, job_id)
    const r = repo()
    expect(r.require('jobs', job_id).status).toBe('completed')

    const after = getRiskTwinPortfolio(broker)
    expect(after.without_twin.map((x) => x.profile.id)).not.toContain(ubuntu)
    const row = after.twins.find((x) => x.profile.id === ubuntu)!
    expect(row.exposure_count).toBeGreaterThan(0)
    expect(row.priority_counts.high + row.priority_counts.medium + row.priority_counts.low).toBe(row.exposure_count)
    expect(row.assessment_status).toBe('screened')
    expect(row.last_assessed_at).toBeTruthy()
    expect(row.open_broker_tasks + row.open_customer_tasks).toBeGreaterThan(0)
    expect(row.asset_count).toBe(5)
    expect(row.assigned_broker).toBe('Thabo Nkosi')
    expect(row.renewal_month).toBe('January')
    expect(r.list('commercial_submissions', (s) => s.business_profile_id === ubuntu)).toHaveLength(0)
    expect(r.list('approval_requests', (a) => a.status === 'pending')).toHaveLength(0)
  })

  it('never starts a second commercial job for a client while one is active', async () => {
    const first = startTwinBuildForProfile(broker, { profile_id: ubuntu })
    const second = startTwinBuildForProfile(broker, { profile_id: ubuntu })
    expect(second).toEqual({ job_id: first.job_id, reused: true })
    const viaCopilot = handleCopilotCommand(repo(), brokerActor, 'Create a Risk Twin for Ubuntu Foods', 'commercial')
    expect(viewJob(viaCopilot)).toBe(first.job_id)
    await kick(TENANT_ID, first.job_id)
    expect(repo().list('business_risk_profiles', (p) => p.business_profile_id === ubuntu)).toHaveLength(1)
  })

  it('loads the demo businesses once, deterministically, and reset removes them', async () => {
    const first = loadDemoBusinesses(broker)
    expect(first.inserted).toBe(3)
    expect(first.builds_started).toBe(3)
    await Promise.all(repo().list('jobs', (j) => j.status === 'queued' || j.status === 'running').map((j) => kick(TENANT_ID, j.id)))
    const count = () => {
      const r = repo()
      return (['customers', 'business_profiles', 'business_locations', 'commercial_assets', 'business_risk_profiles', 'jobs'] as const).map((t) => r.list(t).length)
    }
    const snapshot = count()
    expect(getRiskTwinPortfolio(broker).twins.map((t) => t.profile.trading_name).sort()).toEqual(['Mokoena & Partners', 'Swift Freight', 'Thali House'])

    const again = loadDemoBusinesses(broker)
    expect(again).toMatchObject({ inserted: 0, builds_started: 0 })
    expect(count()).toEqual(snapshot)

    db.reset()
    expect(repo().list('business_profiles', (p) => first.profile_ids.includes(p.id))).toHaveLength(0)
  })

  it('loads three completed submission packs through the real workflow, once', async () => {
    const manager: Auth = { userId: SEED_IDS.users.manager }
    const first = await loadCompletedSubmissions(manager)
    expect(first).toEqual({ completed: 3, already_completed: 0, failed: [] })

    const r = repo()
    const subs = r.list('commercial_submissions')
    expect(subs).toHaveLength(3)
    expect(subs.every((s) => s.status === 'ready_for_market' && s.approved_at && s.pack?.broker_summary)).toBe(true)
    expect(r.list('submission_sections', (x) => x.status === 'proposed')).toHaveLength(0)
    expect(r.list('approval_requests', (a) => a.status === 'approved' && a.decided_by === SEED_IDS.users.manager)).toHaveLength(3)
    expect(r.list('approval_requests', (a) => a.status === 'pending')).toHaveLength(0)
    const pl = r.find('submission_sections', (x) => x.cover_class === 'professional_indemnity')
    expect(pl?.limit_of_indemnity).toBe(20_000_000)
    expect(r.list('jobs', (j) => j.workflow_type === 'commercial_discovery_review').every((j) => j.status === 'completed')).toBe(true)

    const again = await loadCompletedSubmissions(manager)
    expect(again).toEqual({ completed: 0, already_completed: 3, failed: [] })
    expect(repo().list('commercial_submissions')).toHaveLength(3)
  })

  it('opens an existing Twin instead of duplicating it, and rebuilds only when asked', async () => {
    const r = repo()
    const created = handleCopilotCommand(r, brokerActor, 'Create a Risk Twin for a company called Ubuntu Foods.', 'commercial')
    await kick(TENANT_ID, viewJob(created)!)
    const opened = handleCopilotCommand(r, brokerActor, 'Create a Risk Twin for Ubuntu Foods', 'commercial')
    expect(opened.view.kind).toBe('business')
    expect(viewJob(opened)).toBeNull()
    expect(opened.reply).toMatch(/instead of creating a duplicate/)

    const rebuilt = handleCopilotCommand(r, brokerActor, 'Rebuild the Risk Twin for Ubuntu Foods', 'commercial')
    await kick(TENANT_ID, viewJob(rebuilt)!)
    expect(r.list('business_risk_profiles', (p) => p.business_profile_id === ubuntu && p.status === 'current').map((p) => p.version)).toEqual([2])
    expect(r.list('business_profiles', (p) => p.registered_name === 'Ubuntu Foods (Pty) Ltd')).toHaveLength(1)
  })

  it('interviews the broker about a business with no profile, and cancel saves nothing', async () => {
    let view = startConversation(broker, { channel: 'broker', assistant: 'commercial_copilot' })
    const id = view.conversation.id
    view = await sendMessage(broker, { conversation_id: id, text: 'Create a Risk Twin for Acme Bakery' })
    const discovery = () => repo().require('conversations', id).context.broker_discovery as { business_name: string; intake: { facts: { registered_name?: string } } } | undefined
    expect(discovery()?.business_name).toBe('Acme Bakery')
    expect(discovery()?.intake.facts.registered_name).toBe('Acme Bakery')

    view = await sendMessage(broker, { conversation_id: id, text: 'We run restaurants in Durban' })
    const reply = view.messages[view.messages.length - 1].content
    expect(reply).not.toMatch(/^In this build/)
    expect(discovery()).toBeTruthy()

    view = await sendMessage(broker, { conversation_id: id, text: 'cancel' })
    expect(discovery()).toBeUndefined()
    expect(repo().list('business_profiles', (p) => p.registered_name === 'Acme Bakery')).toHaveLength(0)
  })

  it('explains which clients need attention', () => {
    const out = handleCopilotCommand(repo(), brokerActor, 'Which Risk Twins need attention?', 'commercial')
    expect(out.view.kind).toBe('businesses')
    expect(out.reply).toMatch(/Ubuntu Foods: no Risk Twin yet/)
  })
})
