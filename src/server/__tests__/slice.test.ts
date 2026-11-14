import { beforeEach, describe, expect, it } from 'vitest'
import {
  decideApproval,
  getPortal,
  listApprovals,
  sendMessage,
  startConversation,
  type Auth,
} from '../api'
import { startMotorLeadWorkflow } from '../agents/orchestrator'
import { NEW_MOTOR_LEAD } from '../demo/scenarios'
import { SEED_IDS, TENANT_ID } from '../db/seed'
import { db, Repo } from '../db/store'
import { hashPayload } from '../lib/hash'
import { ToolError } from '../lib/errors'
import { deterministicAdapter } from '../llm/deterministic'
import { isGeneralQuestion } from '../llm/fal'
import { initialIntakeState } from '../llm/adapter'
import { cancelJob, configureRunner, kick, retryJob } from '../jobs/runner'
import { invokeTool, type Actor } from '../tools/registry'

const visitor: Auth = { userId: null }
const broker: Auth = { userId: SEED_IDS.users.broker }
const agent: Actor = { type: 'agent', id: 'test_agent', role: 'agent' }
const repo = () => new Repo(TENANT_ID)

describe('fal general questions', () => {
  it('sends questions to fal but keeps consent and personal details in the deterministic intake', () => {
    const fresh = initialIntakeState()
    expect(isGeneralQuestion(fresh, 'If I have a printing business, what items do I typically insure and how much could we estimate?')).toBe(true)
    expect(isGeneralQuestion(fresh, 'What is the difference between comprehensive and third party cover')).toBe(true)
    expect(isGeneralQuestion(fresh, 'I’ve just bought a Toyota Corolla')).toBe(false)
    expect(isGeneralQuestion({ ...fresh, stage: 'consent' }, 'What do you do with my data?')).toBe(false)
    expect(isGeneralQuestion({ ...fresh, stage: 'contact' }, 'Is 082 555 0142 fine?')).toBe(false)
  })
})

