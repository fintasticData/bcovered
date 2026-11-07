import type {
  CoverageFinding,
  FieldSource,
  OperationalRelation,
  PolicySection,
  RiskDependency,
  RiskExposure,
  TwinTable,
} from '../../db/commercialSchema'
import type { Repo } from '../../db/store'
import { coverLabel } from './coverClasses'
import { compactRand } from './format'

export const OPERATIONAL: OperationalRelation[] = ['supports', 'stores', 'feeds', 'supplies', 'serves']

/** "fails" or "fail", agreeing with the record's name ("the freezer fails", "blast freezers and cold rooms fail"). */
export const failVerb = (label: string) => (/\band\b|[^s]s$/i.test(label.trim()) ? 'fail' : 'fails')
export const nodeKey = (table: string, id: string) => `${table}:${id}`

export interface NodeRef {
  table: TwinTable
  id: string
}

export interface NodeSummary extends NodeRef {
  key: string
  label: string
  kind: string
  source: FieldSource | null
}

export const RELATION_LABEL: Record<RiskDependency['relation'], string> = {
  owns: 'owns',
  operates_at: 'operates',
  located_at: 'located at',
  generates_revenue_at: 'earns revenue from',
  depends_on: 'depends on',
  exposes: 'exposes',
  supports: 'supports',
  stores: 'stores',
  feeds: 'feeds',
  supplies: 'supplies',
  serves: 'serves',
}

/** Name, type and provenance of any Twin record. */
export function describeNode(repo: Repo, table: TwinTable, id: string): NodeSummary | null {
  const base = { table, id, key: nodeKey(table, id) }
  switch (table) {
    case 'business_profiles': {
      const p = repo.get('business_profiles', id)
      return p ? { ...base, label: p.trading_name ?? p.registered_name, kind: 'Business', source: p.field_sources.registered_name ?? 'declared' } : null
    }
    case 'business_legal_entities': {
      const e = repo.get('business_legal_entities', id)
      return e ? { ...base, label: e.legal_name, kind: 'Legal entity', source: e.source } : null
    }
    case 'business_locations': {
      const l = repo.get('business_locations', id)
      return l ? { ...base, label: l.name, kind: 'Location', source: l.source } : null
    }
    case 'business_activities': {
      const a = repo.get('business_activities', id)
      const kind = { operation: 'Operation', revenue_stream: 'Revenue stream', supplier_dependency: 'Supplier dependency', customer_dependency: 'Customer dependency' }[a?.kind ?? 'operation']
      return a ? { ...base, label: a.name, kind, source: a.source } : null
    }
    case 'commercial_assets': {
      const a = repo.get('commercial_assets', id)
      return a ? { ...base, label: a.description, kind: a.asset_class === 'stock' ? 'Stock' : 'Asset', source: a.source } : null
    }
    case 'risk_exposures': {
      const e = repo.get('risk_exposures', id)
      return e ? { ...base, label: e.title, kind: 'Potential exposure', source: null } : null
    }
  }
}

export interface TracePath {
  keys: string[]
  labels: string[]
  relations: string[]
  /** True when any link on the path was inferred by an agent and not yet confirmed. */
  inferred: boolean
}

export interface TraceResult {
  start: NodeSummary
  direction: 'downstream' | 'upstream'
  nodes: NodeSummary[]
  paths: TracePath[]
  edge_ids: string[]
}

/**
 * Follows explicit operational links only. Downstream answers "what depends on this?", upstream "what does this depend on?".
 * Nothing is inferred here: only recorded links, each carrying its own provenance.
 */
export function traceOperational(repo: Repo, edges: RiskDependency[], start: NodeRef, direction: 'downstream' | 'upstream'): TraceResult {
  const first = describeNode(repo, start.table, start.id)
  if (!first) throw new Error('Record not found in this Twin')
  const ops = edges.filter((e) => (OPERATIONAL as string[]).includes(e.relation))
  const next = (key: string) =>
    ops
      .filter((e) => (direction === 'downstream' ? nodeKey(e.from_table, e.from_id) : nodeKey(e.to_table, e.to_id)) === key)
      .map((e) => ({ edge: e, to: direction === 'downstream' ? { table: e.to_table, id: e.to_id } : { table: e.from_table, id: e.from_id } }))

  const seen = new Map<string, NodeSummary>([[first.key, first]])
  const edgeIds = new Set<string>()
  const paths: TracePath[] = []
  const walk = (key: string, path: TracePath) => {
    const out = next(key).filter((n) => !path.keys.includes(nodeKey(n.to.table, n.to.id)))
    if (!out.length) {
      if (path.keys.length > 1) paths.push(path)
      return
    }
    out.forEach(({ edge, to }) => {
      const node = describeNode(repo, to.table, to.id)
      if (!node) return
      seen.set(node.key, node)
      edgeIds.add(edge.id)
      walk(node.key, {
        keys: [...path.keys, node.key],
        labels: [...path.labels, node.label],
        relations: [...path.relations, RELATION_LABEL[edge.relation]],
        inferred: path.inferred || edge.source === 'inferred',
      })
    })
  }
  walk(first.key, { keys: [first.key], labels: [first.label], relations: [], inferred: false })
  return { start: first, direction, nodes: [...seen.values()], paths, edge_ids: [...edgeIds] }
}

