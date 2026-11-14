import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Bot, CircleHelp, MessageCircleQuestion, Newspaper, Search, ShieldCheck, Wrench } from 'lucide-react'
import { usePlatform } from '@/api/hooks'
import { LATEST_UPDATE } from '@/data/updates'
import { Badge } from '@/components/ui/badge'
import {
  ACCESS_LEVEL_HINT,
  ACCESS_LEVEL_LABEL,
  ACCESS_MATRIX,
  ACCESS_ROLES,
  CAPABILITIES,
  COPILOT_COMMANDS,
  FAQ,
  GETTING_STARTED,
  GUARDRAILS,
  HELP_SECTIONS,
  LIMITATIONS,
  ROLES,
  ROLE_FLOW,
  STATUSES,
  STATUS_LABEL,
  WALKTHROUGHS,
  type AccessCell,
  type AccessLevel,
  type CapabilityStatus,
} from '@/data/helpGuide'
import { AGENTS } from '@/server/agents/catalog'
import { PLANNED_COMMERCIAL_SCENARIOS, PLANNED_SCENARIOS } from '@/server/demo/scenarios'

const STATUS_TONE: Record<CapabilityStatus, 'success' | 'warning' | 'neutral'> = {
  live: 'success',
  demo_only: 'warning',
  later: 'neutral',
}

const ACCESS_TONE: Record<AccessLevel, 'success' | 'info' | 'warning' | 'accent' | 'neutral'> = {
  full: 'success',
  view: 'info',
  limited: 'warning',
  prepares: 'accent',
  none: 'neutral',
}

const TOOL_GROUPS: Record<string, string> = {
  customer: 'Customers and consent',
  lead: 'Leads',
  quote: 'Quotes and proposals',
  approval: 'Approvals',
  communication: 'Communication',
  job: 'Job controls',
  business: 'Business profiles',
  risk: 'Risk Twin and exposures',
  underwriting: 'Submission packs',
  task: 'Tasks and requests',
}

const matches = (query: string, ...parts: string[]) => !query || parts.join(' ').toLowerCase().includes(query)

