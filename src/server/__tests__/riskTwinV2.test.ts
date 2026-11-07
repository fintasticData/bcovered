import { beforeEach, describe, expect, it } from 'vitest'
import { decideApproval, listApprovals, sendMessage, startConversation, type Auth } from '../api'
import { handleCopilotCommand } from '../agents/copilotCommands'
import { loadDemoBusinesses, startTwinBuildForProfile } from '../commercialApi'
import { SEED_IDS, TENANT_ID } from '../db/seed'
import { db, Repo } from '../db/store'
import { configureRunner, kick } from '../jobs/runner'
import type { Actor } from '../tools/registry'
import { invokeTool } from '../tools/registry'
import {
  addBusinessDocument,
  compareTwinWithBaseline,
  decideDependency,
  decideTwinProposal,
  getAssessmentReport,
  getTwinWorkspace,
  overrideExposurePriority,
  reviewCoverageFinding,
  startAssessmentForProfile,
  startInvestigationForProfile,
  traceTwinImpact,
} from '../twinApi'

const broker: Auth = { userId: SEED_IDS.users.broker }
const brokerActor: Actor = { type: 'user', id: SEED_IDS.users.broker, role: 'broker' }
const agent: Actor = { type: 'agent', id: 'test_agent', role: 'agent' }
const repo = () => new Repo(TENANT_ID)
const UBUNTU = SEED_IDS.business.ubuntu
const FREEZERS = 'a0000000-0000-4000-8000-000000000623'
const TRUCKS = 'a0000000-0000-4000-8000-000000000625'

async function buildTwin() {
  const { job_id } = startTwinBuildForProfile(broker, { profile_id: UBUNTU })
  await kick(TENANT_ID, job_id)
  return repo().find('business_risk_profiles', (r) => r.business_profile_id === UBUNTU && r.status === 'current')!
}

async function addAllDocuments() {
  for (const key of ['ubuntu_policy_schedule', 'ubuntu_asset_register']) {
    addBusinessDocument(broker, { profile_id: UBUNTU, fixture_key: key })
  }
  repo()
    .list('twin_update_proposals', (p) => p.status === 'pending')
    .forEach((p) => decideTwinProposal(broker, { proposal_id: p.id, decision: 'apply', confirm_conflict: true }))
}

beforeEach(() => {
  db.reset()
  configureRunner({ stepDelayMs: 0 })
})

describe('First end-to-end demonstration: Ubuntu Foods assessment', () => {
  it('assesses Ubuntu Foods, ranks the five most important areas with reasons, creates tasks and waits for sign-off', async () => {
    const out = handleCopilotCommand(repo(), brokerActor, 'Assess Ubuntu Foods and identify the five most important risk areas requiring review.', 'commercial')
    expect(out.view.kind).toBe('twin')
    const jobId = out.view.kind === 'twin' ? out.view.job_id! : ''
    await kick(TENANT_ID, jobId)
    const r = repo()
    expect(r.require('jobs', jobId).status).toBe('awaiting_approval')
    expect(r.list('business_profiles', (p) => p.registered_name === 'Ubuntu Foods (Pty) Ltd')).toHaveLength(1)

    const w = getTwinWorkspace(broker, { profile_id: UBUNTU })
    expect(w.assessment?.status).toBe('awaiting_review')
    const top = w.findings.filter((f) => f.is_priority_area)
    expect(top).toHaveLength(5)
    top.forEach((f) => {
      expect(f.rationale.some((x) => x.startsWith('Potential severity'))).toBe(true)
      expect(f.rationale.some((x) => x.startsWith('Coverage uncertainty'))).toBe(true)
    })
    expect(w.findings.map((f) => f.rank)).toEqual(w.findings.map((_, i) => i + 1))
    // No policy evidence on file: nothing may be presented as covered.
    expect(r.list('risk_exposures', (e) => e.business_profile_id === UBUNTU && e.coverage_status.startsWith('confirmed'))).toHaveLength(0)
    expect(w.findings.every((f) => f.coverage.status === 'unknown')).toBe(true)
    expect(r.list('tasks', (t) => t.dedupe_key?.startsWith(`${w.assessment!.id}:finding:`) === true)).toHaveLength(5)

    const [approval] = listApprovals(broker, { status: ['pending'] }).filter((a) => a.approval.approval_type === 'risk_assessment_signoff')
    expect(approval.risk?.current_matches).toBe(true)
    decideApproval(broker, { approval_id: approval.approval.id, decision: 'approved', payload_hash: approval.approval.payload_hash })
    await kick(TENANT_ID, jobId)
    expect(repo().require('jobs', jobId).status).toBe('completed')
    expect(repo().require('risk_assessments', w.assessment!.id).status).toBe('approved')

    const report = getAssessmentReport(broker, { assessment_id: w.assessment!.id })
    expect(report.conclusions_approved).toBe(true)
    expect(report.signoff.decided_by).toBe('Thabo Nkosi')
    expect(report.findings).toHaveLength(w.findings.length)
    expect(report.overview.find((f) => f.label === 'Registration number')?.source).toBe('verified')
  })

  it('makes a pending sign-off stale when a broker overrides a priority, and re-pins it', async () => {
    const { job_id } = startAssessmentForProfile(broker, { profile_id: UBUNTU, assessment_type: 'initial' })
    await kick(TENANT_ID, job_id)
    const w = getTwinWorkspace(broker, { profile_id: UBUNTU })
    const before = listApprovals(broker, { status: ['pending'] }).find((a) => a.risk)!
    const low = w.findings[w.findings.length - 1]
    expect(() => overrideExposurePriority(broker, { exposure_id: low.exposure_id!, priority: 'critical', reason: 'x' })).toThrow()
    overrideExposurePriority(broker, { exposure_id: low.exposure_id!, priority: 'critical', reason: 'Single cold store with no redundancy' })
    const after = listApprovals(broker, { status: ['pending'] }).find((a) => a.risk)!
    expect(after.approval.id).not.toBe(before.approval.id)
    expect(after.approval.job_id).toBe(job_id)
    const f = repo().require('risk_assessment_findings', low.id)
    expect(f.priority).toBe('critical')
    expect(f.status).toBe('overridden')
    expect(f.rationale.at(-1)).toMatch(/Broker override to critical: Single cold store/)
  })
})

