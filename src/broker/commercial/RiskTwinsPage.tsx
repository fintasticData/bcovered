import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDownUp, Database, FileUp, Loader2, MessagesSquare, Network, Plus, Search, Sparkles, X } from 'lucide-react'
import type { AssessmentStatus, BusinessRow, RiskTwinRow } from '@/api/client'
import { useLoadDemoBusinesses, useRiskTwinPortfolio } from '@/api/hooks'
import { BuildTwinButton } from '@/components/commercial/BuildTwinButton'
import { COVERAGE_LABEL } from '@/components/commercial/badges'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn, formatDate } from '@/lib/utils'
import type { CoverageStatus, RiskPriority } from '@/server/db/commercialSchema'
import { ErrorState, LoadingState, PageHeader } from '../PageHeader'
import { lensPath } from '../russ/lenses'

const BAR: Record<CoverageStatus, string> = {
  awaiting_broker_review: 'bg-amber-400',
  unknown: 'bg-navy-300',
  potentially_covered: 'bg-sky-400',
  confirmed_covered: 'bg-emerald-500',
  confirmed_excluded: 'bg-red-500',
}
const COVERAGE_ORDER = Object.keys(BAR) as CoverageStatus[]
const PRIORITY_BAR: Record<RiskPriority, string> = { high: 'bg-red-500', medium: 'bg-amber-400', low: 'bg-navy-300' }

