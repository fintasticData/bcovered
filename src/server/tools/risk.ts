import { z } from 'zod'
import type { BusinessDependencyLink, IndustryRiskTemplate, OperationalRelation, RiskDependency, TwinTable } from '../db/commercialSchema'
import type { Repo } from '../db/store'
import { twinSnapshot } from '../domain/commercial/changes'
import { assessExposures, identifyGaps } from '../domain/commercial/exposureRules'
import { FALLBACK_TEMPLATE_KEY } from '../domain/commercial/industryTemplates'
import { ToolError } from '../lib/errors'
import { profileSnapshot } from './business'
import { defineTool, STAFF, type ToolDef } from './registry'
import { createTask } from './task'

const REVIEW_DAYS = 14

export function templateFor(repo: Repo, industryKey: string): IndustryRiskTemplate {
  const tpl =
    repo.find('industry_risk_templates', (t) => t.key === industryKey && t.is_active) ??
    repo.find('industry_risk_templates', (t) => t.key === FALLBACK_TEMPLATE_KEY)
  if (!tpl) throw new ToolError('not_found', `No industry template for ${industryKey}`)
  return tpl
}

function addEdge(
  repo: Repo,
  rp: { id: string; business_profile_id: string },
  from: { table: TwinTable; id: string },
  to: { table: TwinTable; id: string },
  relation: RiskDependency['relation'],
  source: RiskDependency['source'] = 'declared',
  note: string | null = null,
) {
  return repo.insert('risk_dependencies', {
    business_profile_id: rp.business_profile_id,
    risk_profile_id: rp.id,
    from_table: from.table,
    from_id: from.id,
    to_table: to.table,
    to_id: to.id,
    relation,
    note,
    source,
  })
}

const INFERRED_NOTE = 'Inferred from a shared location. Confirm or reject.'

/**
 * Suggests operational links where none are recorded: key assets support operations at the same site, operations feed
 * revenue streams at the same site, single suppliers supply operations. Suggestions stay "inferred" until a broker confirms,
 * and a rejected suggestion is never proposed again.
 */
export function proposeInferredLinks(repo: Repo, profileId: string): BusinessDependencyLink[] {
  const s = profileSnapshot(repo, profileId)
  const links = repo.list('business_dependency_links', (l) => l.business_profile_id === profileId)
  const has = (fromId: string, toId: string) => links.some((l) => l.from_id === fromId && l.to_id === toId)
  const hasFrom = (fromId: string) => links.some((l) => l.from_id === fromId)
  const hasTo = (toId: string, rel: OperationalRelation) => links.some((l) => l.to_id === toId && l.relation === rel && l.status === 'active')
  const ops = s.activities.filter((a) => a.kind === 'operation')
  const streams = s.activities.filter((a) => a.kind === 'revenue_stream')
  const created: BusinessDependencyLink[] = []
  const add = (from: { table: TwinTable; id: string }, to: { table: TwinTable; id: string }, relation: OperationalRelation) => {
    if (has(from.id, to.id)) return
    const row = repo.insert('business_dependency_links', {
      business_profile_id: profileId,
      from_table: from.table,
      from_id: from.id,
      to_table: to.table,
      to_id: to.id,
      relation,
      note: INFERRED_NOTE,
      source: 'inferred',
      status: 'active',
      confirmed_by: null,
    })
    links.push(row)
    created.push(row)
  }
  s.assets
    .filter((a) => ['machinery', 'vehicle', 'electronic_equipment', 'mobile_plant'].includes(a.asset_class) && !hasFrom(a.id))
    .forEach((a) => ops.filter((o) => o.location_id && o.location_id === a.location_id).forEach((o) => add({ table: 'commercial_assets', id: a.id }, { table: 'business_activities', id: o.id }, 'supports')))
  ops
    .filter((o) => !hasFrom(o.id))
    .forEach((o) =>
      streams
        .filter((r) => r.location_id === null || r.location_id === o.location_id)
        .forEach((r) => add({ table: 'business_activities', id: o.id }, { table: 'business_activities', id: r.id }, 'feeds')),
    )
  s.activities
    .filter((a) => a.kind === 'supplier_dependency' && !hasFrom(a.id))
    .forEach((sup) => ops.forEach((o) => add({ table: 'business_activities', id: sup.id }, { table: 'business_activities', id: o.id }, 'supplies')))
  s.activities
    .filter((a) => a.kind === 'customer_dependency' && !hasTo(a.id, 'serves'))
    .forEach((c) => streams.slice(0, 1).forEach((r) => add({ table: 'business_activities', id: r.id }, { table: 'business_activities', id: c.id }, 'serves')))
  return created
}

