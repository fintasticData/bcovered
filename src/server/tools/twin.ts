import { z } from 'zod'
import type { BusinessRiskProfile, RiskTwinChangeEvent, Task, TwinSnapshot, TwinTable } from '../db/commercialSchema'
import type { Repo } from '../db/store'
import { compareSnapshots, twinSnapshot } from '../domain/commercial/changes'
import { describeNode, nodeKey, RELATION_LABEL, traceImpact, traceOperational, type NodeSummary } from '../domain/commercial/graph'
import { ToolError } from '../lib/errors'
import { refreshAssessmentApproval } from './assessment'
import { defineTool, STAFF, type ToolDef } from './registry'
import { createTask } from './task'

const TWIN_TABLES = ['business_profiles', 'business_legal_entities', 'business_locations', 'business_activities', 'commercial_assets', 'risk_exposures'] as const
const OPERATIONAL = ['supports', 'stores', 'feeds', 'supplies', 'serves'] as const
const PRIORITIES = ['critical', 'high', 'medium', 'low', 'unassessed'] as const

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })

export const currentTwinOf = (repo: Repo, profileId: string) =>
  repo.find('business_risk_profiles', (r) => r.business_profile_id === profileId && r.status === 'current') ?? null

export function requireCurrentTwin(repo: Repo, profileId: string): BusinessRiskProfile {
  const rp = currentTwinOf(repo, profileId)
  if (!rp) throw new ToolError('conflict', 'This business has no Risk Twin yet. Build one first.')
  return rp
}

const nodeInput = z.object({ risk_profile_id: z.uuid(), table: z.enum(TWIN_TABLES), id: z.uuid() })

export interface NodeRelationship {
  edge_id: string
  direction: 'out' | 'in'
  relation: string
  other: NodeSummary
  source: string
  note: string | null
}

export interface NodeDetail {
  node: NodeSummary
  risk_profile_id: string
  facts: Array<{ label: string; value: string; source: string | null }>
  updated_at: string | null
  relationships: NodeRelationship[]
  exposures: Array<{ id: string; title: string; priority: string; coverage_status: string }>
  policy_sections: Array<{ id: string; section_name: string; cover_class: string; sum_insured: number | null; page_ref: string | null; source: string }>
  open_tasks: Task[]
  investigations: Array<{ job_id: string; status: string; created_at: string }>
}

