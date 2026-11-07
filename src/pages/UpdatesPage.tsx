import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Bot,
  Briefcase,
  Building2,
  CircleHelp,
  Cpu,
  LayoutDashboard,
  Newspaper,
  Pin,
  Search,
  User,
  type LucideIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  AREA_LABEL,
  KIND_LABEL,
  UPDATE_THREADS,
  type UpdateArea,
  type UpdateKind,
  type UpdatePost,
  type UpdateThread,
} from '@/data/updates'
import { cn } from '@/lib/utils'

const AREA_ICON: Record<UpdateArea, LucideIcon> = {
  personal: User,
  business: Building2,
  broker: Briefcase,
  portals: LayoutDashboard,
  agents: Bot,
  platform: Cpu,
  help: CircleHelp,
}

const KIND_TONE: Record<UpdateKind, 'success' | 'info' | 'warning' | 'accent'> = {
  new: 'success',
  improved: 'info',
  fixed: 'warning',
  overview: 'accent',
}

const COLLAPSE_AFTER = 4

const formatWhen = (iso: string) =>
  new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Johannesburg' }).format(
    new Date(iso),
  )

const postMatches = (q: string, p: UpdatePost) => !q || [p.title, p.body, ...(p.points ?? [])].join(' ').toLowerCase().includes(q)

