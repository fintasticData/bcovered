import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardList, GitBranch, Loader2, MessageSquareQuote, ShieldQuestion, Sparkles, X, Zap } from 'lucide-react'
import type { ImpactReport, TraceResult, TwinWorkspace } from '@/api/client'
import { useCheckCoverage, useCreateTwinTask, useDecideDependency, useStartAssessment, useTwinDependencies, useTwinImpact, useTwinNode } from '@/api/hooks'
import { AssessmentPriorityBadge, CoverageBadge, ProvenanceBadge } from '@/components/commercial/badges'
import { RiskTwinMap, twinKey, type TwinNode } from '@/components/commercial/RiskTwinMap'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { formatDateTime } from '@/lib/utils'
import type { AssessmentPriority, CoverageStatus, FieldSource, TwinTable } from '@/server/db/commercialSchema'
import { compactRand } from '@/server/domain/commercial/format'
import { failVerb } from '@/server/domain/commercial/graph'
import { Card, InlineError, type TwinTab } from './shared'

const PASSIVE: Record<string, string> = {
  owns: 'owned by',
  operates: 'operated at',
  'located at': 'location of',
  'earns revenue from': 'earned at',
  'depends on': 'depended on by',
  exposes: 'arises from',
  supports: 'supported by',
  stores: 'stored in',
  feeds: 'fed by',
  supplies: 'supplied by',
  serves: 'served by',
}

export type GraphMode = { kind: 'impact' | 'dependencies'; table: TwinTable; id: string } | null

interface Props {
  w: TwinWorkspace
  selected: string | null
  onSelect: (key: string | null) => void
  mode: GraphMode
  onMode: (m: GraphMode) => void
  onAsk: (prompt: string) => void
  onTab: (t: TwinTab) => void
}

export function GraphTab({ w, selected, onSelect, mode, onMode, onAsk, onTab }: Props) {
  const rp = w.business.risk_profile
  const ref = mode && rp ? { risk_profile_id: rp.id, table: mode.table, id: mode.id } : null
  const { data: impact, error: impactError } = useTwinImpact(mode?.kind === 'impact' ? ref : null)
  const { data: deps, error: depsError } = useTwinDependencies(mode?.kind === 'dependencies' ? ref : null)
  if (!rp) return null
  const traced: TraceResult | undefined = mode?.kind === 'impact' ? impact : deps
  return (
    <div className="space-y-4">
      <Card
        title={`Risk Twin v${rp.version}`}
        description={`${rp.node_count} records · ${rp.edge_count} relationships · ${w.kpis.inferred_links} AI-inferred links awaiting confirmation · built ${formatDateTime(rp.created_at)}`}
      >
        <RiskTwinMap
          data={w.business}
          brokerName={w.business.assigned_broker}
          impact={traced ? { keys: traced.nodes.map((n) => n.key), edge_ids: traced.edge_ids } : null}
          selected={selected}
          onSelect={(n) => onSelect(n?.key ?? null)}
          renderDetail={(n) => <NodePanel w={w} node={n} onMode={onMode} onAsk={onAsk} onTab={onTab} onClose={() => onSelect(null)} />}
        />
      </Card>
      <InlineError error={impactError ?? depsError} />
      {mode?.kind === 'impact' && impact && <ImpactPanel impact={impact} onClear={() => onMode(null)} />}
      {mode?.kind === 'dependencies' && deps && <DependencyPanel trace={deps} onClear={() => onMode(null)} />}
    </div>
  )
}

