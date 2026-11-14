import { beforeEach, describe, expect, it } from 'vitest'
import { decideApproval, listApprovals, principal, type Auth } from '../api'
import { LIFE_ADVICE, startLifeAdvice } from '../agents/lifeOrchestrator'
import { BX, karooRoster } from '../db/benefitsSeed'
import { SEED_IDS, TENANT_ID } from '../db/seed'
import { db, Repo, ScopedRepo } from '../db/store'
import { makeSaId } from '../domain/life/identity'
import { configureRunner, kick } from '../jobs/runner'
import { ToolError } from '../lib/errors'
import { getPortalLife, getPolicy, updateAdviceSection } from '../lifeApi'
import { checkAuthorisation } from '../tools/adviser'
import { invokeTool, type Actor } from '../tools/registry'

const lerato: Auth = { userId: BX.users.lerato }
const thabo: Auth = { userId: SEED_IDS.users.broker }
const johanPortal: Auth = { userId: SEED_IDS.users.johan }
const agent: Actor = { type: 'agent', id: 'test_agent', role: 'agent' }
const repo = () => new Repo(TENANT_ID)
const leratoActor = (): Actor => principal(lerato).actor

beforeEach(() => {
  db.reset()
  configureRunner({ stepDelayMs: 0 })
})

async function approvePending(auth: Auth, jobId: string) {
  const pending = listApprovals(auth, { status: ['pending'] }).find((a) => a.approval.job_id === jobId)
  expect(pending).toBeTruthy()
  decideApproval(auth, { approval_id: pending!.approval.id, decision: 'approved', payload_hash: pending!.approval.payload_hash })
  await kick(TENANT_ID, jobId)
  return pending!
}

async function runJohanToUnderwriting() {
  const { job } = startLifeAdvice(repo(), leratoActor(), { customer_id: SEED_IDS.customers.johan, person_id: BX.persons.johan, adviser_id: BX.users.lerato, smoker: false })
  await kick(TENANT_ID, job.id)
  expect(repo().require('jobs', job.id).status).toBe('awaiting_approval')
  const roaApproval = await approvePending(lerato, job.id)
  expect(roaApproval.approval.approval_type).toBe('record_of_advice_signoff')
  expect(repo().require('jobs', job.id).status).toBe('awaiting_approval')
  const appApproval = await approvePending(lerato, job.id)
  expect(appApproval.approval.approval_type).toBe('application_submission')
  return repo().require('jobs', job.id)
}

