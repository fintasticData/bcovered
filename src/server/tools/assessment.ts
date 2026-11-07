import { z } from 'zod'
import type { CompletenessItem, RiskAssessmentFinding, RiskAssessmentRecord } from '../db/commercialSchema'
import type { Repo } from '../db/store'
import { assessCompleteness } from '../domain/commercial/completeness'
import { matchCoverage } from '../domain/commercial/coverage'
import { nodeKey, traceImpact, traceOperational } from '../domain/commercial/graph'
import { prioritise, rankFindings, PRIORITY_AREA_COUNT, type ExposureContext } from '../domain/commercial/prioritise'
import { compareValuations } from '../domain/commercial/valuation'
import { ToolError } from '../lib/errors'
import { requestApproval } from './approval'
import { assessmentReviewPayload } from './assessmentPayload'
import { profileSnapshot } from './business'
import { defineTool, STAFF, type ToolDef } from './registry'
import { templateFor } from './risk'
import { createTask } from './task'
import { currentTwinOf, requireCurrentTwin } from './twin'

export const ASSESSMENT_TYPES = ['initial', 'annual_renewal', 'new_location', 'new_asset', 'business_change', 'incident_triggered', 'targeted_specialist'] as const

export const ASSESSMENT_TYPE_LABEL: Record<(typeof ASSESSMENT_TYPES)[number], string> = {
  initial: 'Initial business assessment',
  annual_renewal: 'Annual renewal assessment',
  new_location: 'New location assessment',
  new_asset: 'New asset assessment',
  business_change: 'Business change assessment',
  incident_triggered: 'Incident-triggered assessment',
  targeted_specialist: 'Targeted specialist assessment',
}

const latestCoverage = (repo: Repo, exposureId: string) =>
  repo.list('coverage_findings', (f) => f.exposure_id === exposureId).sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0] ?? null

/** Current completeness of the information held for a business. */
export function completenessFor(repo: Repo, profileId: string, assessment: Pick<RiskAssessmentRecord, 'status'> | null): CompletenessItem[] {
  const rp = currentTwinOf(repo, profileId)
  const exposures = rp ? repo.list('risk_exposures', (e) => e.risk_profile_id === rp.id) : []
  return assessCompleteness({
    snapshot: profileSnapshot(repo, profileId),
    links: repo.list('business_dependency_links', (l) => l.business_profile_id === profileId),
    policies: repo.list('insurance_policies', (p) => p.business_profile_id === profileId),
    sections: repo.list('policy_sections', (s) => s.business_profile_id === profileId),
    exposures,
    coverage: repo.list('coverage_findings', (f) => exposures.some((e) => e.id === f.exposure_id)),
    assessment,
  })
}

function exposureContexts(repo: Repo, riskProfileId: string): ExposureContext[] {
  const rp = repo.require('business_risk_profiles', riskProfileId)
  const edges = repo.list('risk_dependencies', (d) => d.risk_profile_id === rp.id)
  const locations = repo.list('business_locations', (l) => l.business_profile_id === rp.business_profile_id)
  return repo
    .list('risk_exposures', (e) => e.risk_profile_id === rp.id)
    .map((e) => {
      const linked = edges.filter((d) => d.relation === 'exposes' && d.to_id === e.id)
      const assets = linked.filter((d) => d.from_table === 'commercial_assets').map((d) => repo.require('commercial_assets', d.from_id))
      const streams = new Map<string, number>()
      linked.forEach((d) => {
        if (d.from_table === 'risk_exposures') return
        const trace = traceOperational(repo, edges, { table: d.from_table, id: d.from_id }, 'downstream')
        trace.nodes
          .filter((n) => n.table === 'business_activities')
          .forEach((n) => {
            const a = repo.require('business_activities', n.id)
            if (a.kind === 'revenue_stream' && a.share_of_revenue !== null) streams.set(a.id, a.share_of_revenue)
          })
      })
      const share = streams.size ? Math.min(1, [...streams.values()].reduce((s, v) => s + v, 0)) : null
      return {
        exposure: e,
        assets,
        locations: locations.filter((l) => e.location_ids.includes(l.id)),
        revenue_share: share,
        single_site: locations.length === 1,
        coverage: latestCoverage(repo, e.id),
      }
    })
}