const ASSESSMENT: Record<AssessmentStatus, { label: string; tone: 'success' | 'warning' | 'neutral' | 'info' }> = {
  signed_off: { label: 'Signed off', tone: 'success' },
  awaiting_review: { label: 'Awaiting sign-off', tone: 'warning' },
  in_progress: { label: 'Assessment in progress', tone: 'info' },
  screened: { label: 'Exposures screened', tone: 'neutral' },
  not_assessed: { label: 'Not assessed', tone: 'neutral' },
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const workspace = (prompt: string) => lensPath('commercial', prompt)
const nameOf = (r: BusinessRow) => r.profile.trading_name ?? r.profile.registered_name
const openTasks = (r: BusinessRow) => r.open_broker_tasks + r.open_customer_tasks
const NotRecorded = () => <span className="text-navy-500">Not recorded</span>

type YesNo = 'any' | 'yes' | 'no'
interface Filters {
  q: string
  industry: string
  broker: string
  assessment: '' | AssessmentStatus
  gaps: YesNo
  actions: YesNo
  renewal: string
}
const NO_FILTERS: Filters = { q: '', industry: '', broker: '', assessment: '', gaps: 'any', actions: 'any', renewal: '' }

const yesNo = (want: YesNo, has: boolean) => want === 'any' || (want === 'yes') === has

export default function RiskTwinsPage() {
  const { data, isLoading, error } = useRiskTwinPortfolio()
  const loadDemo = useLoadDemoBusinesses()
  const [discover, setDiscover] = useState(false)
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)

  const twins = useMemo(() => data?.twins ?? [], [data])
  const withoutTwin = data?.without_twin ?? []
  const all: BusinessRow[] = useMemo(() => [...twins, ...withoutTwin], [twins, withoutTwin])

  const options = useMemo(() => {
    const uniq = (xs: Array<string | null>) => [...new Set(xs.filter((x): x is string => Boolean(x)))].sort()
    return {
      industries: uniq(twins.map((r) => r.industry_name)),
      brokers: uniq(twins.map((r) => r.assigned_broker)),
      months: MONTHS.filter((m) => twins.some((r) => r.renewal_month?.toLowerCase() === m.toLowerCase())),
    }
  }, [twins])

  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase()
    return twins.filter(
      (r) =>
        (!q || [r.profile.registered_name, r.profile.trading_name ?? '', r.industry_name].some((v) => v.toLowerCase().includes(q))) &&
        (!filters.industry || r.industry_name === filters.industry) &&
        (!filters.broker || r.assigned_broker === filters.broker) &&
        (!filters.assessment || r.assessment_status === filters.assessment) &&
        yesNo(filters.gaps, r.coverage_gap_count > 0) &&
        yesNo(filters.actions, openTasks(r) > 0) &&
        (!filters.renewal || r.renewal_month?.toLowerCase() === filters.renewal.toLowerCase()),
    )
  }, [twins, filters])

  const filtering = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS)

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6">
      <PageHeader
        title="Business Risk Twins"
        description="Understand, assess and monitor the risks across your commercial client portfolio."
        actions={
          <>
            <Button variant="accent" size="sm" asChild>
              <Link to={workspace('Create a Risk Twin for ')}>
                <Plus /> Create Risk Twin
              </Link>
            </Button>
            <Button variant="outline" size="sm" onClick={() => setDiscover((d) => !d)} aria-expanded={discover} aria-controls="discover-panel">
              <Search /> Discover existing business
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to={workspace('Which Risk Twins need attention?')}>
                <Sparkles /> Review with AI
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadDemo.mutate()}
              disabled={loadDemo.isPending}
              title="Adds three fictional businesses with fixed records. Loading again adds nothing; Demo Studio reset removes them."
            >
              {loadDemo.isPending ? <Loader2 className="animate-spin" /> : <Database />} Load demo businesses
            </Button>
          </>
        }
      />

      {loadDemo.data && (
        <Notice onClose={() => loadDemo.reset()}>
          {loadDemo.data.inserted
            ? `Added ${loadDemo.data.inserted} synthetic demo business${loadDemo.data.inserted === 1 ? '' : 'es'}; ${loadDemo.data.builds_started} Risk Twin build${loadDemo.data.builds_started === 1 ? '' : 's'} started.`
            : 'The demo businesses are already loaded. Nothing was added.'}
        </Notice>
      )}
      {loadDemo.error && <ErrorState message={loadDemo.error.message} />}

      {discover && <DiscoverPanel rows={all} onClose={() => setDiscover(false)} />}

      {isLoading && <LoadingState />}
      {error && <ErrorState message={error.message} />}

      {data && (
        <div className="space-y-6">
          {twins.length === 0 && <Onboarding />}

          {withoutTwin.length > 0 && <WithoutTwin rows={withoutTwin} />}

          {twins.length > 0 && (
            <section aria-labelledby="portfolio-heading">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <h2 id="portfolio-heading" className="text-sm font-semibold text-navy-900">
                  Portfolio · {filtered.length === twins.length ? `${twins.length} Twin${twins.length === 1 ? '' : 's'}` : `${filtered.length} of ${twins.length} Twins`}
                </h2>
                {filtering && (
                  <Button size="sm" variant="ghost" onClick={() => setFilters(NO_FILTERS)}>
                    <X /> Clear filters
                  </Button>
                )}
              </div>
              <Toolbar filters={filters} onChange={setFilters} options={options} />
              <Tabs defaultValue="cards" className="mt-4">
                <TabsList>
                  <TabsTrigger value="cards">Cards</TabsTrigger>
                  <TabsTrigger value="table">Table</TabsTrigger>
                  <TabsTrigger value="overview">Risk overview</TabsTrigger>
                </TabsList>
                {filtered.length === 0 ? (
                  <p className="panel mt-4 border-dashed p-6 text-center text-sm text-navy-600">No Twins match these filters.</p>
                ) : (
                  <>
                    <TabsContent value="cards" className="mt-4">
                      <CardsView rows={filtered} />
                    </TabsContent>
                    <TabsContent value="table" className="mt-4">
                      <TableView rows={filtered} />
                    </TabsContent>
                    <TabsContent value="overview" className="mt-4">
                      <OverviewView rows={filtered} />
                    </TabsContent>
                  </>
                )}
              </Tabs>
            </section>
          )}
        </div>
      )}
    </div>
  )
}