export default function HelpPage() {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const { data: platform } = usePlatform()

  const capabilities = CAPABILITIES.filter((c) => matches(q, c.area, c.audience, c.summary, ...c.can))
  const commands = COPILOT_COMMANDS.filter((c) => matches(q, c.workspace, c.command, c.does))
  const faq = FAQ.filter((f) => matches(q, f.q, f.a))

  const toolGroups = useMemo(() => {
    const groups = new Map<string, NonNullable<typeof platform>['tools']>()
    for (const tool of platform?.tools ?? []) {
      const key = tool.name.split('.')[0]
      groups.set(key, [...(groups.get(key) ?? []), tool])
    }
    return [...groups.entries()]
  }, [platform])

  return (
    <div className="bg-mist">
      <div className="container-x py-12">
        <p className="eyebrow mb-1 flex items-center gap-1.5">
          <CircleHelp className="h-3.5 w-3.5" /> Help centre
        </p>
        <h1 className="font-display text-3xl font-bold text-navy-900 sm:text-4xl">System capabilities and help guide</h1>
        <p className="mt-2 max-w-3xl text-sm text-navy-600">
          What InsureFlow AI can do for the BCovered demo brokerage, who can do it, where to find it, and the rules the agents follow. Everything
          here runs on synthetic data in your browser.
        </p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold">
          <Link to="/faq" className="text-brand-600 hover:text-brand-800">FAQ</Link>
          <Link to="/updates" className="text-brand-600 hover:text-brand-800">System updates</Link>
          <Link to="/demo" className="text-brand-600 hover:text-brand-800">Demo Studio</Link>
        </div>

        <label className="mt-6 flex max-w-xl items-center gap-2 rounded-full bg-white px-4 py-2.5 ring-1 ring-navy-800/10 focus-within:ring-brand-500">
          <Search className="h-4 w-4 shrink-0 text-navy-500" />
          <span className="sr-only">Search the guide</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search capabilities, Copilot commands and troubleshooting"
            className="w-full bg-transparent text-sm text-navy-900 outline-none placeholder:text-navy-500"
          />
        </label>

        <nav className="scroll-x mt-4 flex gap-2" aria-label="Sections">
          {HELP_SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-navy-700 ring-1 ring-navy-800/10 hover:text-brand-700">
              {s.label}
            </a>
          ))}
        </nav>

        <div className="mt-8 space-y-6">
          {!q && (
            <Section id="start" title="Getting started">
              <ol className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {GETTING_STARTED.map((s, i) => (
                  <li key={s.title} className="rounded-xl bg-mist p-4">
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-500 text-xs font-bold text-white">{i + 1}</span>
                    <h3 className="mt-3 font-semibold text-navy-900">{s.title}</h3>
                    <p className="mt-1 text-sm text-navy-700">{s.body}</p>
                    {s.link && <InlineLink to={s.link.to}>{s.link.label}</InlineLink>}
                  </li>
                ))}
              </ol>
            </Section>
          )}

          {!q && (
            <Section id="roles" title="Roles and access">
              <p>Switch between these identities with “Demo as …” in the header. Broker areas and portals check the role before they open.</p>
              <div className="mt-3 space-y-3 md:hidden">
                {ROLES.map((r) => (
                  <div key={r.role} className="rounded-xl bg-mist p-4">
                    <p className="font-semibold text-navy-900">{r.role}</p>
                    <p className="text-xs text-navy-500">{r.who}</p>
                    <p className="mt-2">{r.can}</p>
                    <InlineLink to={r.home.to}>{r.home.label}</InlineLink>
                  </div>
                ))}
              </div>
              <div className="mt-3 hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-navy-500 uppercase">
                    <tr>
                      <th className="py-2 pr-4 font-semibold">Role</th>
                      <th className="py-2 pr-4 font-semibold">Demo identity</th>
                      <th className="py-2 pr-4 font-semibold">Can</th>
                      <th className="py-2 font-semibold">Start at</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-navy-800/10 align-top">
                    {ROLES.map((r) => (
                      <tr key={r.role}>
                        <td className="py-3 pr-4 font-semibold text-navy-900">{r.role}</td>
                        <td className="py-3 pr-4 text-navy-700">{r.who}</td>
                        <td className="py-3 pr-4 text-navy-700">{r.can}</td>
                        <td className="py-3 whitespace-nowrap">
                          <Link to={r.home.to}>{r.home.label}</Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <h3 className="mt-6 font-semibold text-navy-900">How the roles connect</h3>
              <ol className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
                {ROLE_FLOW.map((f, i) => (
                  <li key={f.role} className="flex gap-3 rounded-xl bg-mist p-3 lg:flex-col lg:gap-2">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-500 text-[11px] font-bold text-white">{i + 1}</span>
                    <span>
                      <span className="block font-semibold text-navy-900">{f.role}</span>
                      <span className="block text-xs text-navy-600">{f.step}</span>
                    </span>
                  </li>
                ))}
              </ol>

              <h3 className="mt-6 font-semibold text-navy-900">What each role can use</h3>
              <p>Each row is an area of the system; each column shows how far that role can go in it.</p>
              <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                {(Object.keys(ACCESS_LEVEL_LABEL) as AccessLevel[]).map((level) => (
                  <div key={level} className="flex items-center gap-1.5">
                    <dt>
                      <Badge tone={ACCESS_TONE[level]}>{ACCESS_LEVEL_LABEL[level]}</Badge>
                    </dt>
                    <dd className="text-xs text-navy-600">{ACCESS_LEVEL_HINT[level]}</dd>
                  </div>
                ))}
              </dl>

              <div className="mt-3 space-y-3 lg:hidden">
                {ACCESS_MATRIX.map((row) => (
                  <div key={row.area} className="rounded-xl bg-mist p-4">
                    <p className="font-semibold text-navy-900">{row.area}</p>
                    <div className="mt-2 space-y-2">
                      {ACCESS_ROLES.map((r) => (
                        <div key={r.id} className="flex gap-3">
                          <span className="w-32 shrink-0 pt-0.5 text-xs font-semibold text-navy-800">{r.label}</span>
                          <AccessCellView cell={row.access[r.id]} />
                        </div>
                      ))}
                    </div>
                    <InlineLink to={row.link.to}>{row.link.label}</InlineLink>
                  </div>
                ))}
              </div>
              <div className="mt-3 hidden max-h-[75vh] overflow-auto rounded-xl ring-1 ring-navy-800/10 lg:block">
                <table className="w-full min-w-[960px] text-left text-sm">
                  <caption className="sr-only">Access by role for each area of the system</caption>
                  <thead className="sticky top-0 z-10 bg-white text-xs text-navy-500 uppercase">
                    <tr>
                      <th scope="col" className="sticky left-0 bg-white px-3 py-2 font-semibold">Area</th>
                      {ACCESS_ROLES.map((r) => (
                        <th key={r.id} scope="col" className="px-3 py-2 font-semibold">{r.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-navy-800/10 align-top">
                    {ACCESS_MATRIX.map((row) => (
                      <tr key={row.area}>
                        <th scope="row" className="sticky left-0 w-56 bg-white px-3 py-3 font-semibold text-navy-900">
                          {row.area}
                          <Link to={row.link.to} className="mt-1 block text-xs">{row.link.label}</Link>
                        </th>
                        {ACCESS_ROLES.map((r) => (
                          <td key={r.id} className="px-3 py-3">
                            <AccessCellView cell={row.access[r.id]} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          <Section id="capabilities" title="Capabilities">
            {capabilities.length ? (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {capabilities.map((c) => (
                  <article key={c.area} className="rounded-xl bg-mist p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h3 className="font-semibold text-navy-900">{c.area}</h3>
                        <p className="text-xs text-navy-500">{c.audience}</p>
                      </div>
                      <Badge tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</Badge>
                    </div>
                    <p className="mt-2">{c.summary}</p>
                    <ul className="mt-2">
                      {c.can.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                      {c.links.map((l) => (
                        <InlineLink key={l.to} to={l.to}>
                          {l.label}
                        </InlineLink>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p>No capabilities match “{query}”.</p>
            )}
          </Section>

          {!q && (
            <Section id="walkthroughs" title="Walkthroughs">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {WALKTHROUGHS.map((w) => (
                  <article key={w.id} className="rounded-xl bg-mist p-4">
                    <h3 className="font-semibold text-navy-900">{w.title}</h3>
                    <p className="mt-1 text-xs text-navy-600">
                      <strong className="text-navy-800">Result:</strong> {w.outcome}
                    </p>
                    <ol className="mt-3 space-y-2">
                      {w.steps.map((s, i) => (
                        <li key={s.text} className="flex gap-3">
                          <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white text-[11px] font-bold text-brand-700 ring-1 ring-brand-500/30">
                            {i + 1}
                          </span>
                          <span>
                            {s.text} <Link to={s.link.to}>{s.link.label}</Link>
                          </span>
                        </li>
                      ))}
                    </ol>
                  </article>
                ))}
              </div>
            </Section>
          )}

          <Section id="copilot" title="Copilot commands">
            <p>
              Type these into <Link to="/broker/workspace">Russ</Link> (General lens) or{' '}
              <Link to="/broker/workspace?lens=commercial">Russ · Commercial</Link>. Results open in the panel on the right.
            </p>
            {commands.length > 0 && (
              <div className="mt-3 space-y-3 md:hidden">
                {commands.map((c) => (
                  <div key={c.command} className="rounded-xl bg-mist p-4">
                    <p className="font-medium text-navy-900">“{c.command}”</p>
                    <p className="mt-1">{c.does}</p>
                    <p className="mt-1 text-xs text-navy-500">{c.workspace}</p>
                  </div>
                ))}
              </div>
            )}
            {commands.length ? (
              <div className="mt-3 hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-navy-500 uppercase">
                    <tr>
                      <th className="py-2 pr-4 font-semibold">Ask</th>
                      <th className="py-2 pr-4 font-semibold">What happens</th>
                      <th className="py-2 font-semibold">Where</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-navy-800/10 align-top">
                    {commands.map((c) => (
                      <tr key={c.command}>
                        <td className="py-3 pr-4 font-medium text-navy-900">“{c.command}”</td>
                        <td className="py-3 pr-4 text-navy-700">{c.does}</td>
                        <td className="py-3 whitespace-nowrap text-navy-600">{c.workspace}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-2">No commands match “{query}”.</p>
            )}
          </Section>

          {!q && (
            <Section id="agents" title="AI agents and tools">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(AGENTS).map(([key, a]) => (
                  <div key={key} className="flex gap-3 rounded-xl bg-mist p-3">
                    <Bot className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                    <div>
                      <p className="font-semibold text-navy-900">{a.label}</p>
                      <p className="text-xs text-navy-600">{a.role}</p>
                    </div>
                  </div>
                ))}
              </div>
              <h3 className="mt-6 flex items-center gap-2 font-semibold text-navy-900">
                <Wrench className="h-4 w-4 text-brand-500" /> Typed tools ({platform?.tools.length ?? '…'})
              </h3>
              <p>
                Agents and people change data only through these tools. “Changes data” tools are audited, deduplicated and stopped when a job is
                cancelled.
              </p>
              <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
                {toolGroups.map(([group, tools]) => (
                  <div key={group} className="rounded-xl bg-mist p-4">
                    <h4 className="text-xs font-semibold tracking-wide text-navy-500 uppercase">{TOOL_GROUPS[group] ?? group}</h4>
                    <div className="mt-2 space-y-2">
                      {tools.map((t) => (
                        <div key={t.name}>
                          <span className="flex flex-wrap items-center gap-2">
                            <code className="text-xs font-semibold text-navy-900">{t.name}</code>
                            {t.sideEffect && <Badge tone="info">Changes data</Badge>}
                            {!t.allow.includes('agent') && <Badge tone="accent">People only</Badge>}
                          </span>
                          <span className="block text-xs text-navy-600">{t.description}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {!q && (
            <Section id="guardrails" title="Guardrails">
              <ul>
                {GUARDRAILS.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
              <p className="mt-3 flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-brand-500" /> Regulatory placeholders are in <Link to="/legal">Demo disclosures</Link>.
              </p>
            </Section>
          )}

          {!q && (
            <Section id="statuses" title="Status reference">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                {STATUSES.map((group) => (
                  <div key={group.title} className="rounded-xl bg-mist p-4">
                    <h3 className="font-semibold text-navy-900">{group.title}</h3>
                    <dl className="mt-2 space-y-2">
                      {group.items.map(([term, meaning]) => (
                        <div key={term}>
                          <dt className="text-xs font-semibold text-navy-900">{term}</dt>
                          <dd className="text-xs text-navy-600">{meaning}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {!q && (
            <Section id="roadmap" title="Coming later">
              <p>These scenarios are planned. Asking the Copilot about them gets an honest “later phase” answer.</p>
              <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <h3 className="text-xs font-semibold tracking-wide text-navy-500 uppercase">Personal insurance</h3>
                  <ul className="mt-2">
                    {PLANNED_SCENARIOS.map((p) => (
                      <li key={p.number}>
                        <strong className="text-navy-900">{p.title}.</strong> {p.summary}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="text-xs font-semibold tracking-wide text-navy-500 uppercase">Commercial insurance</h3>
                  <ul className="mt-2">
                    {PLANNED_COMMERCIAL_SCENARIOS.map((p) => (
                      <li key={p.code}>
                        <strong className="text-navy-900">{p.title}.</strong> {p.summary}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <h3 className="mt-5 font-semibold text-navy-900">Known limitations of this build</h3>
              <ul className="mt-1">
                {LIMITATIONS.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </Section>
          )}

          <Section id="faq" title="Troubleshooting">
            {faq.length ? (
              <div className="divide-y divide-navy-800/10">
                {faq.map((f) => (
                  <details key={f.q} className="group py-3" open={Boolean(q)}>
                    <summary className="cursor-pointer font-medium text-navy-900 marker:text-brand-500">{f.q}</summary>
                    <p className="mt-1.5">{f.a}</p>
                  </details>
                ))}
              </div>
            ) : (
              <p>No answers match “{query}”.</p>
            )}
            <p className="pt-2">
              More answers for customers, business owners and brokers are in the <Link to="/faq">FAQ</Link>.
            </p>
          </Section>

          {!q && (
            <Section id="more" title="FAQ and system updates">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Link to="/faq" className="flex gap-3 rounded-xl bg-mist p-4 transition hover:ring-1 hover:ring-brand-500/40">
                  <MessageCircleQuestion className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" />
                  <span>
                    <span className="block font-semibold text-navy-900">Frequently asked questions</span>
                    <span className="block text-navy-700">Searchable answers about personal and business cover, the AI agents, approvals, portals and privacy.</span>
                  </span>
                </Link>
                <Link to="/updates" className="flex gap-3 rounded-xl bg-mist p-4 transition hover:ring-1 hover:ring-brand-500/40">
                  <Newspaper className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" />
                  <span>
                    <span className="block font-semibold text-navy-900">System updates</span>
                    <span className="block text-navy-700">
                      Latest: {LATEST_UPDATE.title} ({LATEST_UPDATE.version}). Every release as a thread, plus a pinned overview of the platform.
                    </span>
                  </span>
                </Link>
              </div>
            </Section>
          )}
        </div>
      </div>
    </div>
  )
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="panel scroll-mt-28 p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-navy-900">{title}</h2>
      <div className="mt-3 space-y-2 text-sm leading-relaxed text-navy-700 [&_a]:font-semibold [&_a]:text-brand-600 [&_ul]:space-y-1 [&_ul>li]:ml-4 [&_ul>li]:list-disc">
        {children}
      </div>
    </section>
  )
}

function AccessCellView({ cell }: { cell: AccessCell }) {
  return (
    <span className="block">
      <Badge tone={ACCESS_TONE[cell.level]}>{ACCESS_LEVEL_LABEL[cell.level]}</Badge>
      {cell.note && <span className="mt-1 block text-xs text-navy-600">{cell.note}</span>}
    </span>
  )
}

function InlineLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="mt-2 inline-flex items-center gap-1 text-sm">
      {children} <ArrowRight className="h-3.5 w-3.5" />
    </Link>
  )
}