function recount(repo: Repo, riskProfileId: string) {
  const rp = repo.require('business_risk_profiles', riskProfileId)
  const s = profileSnapshot(repo, rp.business_profile_id)
  const exposures = repo.list('risk_exposures', (e) => e.risk_profile_id === rp.id).length
  return repo.update('business_risk_profiles', rp.id, {
    node_count: 1 + s.legal_entities.length + s.locations.length + s.activities.length + s.assets.length + exposures,
    edge_count: repo.list('risk_dependencies', (d) => d.risk_profile_id === rp.id).length,
  })
}

export const riskTools = [
  defineTool({
    name: 'risk.create_twin',
    description: 'Start a new version of the Business Risk Twin for a profile, superseding the previous version.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({ profile_id: z.uuid() }),
    run: ({ repo, jobId }, { profile_id }) => {
      const profile = repo.require('business_profiles', profile_id)
      const template = templateFor(repo, profile.industry_key)
      const versions = repo.list('business_risk_profiles', (r) => r.business_profile_id === profile_id)
      versions.filter((r) => r.status === 'current').forEach((r) => repo.update('business_risk_profiles', r.id, { status: 'superseded' }))
      return repo.insert('business_risk_profiles', {
        business_profile_id: profile_id,
        version: versions.reduce((m, r) => Math.max(m, r.version), 0) + 1,
        status: 'current',
        template_key: template.key,
        template_version: template.version,
        node_count: 0,
        edge_count: 0,
        summary: null,
        job_id: jobId ?? null,
        snapshot: twinSnapshot(repo, profile_id),
      })
    },
    auditEntity: (r) => ({ table: 'business_risk_profiles', id: r.id }),
  }),

  defineTool({
    name: 'risk.map_dependencies',
    description: 'Link the business, its entities, locations, activities and assets into the Risk Twin graph.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({ risk_profile_id: z.uuid() }),
    run: ({ repo }, { risk_profile_id }) => {
      const rp = repo.require('business_risk_profiles', risk_profile_id)
      if (repo.find('risk_dependencies', (d) => d.risk_profile_id === rp.id && d.relation !== 'exposes')) return recount(repo, rp.id)
      const s = profileSnapshot(repo, rp.business_profile_id)
      const biz = { table: 'business_profiles' as const, id: s.profile.id }
      s.legal_entities.forEach((e) => addEdge(repo, rp, biz, { table: 'business_legal_entities', id: e.id }, 'owns'))
      s.locations.forEach((l) =>
        addEdge(repo, rp, l.legal_entity_id ? { table: 'business_legal_entities', id: l.legal_entity_id } : biz, { table: 'business_locations', id: l.id }, 'owns'),
      )
      s.assets.forEach((a) => addEdge(repo, rp, a.location_id ? { table: 'business_locations', id: a.location_id } : biz, { table: 'commercial_assets', id: a.id }, 'owns'))
      s.activities.forEach((a) => {
        const from = a.location_id ? { table: 'business_locations' as const, id: a.location_id } : biz
        const relation = a.kind === 'operation' ? 'operates_at' : a.kind === 'revenue_stream' ? 'generates_revenue_at' : 'depends_on'
        addEdge(repo, rp, from, { table: 'business_activities', id: a.id }, relation)
      })
      proposeInferredLinks(repo, rp.business_profile_id)
      repo
        .list('business_dependency_links', (l) => l.business_profile_id === rp.business_profile_id && l.status === 'active')
        .forEach((l) => addEdge(repo, rp, { table: l.from_table, id: l.from_id }, { table: l.to_table, id: l.to_id }, l.relation, l.source, l.note))
      return recount(repo, rp.id)
    },
    auditEntity: (r) => ({ table: 'business_risk_profiles', id: r.id }),
  }),

  defineTool({
    name: 'risk.assess_exposures',
    description: 'Identify potential exposures from the industry template and profile facts. Advisory, never a coverage decision.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({ risk_profile_id: z.uuid() }),
    run: ({ repo, jobId }, { risk_profile_id }) => {
      const rp = repo.require('business_risk_profiles', risk_profile_id)
      const prior = repo.list('risk_exposures', (e) => e.risk_profile_id === rp.id)
      const priorAssessment = repo.find('risk_assessments', (a) => a.risk_profile_id === rp.id)
      if (prior.length && priorAssessment) return { assessment: priorAssessment, exposures: prior }

      const s = profileSnapshot(repo, rp.business_profile_id)
      const template = templateFor(repo, s.profile.industry_key)
      const review = new Date(Date.now() + REVIEW_DAYS * 86_400_000).toISOString()
      const exposures = assessExposures(s, template).map(({ links, ...spec }) => {
        const row = repo.insert('risk_exposures', {
          ...spec,
          business_profile_id: s.profile.id,
          risk_profile_id: rp.id,
          assigned_broker_id: s.profile.assigned_broker_id,
          review_date: review,
          priority_override: null,
          override_reason: null,
          overridden_by: null,
          overridden_at: null,
        })
        const targets = links.length ? links : [{ table: 'business_profiles' as const, id: s.profile.id }]
        targets.forEach((l) => addEdge(repo, rp, l, { table: 'risk_exposures', id: row.id }, 'exposes'))
        return row
      })
      const high = exposures.filter((e) => e.priority === 'high')
      const assessment = repo.insert('risk_assessments', {
        business_profile_id: s.profile.id,
        risk_profile_id: rp.id,
        job_id: jobId ?? null,
        template_key: template.key,
        template_version: template.version,
        exposure_count: exposures.length,
        high_priority_count: high.length,
        findings: exposures.map((e) => `${e.priority.toUpperCase()}: ${e.title}`),
        gaps: [],
        assessment_type: 'initial',
        status: 'draft',
        scope: ['Exposure screening from the industry template'],
        assessor_id: null,
        approval_id: null,
        completeness: [],
        summary: `Exposure screening: ${exposures.length} potential exposures, ${high.length} high advisory priority.`,
        next_review_date: null,
      })
      recount(repo, rp.id)
      repo.update('business_risk_profiles', rp.id, {
        summary: `${exposures.length} potential exposures from the ${template.name} template (v${template.version}); ${high.length} high advisory priority.`,
        snapshot: rp.snapshot ? { ...rp.snapshot, exposure_count: exposures.length } : null,
      })
      if (s.profile.status === 'discovery') repo.update('business_profiles', s.profile.id, { status: 'in_review' })
      return { assessment, exposures }
    },
    auditEntity: (r) => ({ table: 'risk_assessments', id: r.assessment.id }),
  }),

  defineTool({
    name: 'risk.identify_gaps',
    description: 'List missing information and create document requests and broker review tasks.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({ risk_profile_id: z.uuid() }),
    run: ({ repo, actor, jobId }, { risk_profile_id }) => {
      const rp = repo.require('business_risk_profiles', risk_profile_id)
      const s = profileSnapshot(repo, rp.business_profile_id)
      const template = templateFor(repo, s.profile.industry_key)
      const exposures = repo.list('risk_exposures', (e) => e.risk_profile_id === rp.id)
      const gaps = identifyGaps(s, exposures, template)
      const by = actor.type === 'agent' ? actor.id : null
      const base = { customer_id: s.profile.customer_id, subject_table: 'business_profiles', subject_id: s.profile.id }
      const tasks = [
        ...gaps.missing.map((m) =>
          createTask(repo, by, jobId ?? null, {
            ...base,
            kind: 'information_request',
            audience: 'customer',
            title: `Provide: ${m}`,
            detail: 'Missing from the business profile.',
            due_in_days: 7,
            dedupe_key: `${s.profile.id}:info:${m}`,
          }),
        ),
        ...gaps.documents.map((d) =>
          createTask(repo, by, jobId ?? null, {
            ...base,
            kind: 'document_request',
            audience: 'customer',
            title: d.title,
            detail: d.detail,
            due_in_days: 10,
            dedupe_key: `${s.profile.id}:doc:${d.key}`,
          }),
        ),
        ...gaps.broker_tasks.map((t) =>
          createTask(repo, by, jobId ?? null, {
            ...base,
            kind: 'broker_review',
            audience: 'broker',
            title: t.title,
            detail: t.detail,
            assigned_to: s.profile.assigned_broker_id,
            due_in_days: 3,
            dedupe_key: `${s.profile.id}:broker:${t.key}`,
          }),
        ),
      ]
      const assessment = repo.find('risk_assessments', (a) => a.risk_profile_id === rp.id)
      if (assessment) repo.update('risk_assessments', assessment.id, { gaps: [...gaps.missing, ...gaps.documents.map((d) => d.title)] })
      return { gaps, tasks: tasks.map((t) => t.task), created: tasks.filter((t) => t.created).length }
    },
    auditEntity: (r) => (r.tasks[0] ? { table: 'tasks', id: r.tasks[0].id } : null),
  }),
] as unknown as ToolDef[]