describe('shared people foundation', () => {
  it('resolves an existing client by ID number without creating anyone', () => {
    const before = { persons: repo().list('persons').length, customers: repo().list('customers').length }
    const r = invokeTool<{ person: { id: string }; created: boolean; match_basis: string }>(
      'person.resolve',
      { first_names: 'Johan', surname: 'van der Merwe', id_number: makeSaId('1984-03-14', 412, false), create_if_missing: true },
      { repo: repo(), actor: agent },
    )
    expect(r).toMatchObject({ created: false, match_basis: 'id_number' })
    expect(r.person.id).toBe(BX.persons.johan)
    expect(repo().list('persons').length).toBe(before.persons)
    expect(repo().list('customers').length).toBe(before.customers)
  })

  it('treats a name and date-of-birth match as probable and rejects invalid ID numbers', () => {
    const r = invokeTool<{ match_basis: string; confidence: number }>('person.resolve', { first_names: 'anika', surname: 'Van der Merwe', date_of_birth: '1986-07-22' }, { repo: repo(), actor: agent })
    expect(r).toMatchObject({ match_basis: 'name_and_date_of_birth', confidence: 0.85 })
    expect(() => invokeTool('person.resolve', { first_names: 'X', surname: 'Y', id_number: '8001015009088', create_if_missing: true }, { repo: repo(), actor: agent })).toThrow(/valid South African ID/)
  })

  it('keeps financial profile history and stops agents marking values verified', () => {
    invokeTool('profile.capture_financial', { person_id: BX.persons.johan, gross_monthly_income: 82_000 }, { repo: repo(), actor: leratoActor() })
    const versions = repo().list('financial_profiles', (f) => f.person_id === BX.persons.johan)
    expect(versions.map((v) => [v.version, v.status])).toEqual([
      [1, 'superseded'],
      [2, 'current'],
    ])
    expect(versions[1].net_monthly_income).toBe(54_000)
    expect(() => invokeTool('profile.capture_financial', { person_id: BX.persons.johan, gross_monthly_income: 1, source: 'verified' }, { repo: repo(), actor: agent })).toThrow(ToolError)
  })

  it('checks FAIS authorisation before any life work starts', () => {
    expect(checkAuthorisation(repo(), SEED_IDS.users.broker, 'lt_b1').authorised).toBe(false)
    expect(checkAuthorisation(repo(), BX.users.lerato, 'lt_b1').authorised).toBe(true)
    expect(() =>
      startLifeAdvice(repo(), principal(thabo).actor, { customer_id: SEED_IDS.customers.johan, person_id: BX.persons.johan, adviser_id: SEED_IDS.users.broker, smoker: false }),
    ).toThrow(/not authorised for Long-term Insurance B1/)
    expect(repo().list('jobs', (j) => j.workflow_type === LIFE_ADVICE)).toHaveLength(0)
  })

  it('limits an employer HR user to their own employer’s people', () => {
    const p = principal({ userId: BX.users.hrKaroo })
    expect(p.repo).toBeInstanceOf(ScopedRepo)
    const employments = p.repo.list('employments')
    expect(employments).toHaveLength(120)
    expect(employments.every((e) => e.employer_customer_id === BX.customers.karoo)).toBe(true)
    const dentalEmployment = repo().find('employments', (e) => e.employer_customer_id === BX.customers.dental)!
    expect(p.repo.get('employments', dentalEmployment.id)).toBeUndefined()
    expect(p.repo.get('persons', dentalEmployment.person_id)).toBeUndefined()
    expect(p.repo.get('persons', karooRoster()[0].person_id)).toBeTruthy()
    expect(p.repo.get('persons', BX.persons.johan)).toBeUndefined()
  })
})