function NodePanel({ w, node, onMode, onAsk, onTab, onClose }: { w: TwinWorkspace; node: TwinNode; onMode: (m: GraphMode) => void; onAsk: (p: string) => void; onTab: (t: TwinTab) => void; onClose: () => void }) {
  const rp = w.business.risk_profile!
  const { data, error } = useTwinNode({ risk_profile_id: rp.id, table: node.table, id: node.id })
  const assess = useStartAssessment()
  const check = useCheckCoverage()
  const task = useCreateTwinTask()
  const decideLink = useDecideDependency()
  const [form, setForm] = useState<null | 'information_request' | 'broker_review'>(null)
  const [title, setTitle] = useState('')
  const name = w.business.profile.trading_name ?? w.business.profile.registered_name
  const linkFor = (otherId: string, out: boolean) => w.links.find((l) => (out ? l.from_id === node.id && l.to_id === otherId : l.to_id === node.id && l.from_id === otherId))

  if (error) return <InlineError error={error} />
  if (!data) return <p className="text-xs text-navy-600">Loading the record…</p>
  const missing = data.facts.filter((f) => f.source === 'missing').map((f) => f.label.toLowerCase())
  const openForm = (kind: 'information_request' | 'broker_review') => {
    setForm(kind)
    setTitle(kind === 'information_request' ? `Provide ${missing.length ? missing.join(', ') : 'details'} for ${node.label.toLowerCase()}` : `Review ${node.label.toLowerCase()}`)
    task.reset()
  }

  return (
    <section className="rounded-xl border border-brand-500/30 bg-white p-4" aria-label={`Details for ${node.label}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">{data.node.kind}</p>
          <h4 className="text-base font-semibold text-navy-900">{node.label}</h4>
          <p className="flex flex-wrap items-center gap-2 text-[11px] text-navy-500">
            {data.node.source && <ProvenanceBadge source={data.node.source} />}
            {data.updated_at && <span>Updated {formatDateTime(data.updated_at)}</span>}
          </p>
        </div>
        <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close details">
          <X />
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="accent"
          disabled={assess.isPending}
          onClick={() =>
            assess.mutate({ profile_id: w.business.profile.id, assessment_type: node.table === 'commercial_assets' ? 'new_asset' : node.table === 'business_locations' ? 'new_location' : 'targeted_specialist', focus: node.label }, { onSuccess: () => onTab('assessment') })
          }
        >
          {assess.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />} Assess risk
        </Button>
        <Button size="sm" variant="outline" onClick={() => onMode({ kind: 'impact', table: node.table, id: node.id })}>
          <Zap /> What if it fails?
        </Button>
        <Button size="sm" variant="outline" onClick={() => onMode({ kind: 'dependencies', table: node.table, id: node.id })}>
          <GitBranch /> Trace dependencies
        </Button>
        <Button size="sm" variant="outline" disabled={check.isPending} onClick={() => check.mutate(w.business.profile.id, { onSuccess: () => onTab('insurance') })}>
          {check.isPending ? <Loader2 className="animate-spin" /> : <ShieldQuestion />} Check insurance
        </Button>
        <Button size="sm" variant="outline" onClick={() => openForm('information_request')}>
          <MessageSquareQuote /> Request information
        </Button>
        <Button size="sm" variant="outline" onClick={() => openForm('broker_review')}>
          <ClipboardList /> Create task
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onAsk(node.table === 'risk_exposures' ? `Investigate ${node.label} at ${name}` : `What happens if the ${node.label.toLowerCase()} ${failVerb(node.label)} at ${name}?`)}>
          <Sparkles /> Review with Copilot
        </Button>
      </div>
      <InlineError error={assess.error ?? check.error} />

      {form && (
        <div className="mt-3 space-y-2 rounded-xl bg-mist/60 p-3">
          <label className="block text-xs">
            <span className="field-label">{form === 'information_request' ? 'Request to the customer' : 'Broker task'}</span>
            <input className="field mt-1 py-2" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="accent"
              disabled={task.isPending || title.trim().length < 3}
              onClick={() =>
                task.mutate({ profile_id: w.business.profile.id, node_id: node.id, kind: form, title: title.trim(), detail: `Raised from the Risk Twin record “${node.label}”.` }, { onSuccess: () => setForm(null) })
              }
            >
              Create
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setForm(null)}>
              Cancel
            </Button>
          </div>
          <InlineError error={task.error} />
        </div>
      )}
      {task.data && !form && <p className="mt-2 text-xs text-emerald-700">{task.data.created ? 'Task created. It appears under Actions.' : 'That task is already open.'}</p>}

      <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {data.facts.map((f) => (
          <div key={f.label}>
            <dt className="text-[11px] text-navy-500">{f.label}</dt>
            <dd className="flex flex-wrap items-center gap-2 font-medium text-navy-900">
              {f.value} {f.source && <ProvenanceBadge source={f.source as FieldSource} />}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <p className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Relationships</p>
          <ul className="mt-1 space-y-1.5">
            {data.relationships
              .filter((r) => r.other.table !== 'risk_exposures')
              .map((r) => {
                const link = linkFor(r.other.id, r.direction === 'out')
                return (
                  <li key={r.edge_id} className="text-xs text-navy-700">
                    <span className="flex flex-wrap items-center gap-1.5">
                      {r.direction === 'out' ? `${r.relation} →` : `← ${PASSIVE[r.relation] ?? `${r.relation} by`}`} <strong className="text-navy-900">{r.other.label}</strong>
                      {r.source === 'inferred' && <ProvenanceBadge source="inferred" />}
                    </span>
                    {link && link.source === 'inferred' && (
                      <span className="mt-1 flex gap-1.5">
                        <Button size="sm" variant="outline" className="h-6 px-2" disabled={decideLink.isPending} onClick={() => decideLink.mutate({ link_id: link.id, decision: 'confirm' })}>
                          Confirm
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 px-2" disabled={decideLink.isPending} onClick={() => decideLink.mutate({ link_id: link.id, decision: 'reject' })}>
                          Reject
                        </Button>
                      </span>
                    )}
                  </li>
                )
              })}
            {!data.relationships.some((r) => r.other.table !== 'risk_exposures') && <li className="text-xs text-navy-500">No relationships recorded.</li>}
          </ul>
          <InlineError error={decideLink.error} />
        </div>
        <div className="space-y-3">
          <div>
            <p className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Related exposures</p>
            <ul className="mt-1 space-y-1">
              {data.exposures.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 text-xs text-navy-800">
                  <span>{e.title}</span>
                  <span className="flex gap-1">
                    <AssessmentPriorityBadge priority={e.priority as AssessmentPriority} />
                    <CoverageBadge status={e.coverage_status as CoverageStatus} />
                  </span>
                </li>
              ))}
              {!data.exposures.length && <li className="text-xs text-navy-500">None linked.</li>}
            </ul>
          </div>
          <div>
            <p className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Relevant policy sections</p>
            <ul className="mt-1 space-y-1 text-xs text-navy-700">
              {data.policy_sections.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-1.5">
                  {s.section_name} · {s.sum_insured !== null ? compactRand(s.sum_insured) : 'no amount'}
                  {s.page_ref ? ` · ${s.page_ref}` : ''} <ProvenanceBadge source={s.source as FieldSource} />
                </li>
              ))}
              {!data.policy_sections.length && <li className="text-navy-500">No policy evidence on file for these exposures.</li>}
            </ul>
          </div>
          {(data.open_tasks.length > 0 || data.investigations.length > 0) && (
            <div>
              <p className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Open work</p>
              <ul className="mt-1 space-y-1 text-xs text-navy-700">
                {data.open_tasks.map((t) => (
                  <li key={t.id}>{t.title}</li>
                ))}
                {data.investigations.map((i) => (
                  <li key={i.job_id}>
                    <Link to={`/broker/jobs/${i.job_id}`} className="font-semibold text-brand-600">
                      Investigation
                    </Link>{' '}
                    <StatusBadge status={i.status} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function ImpactPanel({ impact, onClear }: { impact: ImpactReport; onClear: () => void }) {
  const groups: Array<[string, Array<{ key: string; label: string }>]> = [
    ['Operations', impact.affected.operations],
    ['Stock', impact.affected.stock],
    ['Other assets', impact.affected.assets],
    ['Revenue streams', impact.affected.revenue],
    ['Customers', impact.affected.customers],
  ]
  return (
    <Card
      title={`Impact if ${impact.start.label.toLowerCase()} ${failVerb(impact.start.label)}`}
      description="Traced through recorded operational links only. Paths are highlighted on the graph."
      action={
        <Button size="sm" variant="ghost" onClick={onClear}>
          <X /> Clear
        </Button>
      }
    >
      <p className="text-sm text-navy-800">{impact.summary}</p>
      {impact.paths.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-navy-700">
          {impact.paths.map((p) => (
            <li key={p.keys.join('>')} className="flex flex-wrap items-center gap-1">
              {p.labels.map((l, i) => (
                <span key={`${l}-${i}`} className="flex items-center gap-1">
                  {i > 0 && <span className="text-navy-400">{p.relations[i - 1]} →</span>}
                  <span className="rounded-md bg-amber-50 px-1.5 py-0.5 font-medium text-navy-900">{l}</span>
                </span>
              ))}
              {p.inferred && <ProvenanceBadge source="inferred" />}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <p className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Affected records</p>
          <dl className="mt-1 space-y-1 text-xs">
            {groups
              .filter(([, xs]) => xs.length)
              .map(([k, xs]) => (
                <div key={k}>
                  <dt className="text-navy-500">{k}</dt>
                  <dd className="font-medium text-navy-900">{xs.map((x) => x.label).join(', ')}</dd>
                </div>
              ))}
          </dl>
        </div>
        <div>
          <p className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Known values (not a loss estimate)</p>
          <ul className="mt-1 space-y-1 text-xs text-navy-700">
            {impact.known_values.map((v) => (
              <li key={v.label} className="flex flex-wrap items-center gap-1.5">
                {v.label}: <strong className="text-navy-900">{compactRand(v.value)}</strong> ({v.basis}) <ProvenanceBadge source={v.source} />
              </li>
            ))}
            {!impact.known_values.length && <li className="text-navy-500">No values recorded on these paths.</li>}
          </ul>
        </div>
      </div>
      {impact.evidence.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Exposures and insurance evidence</p>
          <ul className="mt-1 space-y-1.5 text-xs text-navy-700">
            {impact.evidence.map((e) => (
              <li key={e.exposure_id}>
                <span className="flex flex-wrap items-center gap-1.5">
                  <strong className="text-navy-900">{e.exposure_title}</strong> <CoverageBadge status={e.coverage_status} />
                </span>
                {e.sections.length ? (
                  <span className="text-navy-600">
                    {e.sections.map((s) => `${s.insurer ?? ''} ${s.section_name}${s.sum_insured ? ` ${compactRand(s.sum_insured)}` : ''}${s.page_ref ? ` (${s.page_ref})` : ''}`).join('; ')}
                  </span>
                ) : (
                  <span className="text-navy-500">No policy section on file.</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        {impact.missing.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Missing information</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-navy-700">
              {impact.missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        )}
        {impact.assumptions.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Assumptions</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-navy-700">
              {impact.assumptions.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  )
}

function DependencyPanel({ trace, onClear }: { trace: TraceResult; onClear: () => void }) {
  return (
    <Card
      title={`What ${trace.start.label.toLowerCase()} depends on`}
      description="Upstream recorded links, highlighted on the graph."
      action={
        <Button size="sm" variant="ghost" onClick={onClear}>
          <X /> Clear
        </Button>
      }
    >
      {trace.paths.length ? (
        <ul className="space-y-1 text-xs text-navy-700">
          {trace.paths.map((p) => (
            <li key={p.keys.join('<')}>
              {p.labels.join(' ← ')}
              {p.inferred && ' (includes AI-inferred links)'}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-navy-600">No upstream dependencies are recorded for this record.</p>
      )}
    </Card>
  )
}

export const keyOf = twinKey