describe('Graph intelligence', () => {
  it('traces what happens if the blast freezers fail through explicit links only, without a loss estimate', async () => {
    const rp = await buildTwin()
    const impact = traceTwinImpact(broker, { risk_profile_id: rp.id, table: 'commercial_assets', id: FREEZERS })
    const labels = impact.nodes.map((n) => n.label)
    expect(labels).toEqual(expect.arrayContaining(['Cold storage and dispatch', 'Raw materials and frozen finished meals', 'Retail chain supply contracts', 'Two national retail chains']))
    expect(labels).not.toContain('Ready-meal production line')
    expect(impact.paths.every((p) => !p.inferred)).toBe(true)
    expect(impact.known_values.find((v) => /Retail chain/.test(v.label))?.value).toBe(67_200_000)
    expect(impact.assumptions.join(' ')).toMatch(/not a loss estimate/)
    expect(impact.missing.join(' ')).toMatch(/No policy schedule/)
    expect(JSON.stringify(impact)).not.toMatch(/estimated loss|loss estimate of/i)

    const reply = handleCopilotCommand(repo(), brokerActor, 'What happens if the blast freezer fails?', 'commercial')
    expect(reply.view.kind).toBe('twin')
    expect(reply.reply).toMatch(/cold storage and dispatch/i)
  })

  it('adds no inferred links where dependencies are recorded', async () => {
    const rp = await buildTwin()
    expect(repo().list('risk_dependencies', (d) => d.risk_profile_id === rp.id && d.source === 'inferred')).toHaveLength(0)
    expect(repo().list('business_dependency_links', (l) => l.business_profile_id === UBUNTU).every((l) => l.source === 'declared')).toBe(true)
  })

  it('proposes inferred links where none are recorded, and a broker confirms or rejects them', async () => {
    const swift = 'a0000000-0000-4000-8000-000000000841'
    loadDemoBusinesses(broker)
    await Promise.all(repo().list('jobs', (j) => j.status === 'queued').map((j) => kick(TENANT_ID, j.id)))
    const inferred = repo().list('business_dependency_links', (l) => l.business_profile_id === swift && l.source === 'inferred')
    expect(inferred.length).toBeGreaterThan(0)
    expect(inferred.every((l) => l.note?.includes('Confirm or reject'))).toBe(true)
    const rp = repo().find('business_risk_profiles', (x) => x.business_profile_id === swift && x.status === 'current')!
    const [keep, drop] = inferred
    decideDependency(broker, { link_id: keep.id, decision: 'confirm' })
    decideDependency(broker, { link_id: drop.id, decision: 'reject' })
    const edges = repo().list('risk_dependencies', (d) => d.risk_profile_id === rp.id)
    expect(edges.find((d) => d.from_id === keep.from_id && d.to_id === keep.to_id)?.source).toBe('declared')
    expect(edges.some((d) => d.from_id === drop.from_id && d.to_id === drop.to_id && d.relation === drop.relation)).toBe(false)
    expect(() => invokeTool('risk.confirm_dependency', { link_id: keep.id, decision: 'confirm' }, { repo: repo(), actor: agent })).toThrow(/not permitted/)

    // A rejected suggestion is never proposed again when the Twin is rebuilt.
    const { job_id } = startTwinBuildForProfile(broker, { profile_id: swift })
    await kick(TENANT_ID, job_id)
    expect(repo().list('business_dependency_links', (l) => l.from_id === drop.from_id && l.to_id === drop.to_id && l.relation === drop.relation)).toHaveLength(1)
    expect(repo().require('business_dependency_links', drop.id).status).toBe('rejected')
  })
})