export function nodeDetail(repo: Repo, riskProfileId: string, table: TwinTable, id: string): NodeDetail {
  const rp = repo.require('business_risk_profiles', riskProfileId)
  const node = describeNode(repo, table, id)
  if (!node) throw new ToolError('not_found', 'Record not found in this Twin')
  const edges = repo.list('risk_dependencies', (d) => d.risk_profile_id === rp.id)
  const key = nodeKey(table, id)
  const relationships: NodeRelationship[] = edges.flatMap((e) => {
    const out = nodeKey(e.from_table, e.from_id) === key
    const inn = nodeKey(e.to_table, e.to_id) === key
    if (!out && !inn) return []
    const other = out ? describeNode(repo, e.to_table, e.to_id) : describeNode(repo, e.from_table, e.from_id)
    return other ? [{ edge_id: e.id, direction: out ? ('out' as const) : ('in' as const), relation: RELATION_LABEL[e.relation], other, source: e.source, note: e.note }] : []
  })
  const exposureIds = new Set(relationships.filter((r) => r.other.table === 'risk_exposures').map((r) => r.other.id))
  if (table === 'risk_exposures') exposureIds.add(id)
  const exposures = repo.list('risk_exposures', (e) => exposureIds.has(e.id))
  const classes = new Set(exposures.flatMap((e) => e.potential_classes))
  const policy_sections = repo
    .list('policy_sections', (s) => s.business_profile_id === rp.business_profile_id && classes.has(s.cover_class))
    .map((s) => ({ id: s.id, section_name: s.section_name, cover_class: s.cover_class, sum_insured: s.sum_insured ?? s.limit_of_indemnity, page_ref: s.page_ref, source: s.source }))

  const facts: NodeDetail['facts'] = []
  let updated_at: string | null = null
  const money = (v: number | null) => (v === null ? 'Not recorded' : `R${v.toLocaleString('en-ZA')}`)
  if (table === 'commercial_assets') {
    const a = repo.require('commercial_assets', id)
    const loc = a.location_id ? repo.get('business_locations', a.location_id) : undefined
    updated_at = a.updated_at
    facts.push(
      { label: 'Class', value: a.asset_class.replace(/_/g, ' '), source: null },
      { label: 'Quantity', value: String(a.quantity), source: a.source },
      { label: a.value_basis === 'replacement' ? 'Replacement value' : 'Declared value', value: money(a.declared_value), source: a.declared_value === null ? 'missing' : a.source },
      { label: 'Valuation basis', value: a.value_basis, source: a.value_basis === 'unknown' ? 'missing' : a.source },
      { label: 'Location', value: loc?.name ?? 'All sites', source: null },
    )
  } else if (table === 'business_activities') {
    const a = repo.require('business_activities', id)
    facts.push({ label: 'Type', value: a.kind.replace(/_/g, ' '), source: null })
    if (a.share_of_revenue !== null) facts.push({ label: 'Share of revenue', value: `About ${Math.round(a.share_of_revenue * 100)}%`, source: a.source })
    if (a.description) facts.push({ label: 'Note', value: a.description, source: a.source })
  } else if (table === 'business_locations') {
    const l = repo.require('business_locations', id)
    updated_at = l.updated_at
    facts.push(
      { label: 'Occupancy', value: l.occupancy, source: l.source },
      { label: 'Tenure', value: l.ownership, source: l.source },
      { label: 'Construction', value: l.construction ?? 'Not recorded', source: l.construction ? l.source : 'missing' },
      { label: 'Fire protection', value: l.fire_protection.join(', ') || 'None recorded', source: l.fire_protection.length ? l.source : 'missing' },
      { label: 'Security', value: l.security.join(', ') || 'None recorded', source: l.security.length ? l.source : 'missing' },
      { label: 'Backup power', value: l.backup_power === null ? 'Not stated' : l.backup_power ? 'Yes' : 'No', source: l.backup_power === null ? 'missing' : l.source },
    )
  } else if (table === 'risk_exposures') {
    const e = repo.require('risk_exposures', id)
    updated_at = e.updated_at
    facts.push({ label: 'Description', value: e.description, source: null }, { label: 'Business impact', value: e.business_impact, source: null })
  } else if (table === 'business_profiles') {
    const p = repo.require('business_profiles', id)
    updated_at = p.updated_at
    facts.push({ label: 'Registered name', value: p.registered_name, source: p.field_sources.registered_name ?? 'declared' }, { label: 'Turnover', value: money(p.annual_turnover), source: p.field_sources.annual_turnover ?? 'missing' })
  } else {
    const e = repo.require('business_legal_entities', id)
    facts.push({ label: 'Registration number', value: e.registration_number ?? 'Not recorded', source: e.registration_number ? e.source : 'missing' })
  }

  const profile = repo.require('business_profiles', rp.business_profile_id)
  return {
    node,
    risk_profile_id: rp.id,
    facts,
    updated_at,
    relationships,
    exposures: exposures.map((e) => ({ id: e.id, title: e.title, priority: e.priority_override ?? e.priority, coverage_status: e.coverage_status })),
    policy_sections,
    open_tasks: repo.list('tasks', (t) => t.status === 'open' && (t.subject_id === id || (t.subject_id === profile.id && t.dedupe_key?.includes(id) === true))),
    investigations: repo
      .list('jobs', (j) => j.workflow_type === 'risk_investigation' && (j.inputs as { node_id?: string; exposure_id?: string }).node_id === id)
      .map((j) => ({ job_id: j.id, status: j.status, created_at: j.created_at })),
  }
}

export interface ChangeReport {
  baseline: { risk_profile_id: string; version: number; label: string; created_at: string }
  compared_with: 'current records'
  changes: RiskTwinChangeEvent[]
  tasks_created: number
}

/** The baseline for "compare with the last assessment": the latest signed-off assessment, else the current Twin version. */
export function comparisonBaseline(repo: Repo, profileId: string): { rp: BusinessRiskProfile; label: string } | null {
  const assessed = repo
    .list('risk_assessments', (a) => a.business_profile_id === profileId && a.status === 'approved')
    .sort((a, b) => (a.assessment_type === 'annual_renewal' ? -1 : 0) - (b.assessment_type === 'annual_renewal' ? -1 : 0) || b.created_at.localeCompare(a.created_at))[0]
  const rp = assessed ? repo.get('business_risk_profiles', assessed.risk_profile_id) : currentTwinOf(repo, profileId)
  if (!rp?.snapshot) return null
  return {
    rp,
    label: assessed
      ? `${assessed.assessment_type.replace(/_/g, ' ')} assessment signed off ${shortDate(assessed.updated_at)}`
      : `Risk Twin v${rp.version} built ${shortDate(rp.created_at)}`,
  }
}