/** Ranks every exposure into findings, keeping a broker's earlier accept, reject and override decisions. */
function computeFindings(repo: Repo, assessmentId: string, status: 'in_progress' | 'awaiting_review') {
  const a = repo.require('risk_assessments', assessmentId)
  const prior = new Map<string, RiskAssessmentFinding>()
  repo.list('risk_assessment_findings', (f) => f.assessment_id === a.id).forEach((f) => {
    if (f.exposure_id) prior.set(f.exposure_id, f)
    repo.remove('risk_assessment_findings', f.id)
  })
  const ranked = rankFindings(exposureContexts(repo, a.risk_profile_id).map(prioritise))
  const findings: RiskAssessmentFinding[] = ranked.map((d) => {
    const cov = latestCoverage(repo, d.exposure_id)
    const exposure = repo.require('risk_exposures', d.exposure_id)
    const section = cov?.policy_section_id ? repo.get('policy_sections', cov.policy_section_id) : undefined
    const before = prior.get(d.exposure_id)
    return repo.insert('risk_assessment_findings', {
      assessment_id: a.id,
      business_profile_id: a.business_profile_id,
      exposure_id: d.exposure_id,
      rank: d.rank,
      is_priority_area: d.is_priority_area,
      title: d.title,
      category: d.category,
      priority: d.priority,
      rationale: d.rationale,
      evidence: d.evidence,
      fact_basis: d.fact_basis,
      coverage: {
        status: cov?.status ?? exposure.coverage_status,
        sections: section ? [`${section.section_name}${section.page_ref ? ` (${section.page_ref})` : ''}`] : [],
        note: cov?.rationale ?? 'No coverage evidence has been reviewed for this exposure.',
      },
      outstanding: d.outstanding,
      status: d.overridden ? 'overridden' : before?.status === 'rejected' || before?.status === 'accepted' ? before.status : 'proposed',
      broker_note: d.overridden ? exposure.override_reason : (before?.broker_note ?? null),
    })
  })
  const completeness = completenessFor(repo, a.business_profile_id, { status })
  const top = findings.filter((f) => f.is_priority_area)
  const updated = repo.update('risk_assessments', a.id, {
    status,
    exposure_count: findings.length,
    high_priority_count: findings.filter((f) => f.priority === 'critical' || f.priority === 'high').length,
    findings: findings.map((f) => `${f.rank}. ${f.priority.toUpperCase()}: ${f.title}`),
    completeness,
    summary: `${findings.length} findings; the ${top.length} most important areas for review: ${top.map((f) => f.title.toLowerCase()).join('; ')}.`,
  })
  return { assessment: updated, findings }
}

/**
 * Brings open assessments up to date after the evidence changed (a policy was applied or a broker decided coverage).
 * A pending sign-off is re-pinned to the refreshed findings, so a broker never signs off stale evidence.
 */
export function refreshOpenAssessments(repo: Repo, profileId: string): number {
  const open = repo.list('risk_assessments', (a) => a.business_profile_id === profileId && ['in_progress', 'awaiting_review'].includes(a.status))
  open.forEach((a) => {
    computeFindings(repo, a.id, a.status as 'in_progress' | 'awaiting_review')
    refreshAssessmentApproval(repo, a.id)
  })
  return open.length
}