describe('Coverage and document intelligence', () => {
  it('extracts a simulated policy schedule, proposes updates, and never confirms cover without a broker', async () => {
    await buildTwin()
    const added = addBusinessDocument(broker, { profile_id: UBUNTU, fixture_key: 'ubuntu_policy_schedule' })
    expect(added).toMatchObject({ extracted: true, proposals: 1 })
    expect(addBusinessDocument(broker, { profile_id: UBUNTU, fixture_key: 'ubuntu_policy_schedule' }).document_id).toBe(added.document_id)
    const doc = repo().require('business_documents', added.document_id)
    expect(doc.is_simulated).toBe(true)
    expect(repo().list('policy_sections')).toHaveLength(0)

    const [proposal] = repo().list('twin_update_proposals', (p) => p.document_id === added.document_id)
    decideTwinProposal(broker, { proposal_id: proposal.id, decision: 'apply' })
    const sections = repo().list('policy_sections', (s) => s.business_profile_id === UBUNTU)
    expect(sections.length).toBe(9)
    expect(sections.every((s) => s.source === 'extracted' && s.page_ref)).toBe(true)

    const { job_id } = startAssessmentForProfile(broker, { profile_id: UBUNTU, assessment_type: 'annual_renewal' })
    await kick(TENANT_ID, job_id)
    const r = repo()
    const exposures = r.list('risk_exposures', (e) => e.business_profile_id === UBUNTU && r.get('business_risk_profiles', e.risk_profile_id)?.status === 'current')
    expect(exposures.some((e) => e.coverage_status.startsWith('confirmed'))).toBe(false)
    const deterioration = exposures.find((e) => e.rule_key === 'stock_deterioration')!
    expect(deterioration.coverage_status).toBe('awaiting_broker_review')
    const finding = r.find('coverage_findings', (f) => f.exposure_id === deterioration.id)!
    expect(finding.clause_ref).toMatch(/load-shedding/)
    expect(finding.page_ref).toBe('p. 4')
    expect(() => invokeTool('risk.coverage_review_finding', { finding_id: finding.id, status: 'confirmed_excluded', note: 'x' }, { repo: r, actor: agent })).toThrow(/not permitted/)
    expect(() => reviewCoverageFinding(broker, { finding_id: finding.id, status: 'confirmed_excluded' })).toThrow(/Cite the clause/)
    reviewCoverageFinding(broker, { finding_id: finding.id, status: 'confirmed_excluded', note: 'p. 4 excludes scheduled outages' })
    expect(repo().require('risk_exposures', deterioration.id).coverage_status).toBe('confirmed_excluded')
  })

  it('refreshes open findings and re-pins a pending sign-off when a policy schedule is applied', async () => {
    const { job_id } = startAssessmentForProfile(broker, { profile_id: UBUNTU, assessment_type: 'initial' })
    await kick(TENANT_ID, job_id)
    const before = listApprovals(broker, { status: ['pending'] }).find((a) => a.risk)!
    expect(getTwinWorkspace(broker, { profile_id: UBUNTU }).findings.every((f) => f.coverage.status === 'unknown')).toBe(true)

    const added = addBusinessDocument(broker, { profile_id: UBUNTU, fixture_key: 'ubuntu_policy_schedule' })
    const [proposal] = repo().list('twin_update_proposals', (p) => p.document_id === added.document_id)
    decideTwinProposal(broker, { proposal_id: proposal.id, decision: 'apply' })

    const w = getTwinWorkspace(broker, { profile_id: UBUNTU })
    expect(w.findings.some((f) => f.coverage.status === 'potentially_covered')).toBe(true)
    expect(w.findings.find((f) => /spoilage/i.test(f.title))?.coverage.note).toMatch(/load-shedding/)
    expect(w.findings.every((f) => !/No policy schedule has been analysed/.test(f.coverage.note))).toBe(true)
    expect(repo().require('approval_requests', before.approval.id).status).toBe('cancelled')
    const after = listApprovals(broker, { status: ['pending'] }).find((a) => a.risk)!
    expect(after.approval.job_id).toBe(job_id)
    expect(after.risk?.current_matches).toBe(true)
    decideApproval(broker, { approval_id: after.approval.id, decision: 'approved', payload_hash: after.approval.payload_hash })
    await kick(TENANT_ID, job_id)
    expect(repo().require('jobs', job_id).status).toBe('completed')
  })

  it('flags a conflict before replacing a verified value from a document', async () => {
    const r = repo()
    invokeTool('business.update_asset', { asset_id: FREEZERS, declared_value: 2_100_000, source: 'verified' }, { repo: r, actor: brokerActor })
    const added = addBusinessDocument(broker, { profile_id: UBUNTU, fixture_key: 'ubuntu_asset_register' })
    const p = repo().find('twin_update_proposals', (x) => x.document_id === added.document_id && x.target_id === FREEZERS)!
    expect(p.conflict).toMatch(/verified/)
    expect(() => decideTwinProposal(broker, { proposal_id: p.id, decision: 'apply' })).toThrow(/Confirm the conflict/)
    expect(repo().require('commercial_assets', FREEZERS).declared_value).toBe(2_100_000)
    decideTwinProposal(broker, { proposal_id: p.id, decision: 'apply', confirm_conflict: true })
    expect(repo().require('commercial_assets', FREEZERS)).toMatchObject({ declared_value: 2_600_000, source: 'extracted' })
  })
})