export interface KnownValue {
  label: string
  value: number
  basis: string
  source: FieldSource
}

export interface ImpactEvidence {
  exposure_id: string
  exposure_title: string
  coverage_status: RiskExposure['coverage_status']
  sections: Array<Pick<PolicySection, 'id' | 'section_name' | 'cover_class' | 'sum_insured' | 'limit_of_indemnity' | 'page_ref' | 'source'> & { insurer: string | null }>
  findings: Array<Pick<CoverageFinding, 'id' | 'status' | 'rationale' | 'page_ref' | 'reviewed_by'>>
}

export interface ImpactReport extends TraceResult {
  risk_profile_id: string
  affected: {
    operations: NodeSummary[]
    stock: NodeSummary[]
    assets: NodeSummary[]
    revenue: Array<NodeSummary & { share_of_revenue: number | null }>
    customers: NodeSummary[]
  }
  exposures: Array<Pick<RiskExposure, 'id' | 'title' | 'priority' | 'coverage_status' | 'category'>>
  evidence: ImpactEvidence[]
  known_values: KnownValue[]
  assumptions: string[]
  missing: string[]
  summary: string
}

/** "What happens if X fails?" from recorded links and values only. It never produces a loss estimate. */
export function traceImpact(repo: Repo, riskProfileId: string, start: NodeRef): ImpactReport {
  const rp = repo.require('business_risk_profiles', riskProfileId)
  const edges = repo.list('risk_dependencies', (d) => d.risk_profile_id === rp.id)
  const trace = traceOperational(repo, edges, start, 'downstream')
  const profile = repo.require('business_profiles', rp.business_profile_id)
  const inTrace = (t: TwinTable) => trace.nodes.filter((n) => n.table === t)

  const activities = inTrace('business_activities').map((n) => ({ n, a: repo.require('business_activities', n.id) }))
  const assets = inTrace('commercial_assets').map((n) => ({ n, a: repo.require('commercial_assets', n.id) }))
  const affected = {
    operations: activities.filter((x) => x.a.kind === 'operation' && x.n.key !== trace.start.key).map((x) => x.n),
    stock: assets.filter((x) => x.a.asset_class === 'stock').map((x) => x.n),
    assets: assets.filter((x) => x.a.asset_class !== 'stock' && x.n.key !== trace.start.key).map((x) => x.n),
    revenue: activities.filter((x) => x.a.kind === 'revenue_stream').map((x) => ({ ...x.n, share_of_revenue: x.a.share_of_revenue })),
    customers: activities.filter((x) => x.a.kind === 'customer_dependency').map((x) => x.n),
  }

  const keys = new Set(trace.nodes.map((n) => n.key))
  const exposureIds = new Set(
    edges.filter((e) => e.relation === 'exposes' && keys.has(nodeKey(e.from_table, e.from_id))).map((e) => e.to_id),
  )
  const exposures = repo.list('risk_exposures', (e) => exposureIds.has(e.id))
  const policies = repo.list('insurance_policies', (p) => p.business_profile_id === profile.id)
  const sections = repo.list('policy_sections', (s) => s.business_profile_id === profile.id)
  const evidence: ImpactEvidence[] = exposures.map((e) => ({
    exposure_id: e.id,
    exposure_title: e.title,
    coverage_status: e.coverage_status,
    sections: sections
      .filter((s) => e.potential_classes.includes(s.cover_class))
      .map((s) => ({ ...s, insurer: policies.find((p) => p.id === s.policy_id)?.insurer ?? null })),
    findings: repo.list('coverage_findings', (f) => f.exposure_id === e.id),
  }))

  const known_values: KnownValue[] = []
  const assumptions: string[] = []
  const missing: string[] = []
  ;[trace.start, ...affected.assets, ...affected.stock].forEach((n) => {
    if (n.table !== 'commercial_assets') return
    const a = repo.require('commercial_assets', n.id)
    if (a.declared_value === null) missing.push(`No value recorded for ${a.description.toLowerCase()}`)
    else known_values.push({ label: `${a.description} (${a.asset_class === 'stock' ? 'stock at risk' : 'asset value'})`, value: a.declared_value, basis: a.value_basis, source: a.source })
    if (a.declared_value !== null && a.value_basis === 'unknown') assumptions.push(`${a.description} has no recorded valuation basis, so it may not reflect replacement cost`)
    else if (a.declared_value !== null && a.value_basis !== 'replacement') assumptions.push(`${a.description} is recorded at ${a.value_basis} value, which is not a replacement cost`)
  })
  const turnover = profile.annual_turnover
  affected.revenue.forEach((r) => {
    if (r.share_of_revenue === null) missing.push(`Share of revenue for ${r.label.toLowerCase()} is not recorded`)
    else if (turnover) {
      known_values.push({
        label: `${r.label}: about ${Math.round(r.share_of_revenue * 100)}% of declared turnover`,
        value: Math.round(turnover * r.share_of_revenue),
        basis: 'declared share × declared turnover',
        source: profile.field_sources.annual_turnover ?? 'declared',
      })
    }
  })
  if (affected.revenue.length && turnover) {
    assumptions.push('Revenue figures show how much annual turnover depends on this path. They are not a loss estimate: the actual loss depends on how long the failure lasts, workarounds and insured gross profit.')
  }
  if (!turnover && affected.revenue.length) missing.push('Annual turnover is not recorded')

  if (trace.start.table === 'commercial_assets') {
    const a = repo.require('commercial_assets', trace.start.id)
    const loc = a.location_id ? repo.get('business_locations', a.location_id) : undefined
    if (['machinery', 'electronic_equipment'].includes(a.asset_class)) {
      if (loc?.backup_power === null || loc?.backup_power === undefined) missing.push('Backup power at this site is not stated')
      missing.push(`No redundancy, maintenance contract or replacement lead time recorded for ${a.description.toLowerCase()}`)
    }
  }
  if (!policies.length) missing.push('No policy schedule has been analysed, so no coverage evidence is available')
  else {
    evidence.filter((e) => !e.sections.length).forEach((e) => missing.push(`No policy section found for “${e.exposure_title}” in the documents analysed`))
  }
  if (trace.paths.some((p) => p.inferred)) assumptions.push('Some links on these paths were inferred by an agent and still need broker confirmation.')
  if (!trace.paths.length) missing.push('No operational dependencies are recorded for this record, so its impact cannot be traced')

  const parts = [
    affected.operations.length && `${affected.operations.length} operation${affected.operations.length === 1 ? '' : 's'} (${affected.operations.map((o) => o.label.toLowerCase()).join(', ')})`,
    affected.stock.length && `stock held in it`,
    affected.revenue.length && `${affected.revenue.length} revenue stream${affected.revenue.length === 1 ? '' : 's'}`,
    affected.customers.length && `${affected.customers.map((c) => c.label.toLowerCase()).join(', ')}`,
  ].filter(Boolean)
  const summary = trace.paths.length
    ? `If ${trace.start.label.toLowerCase()} ${failVerb(trace.start.label)}, the recorded links reach ${parts.join(', ')}. ${exposures.length} potential exposure${exposures.length === 1 ? '' : 's'} sit on these records; ${
        evidence.filter((e) => e.sections.length).length
      } have a policy section in the documents analysed.`
    : `No operational dependencies are recorded for ${trace.start.label.toLowerCase()}, so its impact cannot be traced yet.`

  return { ...trace, risk_profile_id: rp.id, affected, exposures, evidence, known_values, assumptions: [...new Set(assumptions)], missing: [...new Set(missing)], summary }
}

/** Plain-language list of known values, for replies and reports. */
export const describeKnownValues = (values: KnownValue[]) => values.map((v) => `${v.label}: ${compactRand(v.value)} (${v.basis}, ${v.source})`)

export const sectionLabel = (s: Pick<PolicySection, 'section_name' | 'cover_class'>) => `${s.section_name} (${coverLabel(s.cover_class)})`