export default function UpdatesPage() {
  const [area, setArea] = useState<UpdateArea | 'all'>('all')
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()

  const threads = UPDATE_THREADS.map((t) => ({
    ...t,
    posts: t.posts.filter((p) => (area === 'all' || p.area === area) && postMatches(q, p)),
  })).filter((t) => t.posts.length || (!q && area === 'all'))

  const counts = Object.keys(AREA_LABEL).map((a) => ({
    area: a as UpdateArea,
    count: UPDATE_THREADS.filter((t) => !t.pinned).flatMap((t) => t.posts).filter((p) => p.area === a).length,
  }))
  const releases = UPDATE_THREADS.filter((t) => !t.pinned)

  return (
    <div className="bg-mist">
      <div className="container-x py-10 sm:py-12">
        <p className="eyebrow mb-1 flex items-center gap-1.5">
          <Newspaper className="h-3.5 w-3.5" /> System updates
        </p>
        <h1 className="font-display text-3xl font-bold text-navy-900 sm:text-4xl">What’s new on InsureFlow AI</h1>
        <p className="mt-2 max-w-2xl text-sm text-navy-600">
          Every release as a thread, newest first, with a pinned overview of all services, products, features and capabilities in the current build.
        </p>

        <label className="mt-6 flex max-w-xl items-center gap-2 rounded-full bg-white px-4 py-3 ring-1 ring-navy-800/10 focus-within:ring-brand-500">
          <Search className="h-4 w-4 shrink-0 text-navy-500" />
          <span className="sr-only">Search updates</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search updates, for example “approval” or “mobile”"
            className="w-full bg-transparent text-base text-navy-900 outline-none placeholder:text-navy-500 sm:text-sm"
          />
        </label>

        <div className="scroll-x -mx-5 mt-4 flex gap-2 px-5 sm:mx-0 sm:flex-wrap sm:px-0" role="tablist" aria-label="Filter by area">
          <FilterChip active={area === 'all'} onClick={() => setArea('all')} label="Everything" />
          {counts.map(({ area: a, count }) => (
            <FilterChip key={a} active={area === a} onClick={() => setArea(a)} label={AREA_LABEL[a]} count={count} icon={AREA_ICON[a]} />
          ))}
        </div>

        <details className="panel mt-4 lg:hidden">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-navy-900">Jump to a release ({releases.length})</summary>
          <ol className="space-y-2 border-t border-navy-800/10 px-4 py-3">
            {releases.map((r) => (
              <li key={r.id}>
                <a href={`#${r.id}`} className="flex gap-2 text-sm">
                  <span className="shrink-0 rounded bg-navy-50 px-1.5 py-0.5 text-[11px] font-semibold text-navy-700">{r.version}</span>
                  <span className="font-medium text-navy-900">{r.title}</span>
                </a>
              </li>
            ))}
          </ol>
        </details>

        <div className="mt-6 grid grid-cols-1 gap-8 lg:mt-8 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="min-w-0 space-y-6">
            {threads.length === 0 && <div className="panel p-6 text-sm text-navy-600">No updates match your filters.</div>}
            {threads.map((t) => (
              <Thread key={t.id} thread={t} filtered={area !== 'all' || Boolean(q)} />
            ))}
          </div>

          <aside className="hidden lg:block">
            <div className="sticky top-24 space-y-4">
              <nav className="panel p-4" aria-label="Releases">
                <h2 className="text-xs font-semibold tracking-wide text-navy-500 uppercase">Releases</h2>
                <ol className="mt-3 space-y-2.5">
                  {releases.map((r) => (
                    <li key={r.id}>
                      <a href={`#${r.id}`} className="group block">
                        <span className="flex items-center gap-2 text-[11px] text-navy-500">
                          <span className="rounded bg-navy-50 px-1.5 py-0.5 font-semibold text-navy-700">{r.version}</span>
                          {formatWhen(r.date)}
                        </span>
                        <span className="mt-0.5 block text-sm leading-snug font-medium text-navy-900 group-hover:text-brand-600">{r.title}</span>
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>
              <div className="panel p-4 text-sm">
                <p className="font-semibold text-navy-900">Questions about a change?</p>
                <div className="mt-2 flex flex-col gap-1.5">
                  <Link to="/faq" className="font-semibold text-brand-600">FAQ</Link>
                  <Link to="/help" className="font-semibold text-brand-600">Help centre</Link>
                  <Link to="/demo" className="font-semibold text-brand-600">Try it in Demo Studio</Link>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}

function FilterChip({ active, onClick, label, count, icon: Icon }: { active: boolean; onClick: () => void; label: string; count?: number; icon?: LucideIcon }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={(e) => {
        onClick()
        e.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
      }}
      className={cn(
        'flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold ring-1 transition',
        active ? 'bg-brand-800 text-white ring-brand-800' : 'bg-white text-navy-700 ring-navy-800/10 hover:text-brand-700',
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {label}
      {count !== undefined && <span className={cn('rounded-full px-1.5 text-[10px]', active ? 'bg-white/20' : 'bg-navy-50')}>{count}</span>}
    </button>
  )
}

function Thread({ thread, filtered }: { thread: UpdateThread; filtered: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const showAll = filtered || expanded || thread.posts.length <= COLLAPSE_AFTER + 1
  const posts = showAll ? thread.posts : thread.posts.slice(0, COLLAPSE_AFTER)
  const hidden = thread.posts.length - posts.length

  return (
    <article id={thread.id} className={cn('panel scroll-mt-24 overflow-hidden', thread.pinned && 'border-brand-500/40')}>
      <header className="flex gap-3 p-4 sm:p-5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-800 text-xs font-bold text-white">IF</span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-navy-500">
            <span className="font-semibold text-navy-900">InsureFlow product team</span>
            <span>·</span>
            <time dateTime={thread.date}>{formatWhen(thread.date)}</time>
            <span className="rounded bg-navy-50 px-1.5 py-0.5 font-semibold text-navy-700">{thread.version}</span>
            {thread.pinned && (
              <Badge tone="accent">
                <Pin /> Pinned
              </Badge>
            )}
          </p>
          <h2 className="mt-1 text-lg leading-snug font-semibold text-navy-900">{thread.title}</h2>
          <p className="mt-1 text-sm text-navy-700">{thread.summary}</p>
          <p className="mt-2 text-xs text-navy-500">
            {thread.posts.length} {thread.posts.length === 1 ? 'update' : 'updates'} in this thread
          </p>
        </div>
      </header>

      {posts.length > 0 && (
        <ol className="border-t border-navy-800/10 bg-mist/60 px-4 py-4 sm:px-5">
          {posts.map((p, i) => {
            const Icon = AREA_ICON[p.area]
            const last = i === posts.length - 1 && hidden === 0
            return (
              <li key={p.title} className="relative flex gap-3 pb-5 last:pb-0">
                {!last && <span className="absolute top-9 bottom-0 left-[17px] w-px bg-navy-800/15" aria-hidden />}
                <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-brand-600 ring-1 ring-navy-800/10">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1 rounded-xl bg-white p-3.5 ring-1 ring-navy-800/5">
                  <p className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={KIND_TONE[p.kind]}>{KIND_LABEL[p.kind]}</Badge>
                    <span className="text-[11px] font-medium text-navy-500">{AREA_LABEL[p.area]}</span>
                  </p>
                  <h3 className="mt-1.5 text-sm font-semibold text-navy-900">{p.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-navy-700">{p.body}</p>
                  {p.points && (
                    <ul className="mt-2 space-y-1 text-sm text-navy-700">
                      {p.points.map((pt) => (
                        <li key={pt} className="flex gap-2">
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                          {pt}
                        </li>
                      ))}
                    </ul>
                  )}
                  {p.links && (
                    <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
                      {p.links.map((l) => (
                        <Link key={l.to} to={l.to} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-800">
                          {l.label} <ArrowRight className="h-3 w-3" />
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            )
          })}
          {hidden > 0 && (
            <li className="flex gap-3 pt-1">
              <span className="w-9 shrink-0" />
              <button type="button" onClick={() => setExpanded(true)} className="cursor-pointer text-sm font-semibold text-brand-600 hover:text-brand-800">
                Show {hidden} more in this thread
              </button>
            </li>
          )}
        </ol>
      )}
    </article>
  )
}