describe('Agentic investigation', () => {
  it('investigates possible underinsurance using recorded values and creates proposed actions for review', async () => {
    await buildTwin()
    await addAllDocuments()
    const out = handleCopilotCommand(repo(), brokerActor, 'Investigate possible underinsurance at Ubuntu Foods', 'commercial')
    const jobId = out.view.kind === 'twin' ? out.view.job_id! : ''
    await kick(TENANT_ID, jobId)
    const r = repo()
    expect(r.require('jobs', jobId).status).toBe('awaiting_approval')
    const w = getTwinWorkspace(broker, { profile_id: UBUNTU })
    const inv = w.investigations.find((i) => i.id === jobId)!
    const plant = inv.findings.find((f) => f.title === 'Plant and machinery (fire)')!
    expect(plant.status).toBe('below_declared')
    expect(plant.detail).toMatch(/R(12|11)/)
    expect(plant.page_ref).toBe('p. 2')
    expect(inv.findings.find((f) => f.title === 'Vehicles')?.status).toBe('no_section')
    expect(r.list('tasks', (t) => t.job_id === jobId).length).toBeGreaterThan(0)
    expect(listApprovals(broker, { status: ['pending'] }).some((a) => a.approval.approval_type === 'risk_investigation_review' && a.risk?.kind === 'investigation')).toBe(true)
    expect(startInvestigationForProfile(broker, { profile_id: UBUNTU, kind: 'underinsurance' })).toEqual({ job_id: jobId, reused: true })
  })
})

describe('Change intelligence', () => {
  it('compares the business with its last signed-off assessment and creates a review task for new vehicles', async () => {
    const { job_id } = startAssessmentForProfile(broker, { profile_id: UBUNTU, assessment_type: 'annual_renewal' })
    await kick(TENANT_ID, job_id)
    const [approval] = listApprovals(broker, { status: ['pending'] }).filter((a) => a.risk)
    decideApproval(broker, { approval_id: approval.approval.id, decision: 'approved', payload_hash: approval.approval.payload_hash })
    await kick(TENANT_ID, job_id)

    addBusinessDocument(broker, { profile_id: UBUNTU, fixture_key: 'ubuntu_vehicle_register' })
    const p = repo().find('twin_update_proposals', (x) => x.target_id === TRUCKS)!
    decideTwinProposal(broker, { proposal_id: p.id, decision: 'apply', confirm_conflict: true })

    const out = handleCopilotCommand(repo(), brokerActor, 'Compare Ubuntu Foods with its last renewal assessment', 'commercial')
    expect(out.reply).toMatch(/Three additional vehicles require insurance schedule verification/)
    const report = compareTwinWithBaseline(broker, { profile_id: UBUNTU })
    const vehicles = report.changes.find((c) => c.field === 'quantity' && c.entity_id === TRUCKS)!
    expect(vehicles).toMatchObject({ before: 4, after: 7 })
    expect(report.baseline.label).toMatch(/annual renewal assessment signed off/)
    const tasks = repo().list('tasks', (t) => t.status === 'open' && /Verify refrigerated delivery trucks/.test(t.title))
    expect(tasks).toHaveLength(1)
    expect(report.tasks_created).toBe(0)
  })
})