export const twinTools = [
  defineTool({
    name: 'risk.get_node',
    description: 'Get one Risk Twin record with its relationships, exposures, policy evidence, open tasks and investigations.',
    allow: ['agent', ...STAFF],
    sideEffect: false,
    input: nodeInput,
    run: ({ repo }, { risk_profile_id, table, id }) => nodeDetail(repo, risk_profile_id, table, id),
  }),

  defineTool({
    name: 'risk.get_relationships',
    description: 'List the relationships of one Risk Twin record, with the provenance of each link.',
    allow: ['agent', ...STAFF],
    sideEffect: false,
    input: nodeInput,
    run: ({ repo }, { risk_profile_id, table, id }) => nodeDetail(repo, risk_profile_id, table, id).relationships,
  }),

  defineTool({
    name: 'risk.trace_dependencies',
    description: 'Follow recorded operational links upstream (what this depends on) or downstream (what depends on this).',
    allow: ['agent', ...STAFF],
    sideEffect: false,
    input: nodeInput.extend({ direction: z.enum(['upstream', 'downstream']) }),
    run: ({ repo }, { risk_profile_id, table, id, direction }) =>
      traceOperational(
        repo,
        repo.list('risk_dependencies', (d) => d.risk_profile_id === risk_profile_id),
        { table, id },
        direction,
      ),
  }),

  defineTool({
    name: 'risk.trace_impact',
    description: 'What happens if this record fails: affected operations, stock, revenue and exposures, coverage evidence and missing information, from recorded links and values only.',
    allow: ['agent', ...STAFF],
    sideEffect: false,
    input: nodeInput,
    run: ({ repo }, { risk_profile_id, table, id }) => traceImpact(repo, risk_profile_id, { table, id }),
  }),

  defineTool({
    name: 'risk.link_dependency',
    description: 'Record an operational dependency between two business records. Links from agents stay inferred until a broker confirms them.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({
      profile_id: z.uuid(),
      from_table: z.enum(TWIN_TABLES),
      from_id: z.uuid(),
      to_table: z.enum(TWIN_TABLES),
      to_id: z.uuid(),
      relation: z.enum(OPERATIONAL),
      note: z.string().max(300).nullable().optional(),
    }),
    run: ({ repo, actor }, input) => {
      if (input.from_id === input.to_id) throw new ToolError('validation', 'A record cannot depend on itself')
      ;[
        [input.from_table, input.from_id],
        [input.to_table, input.to_id],
      ].forEach(([t, id]) => {
        if (!describeNode(repo, t as TwinTable, id)) throw new ToolError('not_found', `${t} ${id} not found`)
      })
      const source = actor.type === 'agent' ? ('inferred' as const) : ('declared' as const)
      const existing = repo.find('business_dependency_links', (l) => l.business_profile_id === input.profile_id && l.from_id === input.from_id && l.to_id === input.to_id && l.relation === input.relation)
      const link = existing
        ? repo.update('business_dependency_links', existing.id, { status: 'active', source: existing.source === 'inferred' ? source : existing.source, note: input.note ?? existing.note, confirmed_by: actor.type === 'user' ? actor.id : existing.confirmed_by })
        : repo.insert('business_dependency_links', {
            business_profile_id: input.profile_id,
            from_table: input.from_table,
            from_id: input.from_id,
            to_table: input.to_table,
            to_id: input.to_id,
            relation: input.relation,
            note: input.note ?? null,
            source,
            status: 'active',
            confirmed_by: actor.type === 'user' ? actor.id : null,
          })
      const rp = currentTwinOf(repo, input.profile_id)
      if (rp && !repo.find('risk_dependencies', (d) => d.risk_profile_id === rp.id && d.from_id === link.from_id && d.to_id === link.to_id && d.relation === link.relation)) {
        repo.insert('risk_dependencies', {
          business_profile_id: input.profile_id,
          risk_profile_id: rp.id,
          from_table: link.from_table,
          from_id: link.from_id,
          to_table: link.to_table,
          to_id: link.to_id,
          relation: link.relation,
          note: link.note,
          source: link.source,
        })
      }
      return link
    },
    auditEntity: (r) => ({ table: 'business_dependency_links', id: r.id }),
  }),

  defineTool({
    name: 'risk.confirm_dependency',
    description: 'A broker confirms or rejects an operational link. Rejected links are removed from the current Twin and never re-proposed.',
    allow: STAFF,
    sideEffect: true,
    input: z.object({ link_id: z.uuid(), decision: z.enum(['confirm', 'reject']) }),
    run: ({ repo, actor }, { link_id, decision }) => {
      if (actor.type !== 'user') throw new ToolError('forbidden', 'Only a person can confirm a dependency')
      const link = repo.require('business_dependency_links', link_id)
      const updated = repo.update('business_dependency_links', link_id, {
        status: decision === 'confirm' ? 'active' : 'rejected',
        source: decision === 'confirm' && link.source === 'inferred' ? 'declared' : link.source,
        confirmed_by: actor.id,
        note: decision === 'confirm' && link.note === 'Inferred from a shared location. Confirm or reject.' ? 'Confirmed by broker' : link.note,
      })
      const rp = currentTwinOf(repo, link.business_profile_id)
      if (rp) {
        const edge = repo.find('risk_dependencies', (d) => d.risk_profile_id === rp.id && d.from_id === link.from_id && d.to_id === link.to_id && d.relation === link.relation)
        if (edge && decision === 'confirm') repo.update('risk_dependencies', edge.id, { source: updated.source, note: updated.note })
        if (edge && decision === 'reject') {
          repo.remove('risk_dependencies', edge.id)
          repo.update('business_risk_profiles', rp.id, { edge_count: repo.list('risk_dependencies', (d) => d.risk_profile_id === rp.id).length })
        }
      }
      return updated
    },
    auditEntity: (r) => ({ table: 'business_dependency_links', id: r.id }),
  }),

  defineTool({
    name: 'risk.override_priority',
    description: 'A broker overrides the assessment priority of an exposure, with a recorded reason.',
    allow: STAFF,
    sideEffect: true,
    input: z.object({ exposure_id: z.uuid(), priority: z.enum(PRIORITIES).nullable(), reason: z.string().trim().min(5, 'Give a reason of at least a few words') }),
    run: ({ repo, actor }, { exposure_id, priority, reason }) => {
      if (actor.type !== 'user') throw new ToolError('forbidden', 'Only a person can override a priority')
      const exposure = repo.update('risk_exposures', exposure_id, {
        priority_override: priority,
        override_reason: priority ? reason : null,
        overridden_by: priority ? actor.id : null,
        overridden_at: priority ? new Date().toISOString() : null,
      })
      repo
        .list('risk_assessment_findings', (f) => f.exposure_id === exposure_id)
        .forEach((f) => {
          const a = repo.get('risk_assessments', f.assessment_id)
          if (!a || !['in_progress', 'awaiting_review'].includes(a.status)) return
          if (!priority) return
          repo.update('risk_assessment_findings', f.id, {
            priority,
            status: 'overridden',
            broker_note: reason,
            rationale: [...f.rationale.filter((r) => !r.startsWith('Broker override')), `Broker override to ${priority}: ${reason}.`],
          })
          refreshAssessmentApproval(repo, a.id)
        })
      return exposure
    },
    auditEntity: (r) => ({ table: 'risk_exposures', id: r.id }),
  }),

  defineTool({
    name: 'risk.compare_versions',
    description: 'Compare the business records with the last signed-off assessment (or the current Twin version) and record a structured change report with review tasks.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({ profile_id: z.uuid(), baseline_risk_profile_id: z.uuid().optional() }),
    run: ({ repo, actor, jobId }, { profile_id, baseline_risk_profile_id }): ChangeReport => {
      const base = baseline_risk_profile_id
        ? { rp: repo.require('business_risk_profiles', baseline_risk_profile_id), label: 'Selected Twin version' }
        : comparisonBaseline(repo, profile_id)
      if (!base?.rp.snapshot) throw new ToolError('conflict', 'There is no earlier Twin version or assessment to compare with yet.')
      const profile = repo.require('business_profiles', profile_id)
      const now = twinSnapshot(repo, profile_id)
      const drafts = compareSnapshots(base.rp.snapshot as TwinSnapshot, now)
      const by = actor.type === 'agent' ? actor.id : null
      let created = 0
      const changes = drafts.map((d) => {
        const task = d.task
          ? createTask(repo, by, jobId ?? null, {
              customer_id: profile.customer_id,
              subject_table: 'business_profiles',
              subject_id: profile_id,
              kind: 'broker_review',
              audience: 'broker',
              title: d.task.title,
              detail: `${d.finding} ${d.task.detail}`,
              assigned_to: profile.assigned_broker_id,
              due_in_days: 5,
              dedupe_key: `${profile_id}:change:${d.entity_id ?? d.field}:${JSON.stringify(d.after)}`,
            })
          : null
        if (task?.created) created++
        return repo.insert('risk_twin_change_events', {
          business_profile_id: profile_id,
          from_risk_profile_id: base.rp.id,
          to_risk_profile_id: null,
          entity_table: d.entity_table,
          entity_id: d.entity_id,
          change_type: d.change_type,
          field: d.field,
          label: d.label,
          before: d.before,
          after: d.after,
          finding: d.finding,
          task_id: task?.task.id ?? null,
        })
      })
      return {
        baseline: { risk_profile_id: base.rp.id, version: base.rp.version, label: base.label, created_at: base.rp.created_at },
        compared_with: 'current records',
        changes,
        tasks_created: created,
      }
    },
    auditEntity: (r) => ({ table: 'business_risk_profiles', id: r.baseline.risk_profile_id }),
  }),
] as unknown as ToolDef[]