describe('individual life: advice to issued policy', () => {
  it('takes an existing client from needs analysis to underwriting without duplicating the client', async () => {
    const before = { persons: repo().list('persons').length, customers: repo().list('customers').length }
    const job = await runJohanToUnderwriting()
    expect(job.status).toBe('completed')
    const policies = repo().list('policies', (p) => p.customer_id === SEED_IDS.customers.johan)
    expect(policies).toHaveLength(2)
    const placed = policies.find((p) => p.origin === 'placed')!
    expect(placed).toMatchObject({ status: 'underwriting', underwriting_status: 'requirements_outstanding' })
    expect(repo().list('underwriting_requirements', (u) => u.policy_id === placed.id).length).toBeGreaterThan(0)
    expect(repo().list('persons').length).toBe(before.persons)
    expect(repo().list('customers').length).toBe(before.customers)
    const roa = repo().require('records_of_advice', placed.record_of_advice_id!)
    expect(roa.status).toBe('signed_off')
    const needs = repo().require('needs_analyses', roa.needs_analysis_id!)
    expect(needs.needs.find((n) => n.benefit_type_key === 'life')!.existing).toBe(1_500_000)
    expect(repo().list('life_quote_options', (o) => o.life_quote_id === roa.life_quote_id).every((o) => o.is_simulated)).toBe(true)
  })

  it('refuses sign-off from someone without the FAIS category', async () => {
    const { job } = startLifeAdvice(repo(), leratoActor(), { customer_id: SEED_IDS.customers.johan, person_id: BX.persons.johan, adviser_id: BX.users.lerato, smoker: false })
    await kick(TENANT_ID, job.id)
    const pending = listApprovals(thabo, { status: ['pending'] }).find((a) => a.approval.job_id === job.id)!
    expect(() => decideApproval(thabo, { approval_id: pending.approval.id, decision: 'approved', payload_hash: pending.approval.payload_hash })).toThrow(/not authorised/)
  })

  it('re-raises sign-off when the adviser edits the advice, keeping the job waiting on the new request', async () => {
    const { job } = startLifeAdvice(repo(), leratoActor(), { customer_id: SEED_IDS.customers.johan, person_id: BX.persons.johan, adviser_id: BX.users.lerato, smoker: false })
    await kick(TENANT_ID, job.id)
    const first = listApprovals(lerato, { status: ['pending'] }).find((a) => a.approval.job_id === job.id)!
    const roaId = first.approval.subject_id
    updateAdviceSection(lerato, { roa_id: roaId, section: 'fees_and_commission', text: 'Commission of R412 per month is paid by the insurer, as stated in its quotation.' })
    expect(repo().require('approval_requests', first.approval.id).status).toBe('cancelled')
    expect(() => decideApproval(lerato, { approval_id: first.approval.id, decision: 'approved', payload_hash: first.approval.payload_hash })).toThrow(ToolError)
    const second = listApprovals(lerato, { status: ['pending'] }).find((a) => a.approval.subject_id === roaId)!
    expect(second.approval.job_id).toBe(job.id)
    expect(second.approval.risk_flags).toEqual([])
    await approvePending(lerato, job.id)
    expect(repo().require('records_of_advice', roaId).content.fees_and_commission).toMatch(/R412/)
  })

  it('records the insurer decision as insurer-reported, then services the book without duplicate tasks', async () => {
    await runJohanToUnderwriting()
    const placed = repo().find('policies', (p) => p.origin === 'placed')!
    expect(() => invokeTool('life.record_insurer_decision', { policy_id: placed.id, decision: 'accepted', document_ref: 'UW-1' }, { repo: repo(), actor: agent })).toThrow(ToolError)
    invokeTool('life.record_insurer_decision', { policy_id: placed.id, decision: 'accepted', document_ref: 'Acceptance letter UW-2026-1182', policy_number: 'FL-900123', inception_date: '2026-12-01' }, { repo: repo(), actor: leratoActor() })
    const detail = getPolicy(lerato, { policy_id: placed.id })
    expect(detail.policy.status).toBe('in_force')
    expect(detail.events[0]).toMatchObject({ reported_by: 'insurer', document_ref: 'Acceptance letter UW-2026-1182' })
    expect(detail.events.some((e) => e.reported_by === 'broker')).toBe(true)

    const first = invokeTool<Array<{ category: string; created: boolean }>>('life.scan_servicing', {}, { repo: repo(), actor: agent })
    expect(first.filter((f) => f.category === 'missing_beneficiary')).toHaveLength(2)
    expect(first.some((f) => f.category === 'anniversary')).toBe(true)
    const tasks = repo().list('tasks').length
    const second = invokeTool<Array<{ created: boolean }>>('life.scan_servicing', {}, { repo: repo(), actor: agent })
    expect(second.every((f) => !f.created)).toBe(true)
    expect(repo().list('tasks').length).toBe(tasks)
  })

  it('applies beneficiary changes only after approval', () => {
    const policyId = BX.policies.johanExisting
    const approval = invokeTool<{ id: string; payload_hash: string }>(
      'policy.propose_beneficiaries',
      { policy_id: policyId, beneficiaries: [{ person_id: BX.persons.anika, share_pct: 70 }, { person_id: BX.persons.lize, share_pct: 30 }] },
      { repo: repo(), actor: agent },
    )
    expect(repo().list('policy_parties', (p) => p.policy_id === policyId && p.role === 'beneficiary')).toHaveLength(0)
    expect(() => invokeTool('policy.propose_beneficiaries', { policy_id: policyId, beneficiaries: [{ person_id: BX.persons.anika, share_pct: 90 }] }, { repo: repo(), actor: agent })).toThrow(/total 100%/)
    decideApproval(thabo, { approval_id: approval.id, decision: 'approved', payload_hash: approval.payload_hash })
    const shares = repo()
      .list('policy_parties', (p) => p.policy_id === policyId && p.role === 'beneficiary' && !p.effective_to)
      .map((p) => p.share_pct)
      .sort()
    expect(shares).toEqual([30, 70])
    expect(getPortalLife(johanPortal).policies[0].beneficiaries).toHaveLength(2)
  })
})
