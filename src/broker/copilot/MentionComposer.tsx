import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { ArrowUp, AtSign, Building2, FileText, Loader2, Slash, UserRound } from 'lucide-react'
import { copilotApi, useCopilotJobs, type CopilotId, type EntityRef } from '@/copilot/api'
import type { DataCategory } from '@/lib/supabase/category'
import { cn } from '@/lib/utils'
import { CategoryBadge } from './identity'

export interface ComposerSubmit {
  /** Message with composer chips as @[label](type:id), which the planner reads as verified records. */
  text: string
  /** What the broker sees. */
  display: string
  entities: EntityRef[]
}

interface JobTemplate {
  label: string
  hint: string
  insert: string
  job: string
  copilot: 'shared' | 'ava' | 'russ'
}

const JOB_TEMPLATES: JobTemplate[] = [
  { label: 'Find a client or account', hint: 'By name, partial name or number', insert: 'Find @', job: 'records.search', copilot: 'shared' },
  { label: 'Add a note', hint: 'Against a client, account or policy', insert: 'Add a note to @', job: 'interaction.record', copilot: 'shared' },
  { label: 'Create a follow-up', hint: 'A callback or task; due date optional', insert: 'Arrange a callback for @', job: 'task.create', copilot: 'shared' },
  { label: 'Show history', hint: 'Notes, follow-ups and policies by date', insert: 'Show history for @', job: 'history.list', copilot: 'shared' },
  { label: 'Create a client', hint: 'New client number; checks for duplicates', insert: 'Create a client called ', job: 'client.create', copilot: 'shared' },
  { label: 'Create an account', hint: 'Personal or business account', insert: 'Create an account called ', job: 'account.create', copilot: 'shared' },
  { label: 'Show policies', hint: 'Personal lines and life', insert: 'Show policies for @', job: 'ava.policies.list', copilot: 'ava' },
  { label: 'New quote request', hint: 'Motor, home or contents', insert: 'New motor quote request for @', job: 'ava.quote_request.create', copilot: 'ava' },
  { label: 'Start a life application', hint: 'For an existing client', insert: 'Start a life application for @', job: 'ava.life_application.create', copilot: 'ava' },
  { label: 'Latest life application', hint: 'Open application or latest policy', insert: 'Show the latest life application for @', job: 'ava.life_application.get', copilot: 'ava' },
  { label: 'Business overview', hint: 'Profile, commercial cover and schemes', insert: 'Show @', job: 'russ.business.overview', copilot: 'russ' },
  { label: 'Group schemes', hint: 'Schemes with member counts', insert: 'Show schemes for @', job: 'russ.scheme.overview', copilot: 'russ' },
  { label: 'Scheme members', hint: 'Members, cover and status', insert: 'Show members for @', job: 'russ.members.list', copilot: 'russ' },
  { label: 'Set up my brokerage', hint: 'Create or reopen your workspace and referral code', insert: 'Set up my brokerage', job: 'sales.workspace.setup', copilot: 'shared' },
  { label: 'Invite an agent', hint: 'Team member, role, service area and referral link', insert: 'Invite  as an agent in ', job: 'sales.team.invite', copilot: 'shared' },
  { label: 'Referral link', hint: 'Yours or a team member’s customer link', insert: 'Give me my customer referral link', job: 'sales.team.list', copilot: 'shared' },
  { label: 'Load a prospect', hint: 'Against a referral code; checks for existing contacts', insert: 'Load prospect  against  code', job: 'sales.enquiry.capture', copilot: 'shared' },
  { label: 'Prepare an offer', hint: 'From a saved quote or insurer, premium and frequency', insert: 'Prepare a motor offer for @', job: 'sales.offer.create', copilot: 'shared' },
  { label: 'Offer sent', hint: 'Log that you sent the offer', insert: 'I sent the offer on WhatsApp', job: 'sales.offer.sent', copilot: 'shared' },
  { label: 'Client accepted', hint: 'Record acceptance and a cover follow-up', insert: 'The client accepted the offer', job: 'sales.offer.accept', copilot: 'shared' },
  { label: 'Cover confirmed', hint: 'Record the sale once, with insurer reference and start date', insert: 'The insurer confirmed cover, reference , starting ', job: 'sales.sale.record', copilot: 'shared' },
  { label: 'Referrals, comms and sales', hint: 'Filtered client grid for a team member', insert: 'Show ’s referrals, latest comms and sales', job: 'sales.book.grid', copilot: 'shared' },
]

/** Lower-case words that start instructions or glue sentences together: never offered as names. */
const STOP = new Set(
  'find show add create open get list record log note save arrange schedule book start new set look search retrieve pull give display make remind capture register submit tell what who leave write view please then and the for with from about that this note notes policy policies motor home contents life cover client account history latest application callback follow task tasks quote request their her his them they called named into onto said says wants asked about renewal premium excess today tomorrow next week'.split(' '),
)