export function Notice({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="panel mb-4 flex items-start justify-between gap-3 border-brand-500/30 bg-brand-50 p-3 text-sm text-navy-800" role="status">
      <span>{children}</span>
      <button type="button" onClick={onClose} className="cursor-pointer text-navy-500 hover:text-navy-800" aria-label="Dismiss">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

function Onboarding() {
  const ways = [
    {
      icon: MessagesSquare,
      title: 'AI-guided business discovery',
      body: 'Tell the Copilot the business name. If it is new, the Business Discovery Agent interviews you, asking only what the industry template needs.',
      action: (
        <Button size="sm" variant="accent" asChild>
          <Link to={workspace('Create a Risk Twin for ')}>Start with the Copilot</Link>
        </Button>
      ),
    },
    {
      icon: Network,
      title: 'Build from an existing client',
      body: 'Clients with a business profile but no Twin are listed below. Building links their records and identifies potential exposures.',
      action: null,
    },
    {
      icon: FileUp,
      title: 'Import business information and documents',
      body: 'Upload schedules, asset registers and policy documents so the agents can propose Twin updates for your confirmation.',
      action: <Badge tone="neutral">Arrives in Phase 2</Badge>,
    },
  ]
  return (
    <section className="panel p-5" aria-labelledby="onboarding-heading">
      <h2 id="onboarding-heading" className="text-sm font-semibold text-navy-900">
        No Risk Twins yet. Here is how to create one
      </h2>
      <p className="mt-1 text-xs text-navy-600">
        A Risk Twin is a structured model of a business: its entities, locations, operations, assets and dependencies, linked to the potential exposures a broker
        should review. Nothing is created until you ask for it.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        {ways.map((w) => (
          <div key={w.title} className="flex flex-col rounded-xl border border-navy-800/10 bg-mist/60 p-4">
            <w.icon className="h-5 w-5 text-brand-600" />
            <p className="mt-2 text-sm font-semibold text-navy-900">{w.title}</p>
            <p className="mt-1 flex-1 text-xs text-navy-600">{w.body}</p>
            {w.action && <div className="mt-3">{w.action}</div>}
          </div>
        ))}
      </div>
    </section>
  )
}

function WithoutTwin({ rows }: { rows: BusinessRow[] }) {
  return (
    <section className="panel p-5" aria-labelledby="without-twin-heading">
      <h2 id="without-twin-heading" className="text-sm font-semibold text-navy-900">
        Clients without a Risk Twin ({rows.length})
      </h2>
      <p className="mt-1 text-xs text-navy-600">
        These clients already have a business profile. Building a Twin uses their existing records; no submission is drafted and nothing is sent to an insurer.
      </p>
      <ul className="mt-3 divide-y divide-navy-800/5">
        {rows.map((r) => (
          <li key={r.profile.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <Link to={`/broker/commercial/clients/${r.profile.id}`} className="font-medium text-navy-900 hover:text-brand-600">
                {nameOf(r)}
              </Link>
              <p className="text-xs text-navy-600">
                {r.industry_name} · {r.location_count} location{r.location_count === 1 ? '' : 's'} · {r.asset_count} known asset{r.asset_count === 1 ? '' : 's'} · broker{' '}
                {r.assigned_broker ?? 'unassigned'}
              </p>
            </div>
            <div className="flex flex-wrap items-start gap-2">
              <BuildTwinButton profileId={r.profile.id} activeJobId={r.active_job_id} />
              <Button size="sm" variant="ghost" asChild>
                <Link to={workspace(`Create a Risk Twin for ${nameOf(r)}`)}>
                  <Sparkles /> Review with Copilot
                </Link>
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function DiscoverPanel({ rows, onClose }: { rows: BusinessRow[]; onClose: () => void }) {
  const [q, setQ] = useState('')
  const term = q.trim().toLowerCase()
  const hits = term.length < 2 ? [] : rows.filter((r) => [r.profile.registered_name, r.profile.trading_name ?? '', r.profile.registration_number ?? ''].some((v) => v.toLowerCase().includes(term)))
  return (
    <section id="discover-panel" className="panel mb-6 p-5" aria-label="Discover existing business">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-navy-900">Discover an existing business</h2>
        <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close discovery">
          <X />
        </Button>
      </div>
      <label className="field-label mt-2 block" htmlFor="discover-q">
        Registered name, trading name or registration number
      </label>
      <input id="discover-q" className="field mt-1 py-2" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Ubuntu Foods" autoFocus />
      {term.length >= 2 && (
        <ul className="mt-3 divide-y divide-navy-800/5" aria-live="polite">
          {hits.map((r) => (
            <li key={r.profile.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <div className="min-w-0">
                <p className="font-medium text-navy-900">{nameOf(r)}</p>
                <p className="text-xs text-navy-600">
                  {r.profile.registered_name} · {r.industry_name} · {r.twin_version ? `Twin v${r.twin_version}` : 'no Risk Twin yet'}
                </p>
              </div>
              {r.twin_version ? (
                <Button size="sm" variant="outline" asChild>
                  <Link to={`/broker/commercial/risk-twins/${r.profile.id}`}>
                    <Network /> Open Twin
                  </Link>
                </Button>
              ) : (
                <BuildTwinButton profileId={r.profile.id} activeJobId={r.active_job_id} />
              )}
            </li>
          ))}
          {!hits.length && (
            <li className="py-3 text-sm text-navy-600">
              No commercial client matches “{q.trim()}”.{' '}
              <Link to={workspace(`Create a Risk Twin for ${q.trim()}`)} className="font-semibold text-brand-600">
                Create it with the Copilot
              </Link>
            </li>
          )}
        </ul>
      )}
    </section>
  )
}

function Select({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-[11px] font-semibold text-navy-600">
      {label}
      <select className="field py-2 text-sm font-normal" value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
    </label>
  )
}

function Toolbar({
  filters,
  onChange,
  options,
}: {
  filters: Filters
  onChange: (f: Filters) => void
  options: { industries: string[]; brokers: string[]; months: string[] }
}) {
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => onChange({ ...filters, [k]: v })
  return (
    <div className="panel grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-7">
      <label className="flex min-w-0 flex-col gap-1 text-[11px] font-semibold text-navy-600 sm:col-span-2 lg:col-span-1">
        Search
        <input className="field py-2 text-sm font-normal" value={filters.q} onChange={(e) => set('q', e.target.value)} placeholder="Business or industry" />
      </label>
      <Select label="Industry" value={filters.industry} onChange={(v) => set('industry', v)}>
        <option value="">All industries</option>
        {options.industries.map((i) => (
          <option key={i}>{i}</option>
        ))}
      </Select>
      <Select label="Broker" value={filters.broker} onChange={(v) => set('broker', v)}>
        <option value="">All brokers</option>
        {options.brokers.map((b) => (
          <option key={b}>{b}</option>
        ))}
      </Select>
      <Select label="Assessment" value={filters.assessment} onChange={(v) => set('assessment', v as Filters['assessment'])}>
        <option value="">Any status</option>
        {(Object.keys(ASSESSMENT) as AssessmentStatus[]).map((s) => (
          <option key={s} value={s}>
            {ASSESSMENT[s].label}
          </option>
        ))}
      </Select>
      <Select label="Coverage gaps" value={filters.gaps} onChange={(v) => set('gaps', v as YesNo)}>
        <option value="any">Any</option>
        <option value="yes">Has unconfirmed coverage</option>
        <option value="no">None</option>
      </Select>
      <Select label="Outstanding actions" value={filters.actions} onChange={(v) => set('actions', v as YesNo)}>
        <option value="any">Any</option>
        <option value="yes">Has open tasks</option>
        <option value="no">None open</option>
      </Select>
      <Select label="Renewal month" value={filters.renewal} onChange={(v) => set('renewal', v)}>
        <option value="">Any month</option>
        {options.months.map((m) => (
          <option key={m}>{m}</option>
        ))}
      </Select>
    </div>
  )
}

function CoverageBar({ r }: { r: RiskTwinRow }) {
  const present = COVERAGE_ORDER.filter((k) => r.coverage[k])
  return (
    <>
      <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-navy-100" aria-hidden>
        {present.map((k) => (
          <div key={k} className={BAR[k]} style={{ width: `${(r.coverage[k] / Math.max(1, r.exposure_count)) * 100}%` }} />
        ))}
      </div>
      <p className="mt-1.5 text-[11px] text-navy-600">
        {present.length ? present.map((k) => `${r.coverage[k]} ${COVERAGE_LABEL[k].toLowerCase()}`).join(' · ') : 'No exposures identified yet'}
      </p>
    </>
  )
}

function AssessmentBadge({ status }: { status: AssessmentStatus }) {
  const a = ASSESSMENT[status]
  return <Badge tone={a.tone}>{a.label}</Badge>
}

const twinLink = (r: BusinessRow) => `/broker/commercial/risk-twins/${r.profile.id}`

function CardsView({ rows }: { rows: RiskTwinRow[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {rows.map((r) => (
        <Link key={r.risk_profile.id} to={twinLink(r)} className="panel flex flex-col p-5 transition hover:border-brand-500/40">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
                <Network className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="font-semibold leading-snug break-words text-navy-900">{nameOf(r)}</p>
                <p className="truncate text-xs text-navy-600">
                  {r.industry_name} · Twin v{r.risk_profile.version}
                </p>
              </div>
            </div>
            <AssessmentBadge status={r.assessment_status} />
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <Fact label="Locations">{r.location_count}</Fact>
            <Fact label="Known assets">{r.asset_count}</Fact>
            <Fact label="Potential exposures">
              {r.exposure_count} <span className="text-navy-500">({r.high_priority_count} high)</span>
            </Fact>
            <Fact label="Outstanding actions">
              {r.open_broker_tasks} broker · {r.open_customer_tasks} customer
            </Fact>
            <Fact label="Last assessment">{r.last_assessed_at ? formatDate(r.last_assessed_at) : <NotRecorded />}</Fact>
            <Fact label="Assigned broker">{r.assigned_broker ?? <NotRecorded />}</Fact>
            <Fact label="Renewal">{r.renewal_month ?? <NotRecorded />}</Fact>
            <Fact label="Unconfirmed coverage">{r.coverage_gap_count}</Fact>
          </dl>
          <div className="mt-4">
            <p className="text-[11px] font-semibold text-navy-600">Coverage evidence</p>
            <CoverageBar r={r} />
          </div>
        </Link>
      ))}
    </div>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-navy-500">{label}</dt>
      <dd className="truncate font-medium text-navy-900">{children}</dd>
    </div>
  )
}

type SortKey = 'name' | 'exposures' | 'high' | 'gaps' | 'actions' | 'assessed'
const SORTERS: Record<SortKey, (r: RiskTwinRow) => string | number> = {
  name: (r) => nameOf(r).toLowerCase(),
  exposures: (r) => r.exposure_count,
  high: (r) => r.high_priority_count,
  gaps: (r) => r.coverage_gap_count,
  actions: (r) => openTasks(r),
  assessed: (r) => r.last_assessed_at ?? '',
}

function TableView({ rows }: { rows: RiskTwinRow[] }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'high', dir: -1 })
  const sorted = useMemo(() => {
    const f = SORTERS[sort.key]
    return [...rows].sort((a, b) => (f(a) < f(b) ? -1 : f(a) > f(b) ? 1 : 0) * sort.dir)
  }, [rows, sort])
  const Th = ({ k, children }: { k: SortKey; children: ReactNode }) => (
    <th className="px-4 py-3" aria-sort={sort.key === k ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        className="inline-flex cursor-pointer items-center gap-1 uppercase hover:text-navy-800"
        onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? (s.dir === 1 ? -1 : 1) : k === 'name' ? 1 : -1 }))}
      >
        {children} <ArrowDownUp className={cn('h-3 w-3', sort.key === k ? 'text-brand-600' : 'text-navy-300')} />
      </button>
    </th>
  )
  return (
    <div className="panel scroll-area overflow-x-auto">
      <table className="w-full min-w-[1000px] text-sm">
        <thead className="bg-mist text-left text-[11px] font-semibold tracking-wide text-navy-500 uppercase">
          <tr>
            <Th k="name">Business</Th>
            <th className="px-4 py-3">Locations · assets</th>
            <Th k="exposures">Exposures</Th>
            <Th k="high">High</Th>
            <Th k="gaps">Unconfirmed cover</Th>
            <th className="px-4 py-3">Assessment</th>
            <Th k="assessed">Last assessed</Th>
            <Th k="actions">Open actions</Th>
            <th className="px-4 py-3">Broker</th>
            <th className="px-4 py-3">Renewal</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-navy-800/5">
          {sorted.map((r) => (
            <tr key={r.risk_profile.id} className="align-top">
              <td className="px-4 py-3">
                <Link to={twinLink(r)} className="font-medium text-navy-900 hover:text-brand-600">
                  {nameOf(r)}
                </Link>
                <p className="text-[11px] text-navy-500">
                  {r.industry_name} · v{r.risk_profile.version}
                </p>
              </td>
              <td className="px-4 py-3 text-navy-700">
                {r.location_count} · {r.asset_count}
              </td>
              <td className="px-4 py-3 text-navy-700">{r.exposure_count}</td>
              <td className="px-4 py-3 font-medium text-red-700">{r.high_priority_count}</td>
              <td className="px-4 py-3 text-navy-700">{r.coverage_gap_count}</td>
              <td className="px-4 py-3">
                <AssessmentBadge status={r.assessment_status} />
              </td>
              <td className="px-4 py-3 text-xs text-navy-700">{r.last_assessed_at ? formatDate(r.last_assessed_at) : <NotRecorded />}</td>
              <td className="px-4 py-3 text-xs text-navy-700">
                {r.open_broker_tasks} broker · {r.open_customer_tasks} customer
              </td>
              <td className="px-4 py-3 text-xs text-navy-700">{r.assigned_broker ?? <NotRecorded />}</td>
              <td className="px-4 py-3 text-xs text-navy-700">{r.renewal_month ?? <NotRecorded />}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function OverviewView({ rows }: { rows: RiskTwinRow[] }) {
  const total = (f: (r: RiskTwinRow) => number) => rows.reduce((s, r) => s + f(r), 0)
  const priorities: RiskPriority[] = ['high', 'medium', 'low']
  const max = Math.max(1, ...rows.map((r) => r.exposure_count))
  const stats = [
    { label: 'Risk Twins', value: rows.length },
    { label: 'Potential exposures', value: total((r) => r.exposure_count) },
    { label: 'High advisory priority', value: total((r) => r.high_priority_count) },
    { label: 'Unconfirmed coverage', value: total((r) => r.coverage_gap_count) },
    { label: 'Open actions', value: total(openTasks) },
  ]
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className="panel p-4">
            <p className="text-2xl font-semibold text-navy-900">{s.value}</p>
            <p className="text-[11px] text-navy-600">{s.label}</p>
          </div>
        ))}
      </div>
      <section className="panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-navy-900">Exposures by advisory priority</h3>
          <div className="flex gap-3 text-[11px] text-navy-600">
            {priorities.map((p) => (
              <span key={p} className="flex items-center gap-1 capitalize">
                <span className={cn('h-2.5 w-2.5 rounded-sm', PRIORITY_BAR[p])} /> {p}
              </span>
            ))}
          </div>
        </div>
        <ul className="mt-3 space-y-3">
          {[...rows]
            .sort((a, b) => b.high_priority_count - a.high_priority_count || b.exposure_count - a.exposure_count)
            .map((r) => (
              <li key={r.risk_profile.id} className="grid grid-cols-1 gap-1 sm:grid-cols-[minmax(0,14rem)_1fr] sm:items-center sm:gap-4">
                <Link to={twinLink(r)} className="truncate text-sm font-medium text-navy-900 hover:text-brand-600">
                  {nameOf(r)}
                </Link>
                <div>
                  <div className="flex h-3 overflow-hidden rounded-full bg-navy-100" style={{ width: `${(r.exposure_count / max) * 100}%`, minWidth: '2rem' }} aria-hidden>
                    {priorities.map((p) =>
                      r.priority_counts[p] ? <div key={p} className={PRIORITY_BAR[p]} style={{ width: `${(r.priority_counts[p] / Math.max(1, r.exposure_count)) * 100}%` }} /> : null,
                    )}
                  </div>
                  <p className="mt-1 text-[11px] text-navy-600">
                    {priorities.map((p) => `${r.priority_counts[p]} ${p}`).join(' · ')} · {r.coverage_gap_count} with unconfirmed coverage
                  </p>
                </div>
              </li>
            ))}
        </ul>
        <p className="mt-4 text-[11px] text-navy-500">
          Advisory priorities come from the industry template and the facts recorded, with their reasons on each exposure. They are a review order, not an actuarial
          score or probability of loss.
        </p>
      </section>
    </div>
  )
}