async function runScenario() {
  let view = startConversation(visitor, { channel: 'public' })
  for (const line of NEW_MOTOR_LEAD.script) {
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

describe('Ava deterministic intake', () => {
  it('fills every motor slot from the scenario script and asks for consent before personal details', async () => {
    let state = initialIntakeState()
    const asked: string[] = []
    let submitted = false
    for (const line of NEW_MOTOR_LEAD.script) {
      const turn = await deterministicAdapter.intakeTurn(state, line)
      state = turn.state
      if (state.asking) asked.push(state.asking)
      submitted ||= turn.submit
    }
    expect(submitted).toBe(true)
    expect(state.details).toEqual({
      make: 'Toyota',
      model: 'Corolla',
      year: 2022,
      value: 245000,
      condition: 'used',
      usage: 'private',
      parking: 'garage',
      tracker: true,
      driver_age: 34,
      licence_years: 12,
      claims_last_3_years: 0,
      cover_type: 'comprehensive',
    })
    expect(state.contact).toEqual({ full_name: 'Sarah Jacobs', email: 'sarah.jacobs@example.demo', phone: '0825550142' })
    expect(asked.indexOf('consent')).toBeLessThan(asked.indexOf('full_name'))
  })

  it('echoes the vehicle value as a rand amount', async () => {
    let state = initialIntakeState()
    let reply = ''
    for (const line of NEW_MOTOR_LEAD.script.slice(0, 3)) ({ state, reply } = await deterministicAdapter.intakeTurn(state, line))
    expect(reply).toMatch(/Noted: R\s245\s000\./)
  })

  it('does not capture personal details when consent is declined', async () => {
    let state = initialIntakeState()
    for (const line of NEW_MOTOR_LEAD.script.slice(0, 8)) state = (await deterministicAdapter.intakeTurn(state, line)).state
    const turn = await deterministicAdapter.intakeTurn(state, 'I don’t agree')
    expect(turn.state.stage).toBe('declined')
    const next = await deterministicAdapter.intakeTurn(turn.state, 'Sarah Jacobs')
    expect(next.state.contact.full_name).toBeUndefined()
  })
})

describe('motor_new_lead vertical slice', () => {
  it('runs visitor enquiry to broker approval to customer proposal', async () => {
    const view = await runScenario()
    const r = repo()
    const job = r.require('jobs', view.job_id!)
    expect(job.status).toBe('awaiting_approval')

    const options = r.list('quote_options', (o) => o.quote_id === job.quote_id).sort((a, b) => a.option_label.localeCompare(b.option_label))
    expect(options.map((o) => [o.option_label, o.monthly_premium, o.excess])).toEqual([
      ['Option A', 1180, 5000],
      ['Option B', 1340, 3500],
      ['Option C', 1090, 7500],
    ])
    expect(options.every((o) => o.is_simulated)).toBe(true)

    const sarah = r.find('customers', (c) => c.email === 'sarah.jacobs@example.demo')!
    const sarahUser = r.find('app_users', (u) => u.customer_id === sarah.id)!
    expect(getPortal({ userId: sarahUser.id }).proposals).toHaveLength(0)

    const [pending] = listApprovals(broker, { status: ['pending'] })
    decideApproval(broker, { approval_id: pending.approval.id, decision: 'approved', payload_hash: pending.approval.payload_hash })
    await kick(TENANT_ID, job.id)

    expect(r.require('jobs', job.id).status).toBe('completed')
    expect(r.require('quotes', job.quote_id!).status).toBe('released')
    expect(r.require('leads', job.lead_id!).status).toBe('proposal_released')
    const portal = getPortal({ userId: sarahUser.id })
    expect(portal.proposals).toHaveLength(1)
    expect(portal.notifications).toHaveLength(1)
    const email = r.find('communications', (c) => c.channel === 'email')!
    expect(email.preview_only).toBe(true)
    expect(email.status).toBe('draft')
  })

  it('reuses the job when the same conversation is submitted twice', async () => {
    const view = await runScenario()
    const again = await sendMessage(visitor, { conversation_id: view.conversation.id, text: 'Yes, send it' })
    expect(again.job_id).toBe(view.job_id)
    expect(repo().list('jobs')).toHaveLength(1)
  })

  it('moves to awaiting information when the broker requests changes, then re-requests approval', async () => {
    const view = await runScenario()
    const [pending] = listApprovals(broker, { status: ['pending'] })
    decideApproval(broker, {
      approval_id: pending.approval.id,
      decision: 'changes_requested',
      note: 'Mention the courtesy car difference',
      payload_hash: pending.approval.payload_hash,
    })
    const r = repo()
    expect(r.require('jobs', view.job_id!).status).toBe('awaiting_information')
    invokeTool('job.resume', { job_id: view.job_id }, { repo: r, actor: { type: 'user', id: SEED_IDS.users.broker, role: 'broker' } })
    await kick(TENANT_ID, view.job_id!)
    const fresh = listApprovals(broker, { status: ['pending'] })
    expect(fresh).toHaveLength(1)
    expect(r.require('quotes', r.require('jobs', view.job_id!).quote_id!).proposal?.broker_summary).toContain('courtesy car')
  })
})

describe('approval enforcement', () => {
  it('blocks agents from resolving approvals', async () => {
    await runScenario()
    const [pending] = listApprovals(broker, { status: ['pending'] })
    expect(() =>
      invokeTool('approval.resolve', { approval_id: pending.approval.id, decision: 'approved', payload_hash: pending.approval.payload_hash }, { repo: repo(), actor: agent }),
    ).toThrowError(/not permitted/)
  })

  it('refuses to release a proposal without approval', async () => {
    const view = await runScenario()
    const quoteId = repo().require('jobs', view.job_id!).quote_id
    try {
      invokeTool('quote.release_proposal', { quote_id: quoteId }, { repo: repo(), actor: agent })
      expect.unreachable()
    } catch (e) {
      expect((e as ToolError).code).toBe('approval_required')
    }
  })

  it('rejects an approval when the proposal changed after the request', async () => {
    const view = await runScenario()
    const r = repo()
    const quote = r.require('quotes', r.require('jobs', view.job_id!).quote_id!)
    r.update('quotes', quote.id, { proposal: { ...quote.proposal!, broker_summary: 'Edited after the request was raised' } })
    const [pending] = listApprovals(broker, { status: ['pending'] })
    expect(() =>
      decideApproval(broker, { approval_id: pending.approval.id, decision: 'approved', payload_hash: pending.approval.payload_hash }),
    ).toThrowError(/changed/)
    expect(hashPayload(r.require('quotes', quote.id).proposal)).not.toBe(pending.approval.payload_hash)
  })
})

describe('job controls', () => {
  it('cancelling stops later steps and creates no quote', async () => {
    const r = repo()
    const job = startMotorLeadWorkflow(r, agent, {
      source: 'broker_copilot',
      details: r.require('leads', SEED_IDS.leads.ayanda).qualification.vehicle!,
      lead_id: SEED_IDS.leads.ayanda,
    })
    cancelJob(r, { type: 'user', id: SEED_IDS.users.broker, role: 'broker' }, job.id)
    await kick(TENANT_ID, job.id)
    expect(r.require('jobs', job.id).status).toBe('cancelled')
    expect(r.list('quotes')).toHaveLength(0)
    expect(r.list('job_steps', (s) => s.job_id === job.id && s.status === 'completed')).toHaveLength(0)
  })

  it('retries a failed job from the failed step without duplicating earlier side effects', async () => {
    const r = repo()
    const leadId = SEED_IDS.leads.ayanda
    const original = structuredClone(r.require('leads', leadId).qualification)
    r.update('leads', leadId, { qualification: { ...original, vehicle: { ...original.vehicle, value: undefined } } })
    const job = startMotorLeadWorkflow(r, agent, { source: 'broker_copilot', details: {}, lead_id: leadId })
    await kick(TENANT_ID, job.id)
    expect(r.require('jobs', job.id).status).toBe('failed')
    expect(r.require('jobs', job.id).error?.step).toBe('quote')

    r.update('leads', leadId, { qualification: original })
    retryJob(r, { type: 'user', id: SEED_IDS.users.broker, role: 'broker' }, job.id)
    await kick(TENANT_ID, job.id)
    expect(r.require('jobs', job.id).status).toBe('awaiting_approval')
    expect(r.list('quotes', (q) => q.lead_id === leadId)).toHaveLength(1)
  })
})

describe('tool registry', () => {
  it('validates input', () => {
    expect(() =>
      invokeTool('customer.create', { full_name: 'X Y', email: 'not-an-email', phone: '0825550000' }, { repo: repo(), actor: agent }),
    ).toThrowError(ToolError)
  })

  it('replays a completed side effect for a repeated idempotency key', () => {
    const r = repo()
    const run = r.insert('agent_runs', {
      job_id: null,
      job_step_id: null,
      agent: 'test_agent',
      adapter: 'deterministic',
      model: null,
      prompt_version: null,
      status: 'running',
      tokens_in: null,
      tokens_out: null,
      started_at: new Date().toISOString(),
      completed_at: null,
    })
    const ctx = { repo: r, actor: agent, agentRunId: run.id, idempotencyKey: 'test:customer:1' }
    const input = { full_name: 'Test Person', email: 'test.person@example.demo', phone: '0825550000' }
    const a = invokeTool<{ customer: { id: string } }>('customer.create', input, ctx)
    const b = invokeTool<{ customer: { id: string } }>('customer.create', { ...input, email: 'other@example.demo' }, ctx)
    expect(b.customer.id).toBe(a.customer.id)
    expect(r.list('customers', (c) => c.email === 'other@example.demo')).toHaveLength(0)
  })

  it('blocks visitors from staff tools', () => {
    expect(() =>
      invokeTool('lead.search', {}, { repo: repo(), actor: { type: 'system', id: 'visitor', role: 'visitor' } }),
    ).toThrowError(/not permitted/)
  })
})