type Menu = { mode: 'records' | 'jobs'; query: string; start: number; explicit: boolean }

const labelOf = (e: EntityRef) => `${e.name}${e.number ? ` · ${e.number}` : ''}`
const ICON: Record<EntityRef['record_type'], typeof UserRound> = {
  client: UserRound, account: Building2, policy: FileText, quote_option: FileText, team_member: UserRound, offer: FileText,
}

function tokenRanges(value: string, tokens: Record<string, EntityRef>) {
  const ranges: Array<{ start: number; end: number; label: string }> = []
  for (const label of Object.keys(tokens)) {
    const needle = `@${label}`
    for (let i = value.indexOf(needle); i >= 0; i = value.indexOf(needle, i + needle.length)) ranges.push({ start: i, end: i + needle.length, label })
  }
  return ranges.sort((a, b) => a.start - b.start)
}

function detect(value: string, caret: number, tokens: Record<string, EntityRef>, suppressed: string | null): Menu | null {
  const before = value.slice(0, caret)
  const ranges = tokenRanges(value, tokens)
  if (ranges.some((r) => caret > r.start && caret <= r.end)) return null
  const lastTokenEnd = ranges.filter((r) => r.end <= caret).reduce((n, r) => Math.max(n, r.end), -1)
  const slash = before.match(/(?:^|\s)\/([\w ]{0,30})$/)
  if (slash) return { mode: 'jobs', query: slash[1], start: caret - slash[1].length - 1, explicit: true }
  const at = before.match(/(?:^|\s)@([^@\n]{0,40})$/)
  if (at) {
    const start = caret - at[1].length - 1
    if (start >= lastTokenEnd) return { mode: 'records', query: at[1], start, explicit: true }
  }
  const auto = before.match(/(?:^|[\s(])((?:[A-Z][a-zA-Z\u00C0-\u017F'’-]*)(?:\s+[A-Z][a-zA-Z\u00C0-\u017F'’-]*){0,2}|(?:CL|AC|PL)-S?\d+|[a-z][a-zA-Z'’-]{3,})$/)
  if (!auto) return null
  const word = auto[1]
  const start = caret - word.length
  if (start < lastTokenEnd || word.length < 2 || STOP.has(word.toLowerCase()) || word === suppressed) return null
  return { mode: 'records', query: word, start, explicit: false }
}

export function MentionComposer({
  copilot,
  category,
  disabled,
  sending,
  placeholder,
  onSubmit,
  searchSignal,
  prefill,
}: {
  copilot: CopilotId
  category: DataCategory
  disabled?: boolean
  sending?: boolean
  placeholder?: string
  onSubmit: (payload: ComposerSubmit) => void
  /** Increment to open the record search from outside (for example “Change” on the selected record). */
  searchSignal?: number
  /** Text to place in the composer (quick starters), replacing what is there. */
  prefill?: { text: string; nonce: number } | null
}) {
  const [value, setValue] = useState('')
  const [caret, setCaret] = useState(0)
  const [tokens, setTokens] = useState<Record<string, EntityRef>>({})
  const [menu, setMenu] = useState<Menu | null>(null)
  const [results, setResults] = useState<EntityRef[]>([])
  const [loading, setLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [active, setActive] = useState(-1)
  const [suppressed, setSuppressed] = useState<string | null>(null)
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const { data: offered } = useCopilotJobs()

  const jobs = useMemo(() => {
    const names = offered?.map((j) => j.name)
    const q = menu?.mode === 'jobs' ? menu.query.toLowerCase() : ''
    return JOB_TEMPLATES.filter(
      (t) => (!names || names.includes(t.job)) && (copilot === 'ar' || t.copilot === 'shared' || t.copilot === copilot) && (!q || t.label.toLowerCase().includes(q)),
    )
  }, [offered, copilot, menu])

  // Tokens disappear when their text is edited away.
  useEffect(() => {
    setTokens((t) => {
      const kept = Object.fromEntries(Object.entries(t).filter(([label]) => value.includes(`@${label}`)))
      return Object.keys(kept).length === Object.keys(t).length ? t : kept
    })
  }, [value])

  // A category switch invalidates every chip: records never cross between Sample and Live.
  useEffect(() => {
    setTokens({})
    setValue('')
    setMenu(null)
  }, [category])

  useEffect(() => {
    if (!prefill) return
    setValue(prefill.text)
    setTokens({})
    requestAnimationFrame(() => {
      const el = areaRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(prefill.text.length, prefill.text.length)
      setCaret(prefill.text.length)
      setMenu(detect(prefill.text, prefill.text.length, {}, null))
    })
  }, [prefill])

  useEffect(() => {
    if (!searchSignal) return
    const el = areaRef.current
    if (!el) return
    const insert = value && !value.endsWith(' ') ? `${value} @` : `${value}@`
    setValue(insert)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(insert.length, insert.length)
      setCaret(insert.length)
      setMenu({ mode: 'records', query: '', start: insert.length - 1, explicit: true })
    })
  }, [searchSignal])

  // Search as the broker types (debounced); explicit @ searches show their state, automatic ones only show matches.
  useEffect(() => {
    if (!menu || menu.mode !== 'records' || menu.query.trim().length < 2) {
      setResults([])
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    const timer = window.setTimeout(() => {
      copilotApi
        .search(menu.query.trim(), category)
        .then((r) => {
          if (cancelled) return
          setResults(r)
          setSearchError(null)
          setActive(menu.explicit && r.length ? 0 : -1)
        })
        .catch((e: Error) => !cancelled && (setResults([]), setSearchError(e.message)))
        .finally(() => !cancelled && setLoading(false))
    }, 220)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [menu, category])

  useEffect(() => {
    const el = areaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [value])

  const update = (next: string, pos: number) => {
    setValue(next)
    setCaret(pos)
    if (suppressed && !next.slice(0, pos).endsWith(suppressed)) setSuppressed(null)
    setMenu(detect(next, pos, tokens, suppressed))
  }

  const place = (next: string, pos: number) => {
    setValue(next)
    requestAnimationFrame(() => {
      const el = areaRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(pos, pos)
      setCaret(pos)
    })
  }

  const chooseRecord = (e: EntityRef) => {
    if (!menu) return
    const label = labelOf(e)
    const next = `${value.slice(0, menu.start)}@${label} ${value.slice(caret)}`
    setTokens((t) => ({ ...t, [label]: e }))
    setMenu(null)
    setResults([])
    place(next, menu.start + label.length + 2)
  }

  const chooseJob = (t: JobTemplate) => {
    if (!menu) return
    const next = `${value.slice(0, menu.start)}${t.insert}${value.slice(caret)}`
    const pos = menu.start + t.insert.length
    place(next, pos)
    setMenu(t.insert.endsWith('@') ? { mode: 'records', query: '', start: pos - 1, explicit: true } : null)
  }

  const items = menu?.mode === 'jobs' ? jobs.length : results.length
  const open = Boolean(menu) && (menu!.mode === 'jobs' ? jobs.length > 0 : menu!.explicit || results.length > 0)

  const submit = () => {
    const display = value.trim()
    if (!display || disabled || sending) return
    let text = value
    const used: EntityRef[] = []
    for (const [label, e] of Object.entries(tokens)) {
      if (!text.includes(`@${label}`)) continue
      text = text.split(`@${label}`).join(`@[${label}](${e.record_type}:${e.id})`)
      used.push(e)
    }
    onSubmit({ text: text.trim(), display, entities: used })
    setValue('')
    setTokens({})
    setMenu(null)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (open && items > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        return setActive((a) => (a + 1) % items)
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        return setActive((a) => (a <= 0 ? items - 1 : a - 1))
      }
      if ((e.key === 'Enter' || e.key === 'Tab') && active >= 0) {
        e.preventDefault()
        return menu!.mode === 'jobs' ? chooseJob(jobs[active]) : chooseRecord(results[active])
      }
    }
    if (e.key === 'Escape' && menu) {
      e.preventDefault()
      if (!menu.explicit) setSuppressed(menu.query)
      return setMenu(null)
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  const ranges = tokenRanges(value, tokens)
  const overlay: Array<{ text: string; token?: EntityRef }> = []
  let cursor = 0
  for (const r of ranges) {
    if (r.start < cursor) continue
    if (r.start > cursor) overlay.push({ text: value.slice(cursor, r.start) })
    overlay.push({ text: value.slice(r.start, r.end), token: tokens[r.label] })
    cursor = r.end
  }
  overlay.push({ text: value.slice(cursor) + '\u200b' })

  return (
    <div className="relative">
      {open && (
        <div className="absolute right-0 bottom-full left-0 z-30 mb-2 overflow-hidden rounded-xl border border-navy-800/10 bg-white shadow-xl">
          <p className="flex items-center gap-1.5 border-b border-navy-800/5 px-3 py-1.5 text-[11px] text-navy-500">
            {menu!.mode === 'jobs' ? (
              <>
                <Slash className="h-3 w-3" /> Jobs {copilot === 'ar' ? 'for Ava and Russ' : `for ${copilot === 'ava' ? 'Ava' : 'Russ'}`}
              </>
            ) : (
              <>
                <AtSign className="h-3 w-3" /> {menu!.query.trim().length < 2 ? 'Type a name, partial name or client, account or policy number' : `${category === 'live' ? 'Live' : 'Sample'} records matching “${menu!.query.trim()}”`}
                {loading && <Loader2 className="ml-auto h-3 w-3 animate-spin" />}
              </>
            )}
          </p>
          <ul id={listId} role="listbox" aria-label={menu!.mode === 'jobs' ? 'Copilot jobs' : 'Matching records'} className="max-h-72 overflow-y-auto py-1">
            {menu!.mode === 'jobs'
              ? jobs.map((t, i) => (
                  <li
                    key={t.job + t.label}
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={i === active}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => chooseJob(t)}
                    className={cn('flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm', i === active ? 'bg-brand-50' : 'hover:bg-navy-50')}
                  >
                    <span className="min-w-0">
                      <span className="block font-medium text-navy-900">{t.label}</span>
                      <span className="block truncate text-[11px] text-navy-500">{t.hint}</span>
                    </span>
                    <code className="shrink-0 text-[10px] text-navy-400">{t.job}</code>
                  </li>
                ))
              : results.map((r, i) => {
                  const Icon = ICON[r.record_type]
                  return (
                    <li
                      key={`${r.record_type}:${r.id}`}
                      id={`${listId}-${i}`}
                      role="option"
                      aria-selected={i === active}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => chooseRecord(r)}
                      className={cn('flex cursor-pointer items-center gap-2.5 px-3 py-2', i === active ? 'bg-brand-50' : 'hover:bg-navy-50')}
                    >
                      <Icon className="h-4 w-4 shrink-0 text-navy-500" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-navy-900">
                          {r.name} <span className="font-mono text-xs text-navy-600">{r.number}</span>
                        </span>
                        <span className="block truncate text-[11px] text-navy-500">
                          {r.record_type === 'client' ? 'Client' : r.record_type === 'account' ? r.detail ?? 'Account' : r.detail ?? 'Policy'}
                          {r.record_type !== 'account' && r.account ? ` · ${r.account.name} (${r.account.number})` : ''}
                        </span>
                      </span>
                      <CategoryBadge category={r.category} />
                    </li>
                  )
                })}
            {menu!.mode === 'records' && menu!.explicit && menu!.query.trim().length >= 2 && !loading && results.length === 0 && (
              <li className="px-3 py-3 text-xs text-navy-600">{searchError ?? `No ${category === 'live' ? 'Live' : 'Sample'} client, account or policy matches.`}</li>
            )}
          </ul>
        </div>
      )}

      <div className="flex items-end gap-2">
        <div className="relative min-w-0 flex-1 rounded-2xl border border-navy-800/15 bg-white focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20">
          <div
            ref={overlayRef}
            aria-hidden
            className="pointer-events-none absolute inset-0 overflow-hidden px-3.5 py-2.5 text-sm leading-6 break-words whitespace-pre-wrap text-navy-900"
          >
            {overlay.map((seg, i) =>
              seg.token ? (
                <span key={i} className={cn('rounded-md px-0.5 font-medium', seg.token.category === 'live' ? 'bg-emerald-100 text-emerald-900' : 'bg-brand-100 text-brand-800')}>
                  {seg.text}
                </span>
              ) : (
                <span key={i}>{seg.text}</span>
              ),
            )}
          </div>
          <textarea
            ref={areaRef}
            rows={1}
            value={value}
            disabled={disabled}
            placeholder={placeholder}
            role="combobox"
            aria-label="Message the copilot"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            aria-autocomplete="list"
            aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
            onChange={(e) => update(e.target.value, e.target.selectionStart ?? e.target.value.length)}
            onSelect={(e) => {
              const pos = e.currentTarget.selectionStart ?? 0
              if (pos !== caret) {
                setCaret(pos)
                setMenu(detect(value, pos, tokens, suppressed))
              }
            }}
            onKeyDown={onKeyDown}
            onBlur={() => window.setTimeout(() => setMenu(null), 120)}
            onScroll={(e) => overlayRef.current && (overlayRef.current.scrollTop = e.currentTarget.scrollTop)}
            className="relative block w-full resize-none bg-transparent px-3.5 py-2.5 text-sm leading-6 break-words text-transparent caret-navy-900 outline-none placeholder:text-navy-400 disabled:cursor-not-allowed"
          />
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={!value.trim() || disabled || sending}
          aria-label="Send"
          className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-full bg-brand-500 text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
        </button>
      </div>
      <p className="mt-1.5 px-1 text-[11px] text-navy-500">
        <kbd className="font-semibold">@</kbd> records · <kbd className="font-semibold">/</kbd> jobs · ↑↓ to choose · Enter to send · Shift+Enter for a new line
      </p>
    </div>
  )
}
