import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ChevronDown, CircleHelp, MessageCircleQuestion, Newspaper, Search } from 'lucide-react'
import { FAQ_CATEGORIES, FAQ_COUNT, type FaqItem } from '@/data/faq'
import { cn } from '@/lib/utils'

const matches = (q: string, item: FaqItem) => !q || `${item.q} ${item.a}`.toLowerCase().includes(q)

export default function FaqPage() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string>('all')
  const [open, setOpen] = useState<string | null>(FAQ_CATEGORIES[0].items[0].q)
  const q = query.trim().toLowerCase()

  const visible = FAQ_CATEGORIES.filter((c) => category === 'all' || c.id === category)
    .map((c) => ({ ...c, items: c.items.filter((i) => matches(q, i)) }))
    .filter((c) => c.items.length)
  const total = visible.reduce((n, c) => n + c.items.length, 0)

  return (
    <div className="bg-mist">
      <div className="container-x py-10 sm:py-12">
        <p className="eyebrow mb-1 flex items-center gap-1.5">
          <MessageCircleQuestion className="h-3.5 w-3.5" /> FAQ
        </p>
        <h1 className="font-display text-3xl font-bold text-navy-900 sm:text-4xl">Frequently asked questions</h1>
        <p className="mt-2 max-w-2xl text-sm text-navy-600">
          {FAQ_COUNT} answers about personal and business cover, Ava and the AI agents, brokers and approvals, portals, privacy, claims and using
          the demo.
        </p>

        <label className="mt-6 flex max-w-xl items-center gap-2 rounded-full bg-white px-4 py-3 ring-1 ring-navy-800/10 focus-within:ring-brand-500">
          <Search className="h-4 w-4 shrink-0 text-navy-500" />
          <span className="sr-only">Search the FAQ</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search, for example “approval” or “restaurant”"
            className="w-full bg-transparent text-base text-navy-900 outline-none placeholder:text-navy-500 sm:text-sm"
          />
        </label>

        <div className="scroll-x -mx-5 mt-4 flex gap-2 px-5 sm:mx-0 sm:flex-wrap sm:px-0" role="tablist" aria-label="FAQ topics">
          {[{ id: 'all', title: 'All topics' }, ...FAQ_CATEGORIES].map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={category === c.id}
              onClick={(e) => {
                setCategory(c.id)
                const first = FAQ_CATEGORIES.find((x) => x.id === c.id)?.items[0]
                if (first) setOpen(first.q)
                e.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
              }}
              className={cn(
                'shrink-0 cursor-pointer rounded-full px-3.5 py-2 text-xs font-semibold ring-1 transition',
                category === c.id ? 'bg-brand-800 text-white ring-brand-800' : 'bg-white text-navy-700 ring-navy-800/10 hover:text-brand-700',
              )}
            >
              {c.title}
            </button>
          ))}
        </div>

        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-6">
            {total === 0 && (
              <div className="panel p-6 text-sm text-navy-600">
                No answers match “{query}”. Try another word, or <Link to="/contact" className="font-semibold text-brand-600">ask a broker</Link>.
              </div>
            )}
            {visible.map((c) => (
              <section key={c.id} id={c.id} className="scroll-mt-28">
                <h2 className="mb-3 text-sm font-semibold tracking-wide text-navy-500 uppercase">{c.title}</h2>
                <div className="panel divide-y divide-navy-800/10 overflow-hidden">
                  {c.items.map((item) => {
                    const expanded = Boolean(q) || open === item.q
                    return (
                      <div key={item.q}>
                        <button
                          type="button"
                          onClick={() => setOpen(open === item.q ? null : item.q)}
                          aria-expanded={expanded}
                          className="flex w-full cursor-pointer items-start justify-between gap-4 px-4 py-4 text-left text-sm font-semibold text-navy-900 hover:bg-mist sm:px-5"
                        >
                          {item.q}
                          <ChevronDown className={cn('mt-0.5 h-4 w-4 shrink-0 text-brand-500 transition', expanded && 'rotate-180')} />
                        </button>
                        {expanded && (
                          <div className="px-4 pb-4 text-sm leading-relaxed text-navy-700 sm:px-5">
                            <p>{item.a}</p>
                            {item.link && (
                              <Link to={item.link.to} className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-600">
                                {item.link.label} <ArrowRight className="h-3.5 w-3.5" />
                              </Link>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <div className="panel p-5">
              <h2 className="font-semibold text-navy-900">Still need help?</h2>
              <p className="mt-1 text-sm text-navy-600">Talk to a broker, or start with an AI-assisted assessment.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link to="/contact" className="btn-dark px-4 py-2 text-xs">Contact a broker</Link>
                <Link to="/assist" className="btn-ghost px-4 py-2 text-xs">Ask Ava</Link>
              </div>
            </div>
            <Link to="/help" className="panel flex items-center gap-3 p-4 transition hover:border-brand-500/40">
              <CircleHelp className="h-5 w-5 shrink-0 text-brand-500" />
              <span className="flex-1 text-sm">
                <span className="block font-semibold text-navy-900">Help centre</span>
                <span className="text-xs text-navy-600">Capabilities, walkthroughs and Copilot commands</span>
              </span>
              <ArrowRight className="h-4 w-4 text-brand-500" />
            </Link>
            <Link to="/updates" className="panel flex items-center gap-3 p-4 transition hover:border-brand-500/40">
              <Newspaper className="h-5 w-5 shrink-0 text-brand-500" />
              <span className="flex-1 text-sm">
                <span className="block font-semibold text-navy-900">System updates</span>
                <span className="text-xs text-navy-600">What changed and when</span>
              </span>
              <ArrowRight className="h-4 w-4 text-brand-500" />
            </Link>
          </aside>
        </div>
      </div>
    </div>
  )
}