describe('Workspace and report', () => {
  it('shows the workflow stages and marks an unsigned report as preliminary', async () => {
    let w = getTwinWorkspace(broker, { profile_id: UBUNTU })
    expect(w.business.risk_profile).toBeNull()
    expect(w.stages.find((s) => s.key === 'exposures')?.status).toBe('not_started')
    expect(w.samples.map((s) => s.key)).toEqual(['ubuntu_policy_schedule', 'ubuntu_vehicle_register', 'ubuntu_asset_register'])

    const { job_id } = startAssessmentForProfile(broker, { profile_id: UBUNTU, assessment_type: 'initial' })
    await kick(TENANT_ID, job_id)
    w = getTwinWorkspace(broker, { profile_id: UBUNTU })
    expect(w.stages.map((s) => [s.key, s.status])).toEqual([
      ['discovery', 'completed'],
      ['assets', 'review_required'],
      ['exposures', 'completed'],
      ['insurance', 'not_started'],
      ['signoff', 'pending'],
    ])
    expect(w.kpis.verified_facts).toBeGreaterThan(0)
    const insurance = w.completeness.find((c) => c.key === 'insurance')!
    expect(insurance).toMatchObject({ status: 'missing', missing: ['Current policy schedule'] })

    const report = getAssessmentReport(broker, { assessment_id: w.assessment!.id })
    expect(report.conclusions_approved).toBe(false)
    expect(report.signoff.status).toBe('awaiting_review')
    expect(report.coverage_gaps.length).toBeGreaterThan(0)
    expect(report.investigations.some((i) => i.status === 'Recommended')).toBe(true)
    expect(report.assumptions.join(' ')).toMatch(/No loss or premium has been estimated/)
  })
})

describe('Workspace and report', () => {
  it('shows the workflow stages and marks an unsigned report as preliminary', async () => {
    let w = getTwinWorkspace(broker, { profile_id: UBUNTU })
    expect(w.business.risk_profile).toBeNull()
    expect(w.stages.find((s) => s.key === 'exposures')?.status).toBe('not_started')
    expect(w.samples.map((s) => s.key)).toEqual(['ubuntu_policy_schedule', 'ubuntu_vehicle_register', 'ubuntu_asset_register'])

    const { job_id } = startAssessmentForProfile(broker, { profile_id: UBUNTU, assessment_type: 'initial' })
    await kick(TENANT_ID, job_id)
    w = getTwinWorkspace(broker, { profile_id: UBUNTU })
    expect(w.stages.map((s) => [s.key, s.status])).toEqual([
      ['discovery', 'completed'],
      ['assets', 'review_required'],
      ['exposures', 'completed'],
      ['insurance', 'not_started'],
      ['signoff', 'pending'],
    ])
    expect(w.kpis.verified_facts).toBeGreaterThan(0)
    const insurance = w.completeness.find((c) => c.key === 'insurance')!
    expect(insurance).toMatchObject({ status: 'missing', missing: ['Current policy schedule'] })

    const report = getAssessmentReport(broker, { assessment_id: w.assessment!.id })
    expect(report.conclusions_approved).toBe(false)
    expect(report.signoff.status).toBe('awaiting_review')
    expect(report.coverage_gaps.length).toBeGreaterThan(0)
    expect(report.investigations.some((i) => i.status === 'Recommended')).toBe(true)
    expect(report.assumptions.join(' ')).toMatch(/No loss or premium has been estimated/)
  })
})

describe('Broker-led discovery still works inside the Copilot', () => {
  it('keeps the conversation in Copilot mode after an assessment command', async () => {
    let view = startConversation(broker, { channel: 'broker', assistant: 'commercial_copilot' })
    view = await sendMessage(broker, { conversation_id: view.conversation.id, text: 'Assess Ubuntu Foods' })
    const last = view.messages[view.messages.length - 1]
    expect(last.view?.kind).toBe('twin')
  })
})