/** Re-pins a pending sign-off after a broker changed a finding, so the approval always matches what is on screen. */
export function refreshAssessmentApproval(repo: Repo, assessmentId: string) {
  const a = repo.require('risk_assessments', assessmentId)
  if (a.status !== 'awaiting_review' || !a.approval_id) return
  const pending = repo.get('approval_requests', a.approval_id)
  if (!pending || pending.status !== 'pending') return
  requestApproval(repo, pending.requested_by_agent, pending.job_id, {
    approval_type: 'risk_assessment_signoff',
    subject_table: 'risk_assessments',
    subject_id: a.id,
    summary: pending.summary,
    proposed_changes: assessmentReviewPayload(repo, a.id),
    risk_flags: pending.risk_flags,
    evidence: pending.evidence,
  })
}

export const assessmentTools = [
  defineTool({
    name: 'risk.assessment_create',
    description: 'Open a formal risk assessment on the current Risk Twin. Reuses an open assessment of the same type instead of duplicating it.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({ profile_id: z.uuid(), assessment_type: z.enum(ASSESSMENT_TYPES), scope: z.array(z.string()).optional() }),
    run: ({ repo, actor, jobId }, { profile_id, assessment_type, scope }) => {
      const rp = requireCurrentTwin(repo, profile_id)
      const open = repo.find(
        'risk_assessments',
        (a) => a.risk_profile_id === rp.id && a.assessment_type === assessment_type && ['in_progress', 'awaiting_review'].includes(a.status),
      )
      if (open) return { assessment: open, created: false }
      const profile = repo.require('business_profiles', profile_id)
      const template = templateFor(repo, profile.industry_key)
      const exposures = repo.list('risk_exposures', (e) => e.risk_profile_id === rp.id)
      const assessment = repo.insert('risk_assessments', {
        business_profile_id: profile_id,
        risk_profile_id: rp.id,
        job_id: jobId ?? null,
        assessment_type,
        status: 'in_progress',
        scope: scope ?? [`All ${exposures.length} potential exposures on Risk Twin v${rp.version}`, `${template.name} template v${template.version}`],
        assessor_id: actor.type === 'user' ? actor.id : profile.assigned_broker_id,
        approval_id: null,
        template_key: template.key,
        template_version: template.version,
        exposure_count: exposures.length,
        high_priority_count: 0,
        findings: [],
        gaps: [],
        completeness: [],
        summary: null,
        next_review_date: null,
      })
      return { assessment, created: true }
    },
    auditEntity: (r) => ({ table: 'risk_assessments', id: r.assessment.id }),
  }),

  defineTool({
    name: 'risk.assessment_run',
    description: 'Prioritise every exposure with an explained rationale, mark the most important areas for review and record completeness.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({ assessment_id: z.uuid() }),
    run: ({ repo }, { assessment_id }) => {
      const a = repo.require('risk_assessments', assessment_id)
      if (!['in_progress', 'draft'].includes(a.status)) throw new ToolError('conflict', `The assessment is ${a.status.replace(/_/g, ' ')} and cannot be re-run`)
      return computeFindings(repo, a.id, 'in_progress')
    },
    auditEntity: (r) => ({ table: 'risk_assessments', id: r.assessment.id }),
  }),

  defineTool({
    name: 'risk.assessment_get_findings',
    description: 'Get the ranked findings of an assessment.',
    allow: ['agent', ...STAFF],
    sideEffect: false,
    input: z.object({ assessment_id: z.uuid() }),
    run: ({ repo }, { assessment_id }) => repo.list('risk_assessment_findings', (f) => f.assessment_id === assessment_id).sort((x, y) => x.rank - y.rank),
  }),

  defineTool({
    name: 'risk.assessment_identify_gaps',
    description: 'Turn missing information into customer requests and the priority areas into broker review tasks.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({ assessment_id: z.uuid() }),
    run: ({ repo, actor, jobId }, { assessment_id }) => {
      const a = repo.require('risk_assessments', assessment_id)
      const profile = repo.require('business_profiles', a.business_profile_id)
      const completeness = completenessFor(repo, profile.id, a)
      const by = actor.type === 'agent' ? actor.id : null
      const base = { customer_id: profile.customer_id, subject_table: 'business_profiles', subject_id: profile.id }
      const results = [
        ...completeness
          .filter((c) => c.key !== 'broker_review' && c.missing.length)
          .map((c) =>
            createTask(repo, by, jobId ?? null, {
              ...base,
              kind: c.key === 'insurance' ? 'document_request' : 'information_request',
              audience: c.key === 'dependencies' ? 'broker' : 'customer',
              title: c.key === 'insurance' ? 'Provide the current policy schedules and wordings' : `Complete ${c.label.toLowerCase()}`,
              detail: `Missing: ${c.missing.slice(0, 6).join('; ')}${c.missing.length > 6 ? `; and ${c.missing.length - 6} more` : ''}.`,
              assigned_to: c.key === 'dependencies' ? profile.assigned_broker_id : null,
              due_in_days: 7,
              dedupe_key: `${profile.id}:completeness:${c.key}`,
            }),
          ),
        ...repo
          .list('risk_assessment_findings', (f) => f.assessment_id === a.id && f.is_priority_area)
          .map((f) =>
            createTask(repo, by, jobId ?? null, {
              ...base,
              kind: 'broker_review',
              audience: 'broker',
              title: `Review priority area ${f.rank}: ${f.title}`,
              detail: `${f.priority} priority. ${f.rationale[0]} ${f.outstanding[0] ?? ''}`.trim(),
              assigned_to: profile.assigned_broker_id,
              due_in_days: 3,
              dedupe_key: `${a.id}:finding:${f.exposure_id}`,
            }),
          ),
      ]
      repo.update('risk_assessments', a.id, { completeness, gaps: completeness.flatMap((c) => c.missing) })
      return { completeness, tasks: results.map((r) => r.task), created: results.filter((r) => r.created).length }
    },
    auditEntity: (r) => (r.tasks[0] ? { table: 'tasks', id: r.tasks[0].id } : null),
  }),

  defineTool({
    name: 'risk.assessment_request_review',
    description: 'Ask the broker to sign off the assessment. The approval is pinned to the exact findings.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({ assessment_id: z.uuid() }),
    run: ({ repo, actor, jobId }, { assessment_id }) => {
      const a = repo.require('risk_assessments', assessment_id)
      const findings = repo.list('risk_assessment_findings', (f) => f.assessment_id === a.id)
      if (!findings.length) throw new ToolError('conflict', 'Run the assessment before requesting a review')
      const profile = repo.require('business_profiles', a.business_profile_id)
      const top = findings.filter((f) => f.is_priority_area).sort((x, y) => x.rank - y.rank)
      return requestApproval(repo, actor.id, jobId ?? null, {
        approval_type: 'risk_assessment_signoff',
        subject_table: 'risk_assessments',
        subject_id: a.id,
        summary: `Sign off the ${ASSESSMENT_TYPE_LABEL[a.assessment_type].toLowerCase()} for ${profile.trading_name ?? profile.registered_name} (${findings.length} findings, ${top.length} priority areas)`,
        proposed_changes: assessmentReviewPayload(repo, a.id),
        risk_flags: findings.filter((f) => f.priority === 'critical' || f.priority === 'high').map((f) => `${f.priority === 'critical' ? 'Critical' : 'High'}: ${f.title}`),
        evidence: [
          { label: 'Assessment', ref: a.id },
          { label: 'Business profile', ref: profile.id },
          { label: 'Risk Twin', ref: a.risk_profile_id },
        ],
      })
    },
    auditEntity: (r) => ({ table: 'approval_requests', id: r.id }),
  }),

  defineTool({
    name: 'risk.assessment_finalise',
    description: 'Record a signed-off assessment as the current baseline for change comparison.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({ assessment_id: z.uuid() }),
    run: ({ repo }, { assessment_id }) => {
      const a = repo.require('risk_assessments', assessment_id)
      if (a.status !== 'approved') throw new ToolError('approval_required', 'The assessment has not been signed off by a broker')
      repo
        .list('risk_assessments', (x) => x.business_profile_id === a.business_profile_id && x.id !== a.id && x.status === 'approved' && x.assessment_type === a.assessment_type)
        .forEach((x) => repo.update('risk_assessments', x.id, { status: 'superseded' }))
      return repo.update('risk_assessments', a.id, { completeness: completenessFor(repo, a.business_profile_id, a) })
    },
    auditEntity: (r) => ({ table: 'risk_assessments', id: r.id }),
  }),

  defineTool({
    name: 'risk.finding_decide',
    description: 'A broker accepts or rejects one assessment finding, with an optional note.',
    allow: STAFF,
    sideEffect: true,
    input: z.object({ finding_id: z.uuid(), status: z.enum(['accepted', 'rejected', 'proposed']), note: z.string().max(500).nullable().optional() }),
    run: ({ repo, actor }, { finding_id, status, note }) => {
      if (actor.type !== 'user') throw new ToolError('forbidden', 'Only a person can decide on a finding')
      const f = repo.require('risk_assessment_findings', finding_id)
      const a = repo.require('risk_assessments', f.assessment_id)
      if (['approved', 'superseded'].includes(a.status)) throw new ToolError('conflict', 'This assessment has been signed off; start a new assessment to change it')
      if (status === 'rejected' && !note?.trim()) throw new ToolError('validation', 'Add a note explaining why the finding is rejected')
      const updated = repo.update('risk_assessment_findings', finding_id, { status, broker_note: note?.trim() || f.broker_note })
      refreshAssessmentApproval(repo, a.id)
      return updated
    },
    auditEntity: (r) => ({ table: 'risk_assessment_findings', id: r.id }),
  }),

  defineTool({
    name: 'risk.investigate_underinsurance',
    description: 'Compare declared asset values with sums insured on file, group by group, using recorded values only.',
    allow: ['agent', ...STAFF],
    sideEffect: false,
    input: z.object({ profile_id: z.uuid() }),
    run: ({ repo }, { profile_id }) => {
      const s = profileSnapshot(repo, profile_id)
      const policies = repo.list('insurance_policies', (p) => p.business_profile_id === profile_id)
      const sections = repo.list('policy_sections', (x) => x.business_profile_id === profile_id)
      return { policies: policies.length, sections: sections.length, findings: compareValuations(s.assets, policies, sections) }
    },
  }),

  defineTool({
    name: 'risk.investigate_exposure',
    description: 'Gather the evidence for one exposure: linked records, impact paths, coverage evidence and missing information.',
    allow: ['agent', ...STAFF],
    sideEffect: false,
    input: z.object({ exposure_id: z.uuid() }),
    run: ({ repo }, { exposure_id }) => {
      const e = repo.require('risk_exposures', exposure_id)
      const edges = repo.list('risk_dependencies', (d) => d.risk_profile_id === e.risk_profile_id)
      const linked = edges.filter((d) => d.relation === 'exposes' && d.to_id === e.id && d.from_table !== 'business_profiles')
      const start = linked.find((d) => d.from_table === 'commercial_assets') ?? linked.find((d) => d.from_table === 'business_activities') ?? linked[0]
      const impact = start ? traceImpact(repo, e.risk_profile_id, { table: start.from_table, id: start.from_id }) : null
      const policies = repo.list('insurance_policies', (p) => p.business_profile_id === e.business_profile_id)
      const sections = repo.list('policy_sections', (x) => x.business_profile_id === e.business_profile_id)
      return {
        exposure: e,
        linked: linked.map((d) => nodeKey(d.from_table, d.from_id)),
        impact,
        coverage: matchCoverage(e, policies, sections),
        missing: [...e.outstanding_questions, ...(impact?.missing ?? [])],
      }
    },
  }),
] as unknown as ToolDef[]

export { PRIORITY_AREA_COUNT }
