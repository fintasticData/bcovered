import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Bot,
  Loader2,
  MessageSquare,
  Phone,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import {
  newConciergeKey,
  useCommsInbox,
  useConciergeHome,
  useConciergeMutations,
  useConciergeRequest,
  type CommsInboxThread,
  type CommsThreadKind,
  type ConciergeRequestDetail,
} from '@/api/concierge'
import { useConversation, useSendMessage } from '@/api/hooks'
import { usePersistentConversation } from '@/api/conversations'
import { Button } from '@/components/ui/button'
import type { DataCategory } from '@/lib/supabase/category'
import { cn } from '@/lib/utils'
import { getAssistantAdapter } from '@/server/llm'

type SelectedKey = 'ava' | `cg:${string}`

const KIND_CHIP: Record<CommsThreadKind, { label: string; className: string }> = {
  ava: { label: 'Ava', className: 'bg-violet-100 text-violet-950' },
  concierge: { label: 'Concierge', className: 'bg-amber-100 text-amber-950' },
  claim: { label: 'Claim', className: 'bg-orange-100 text-orange-950' },
  quote: { label: 'Quote', className: 'bg-sky-100 text-sky-950' },
  request: { label: 'Request', className: 'bg-navy-100 text-navy-800' },
}

function shortTime(iso: string | null | undefined) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-ZA', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** WhatsApp-style Cover inbox: concierge/staff + Ava + claim/quote-linked threads. */
export function CustomerPageCommsPanel({
  category,
  basePath,
  conciergeEnabled,
  greetingName,
}: {
  category: DataCategory
  basePath: '/my' | '/demo/my'
  conciergeEnabled?: boolean
  greetingName?: string
}) {
  const [params, setParams] = useSearchParams()
  const inbox = useCommsInbox({ categoryOverride: category, enabled: true })
  const home = useConciergeHome({
    categoryOverride: category,
    enabled: Boolean(conciergeEnabled ?? inbox.data?.concierge_enabled),
  })
  const mut = useConciergeMutations({ categoryOverride: category })
  const [query, setQuery] = useState('')
  const [mobileShowChat, setMobileShowChat] = useState(false)
  const [selected, setSelected] = useState<SelectedKey | null>(null)

  const threadParam = params.get('thread')
  const claimId = params.get('claimId')
  const quoteRequestId = params.get('quoteRequestId')

  const { conversationId, error: avaStartError } = usePersistentConversation('portal', 'ava')
  const { data: avaView } = useConversation(conversationId)
  const avaSend = useSendMessage(conversationId)
  const lastAva = avaView?.messages?.[avaView.messages.length - 1]

  const conciergeName =
    home.data?.concierge?.name ?? inbox.data?.concierge_name ?? 'Your concierge'
  const conciergeFirst = conciergeName.split(' ')[0]

  // Open subject chat when URL carries claim/quote
  useEffect(() => {
    if (!claimId && !quoteRequestId) return
    const key = newConciergeKey()
    mut.openSubjectChat.mutate(
      { claimId, quoteRequestId, key },
      {
        onSuccess: (r) => {
          setSelected(`cg:${r.id}`)
          setMobileShowChat(true)
          setParams(
            (prev) => {
              const next = new URLSearchParams(prev)
              next.set('tab', 'comms')
              next.set('thread', r.id)
              next.delete('claimId')
              next.delete('quoteRequestId')
              return next
            },
            { replace: true },
          )
        },
      },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claimId, quoteRequestId])

  // Honour ?thread=ava | request id | concierge
  useEffect(() => {
    if (claimId || quoteRequestId) return
    if (!threadParam) return
    if (threadParam === 'ava') {
      setSelected('ava')
      setMobileShowChat(true)
      return
    }
    if (threadParam === 'concierge') {
      mut.openChat.mutate(newConciergeKey(), {
        onSuccess: (r) => {
          setSelected(`cg:${r.id}`)
          setMobileShowChat(true)
          setParams(
            (prev) => {
              const next = new URLSearchParams(prev)
              next.set('tab', 'comms')
              next.set('thread', r.id)
              return next
            },
            { replace: true },
          )
        },
      })
      return
    }
    setSelected(`cg:${threadParam}`)
    setMobileShowChat(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadParam])

  const staffThreads = inbox.data?.threads ?? []

  const listRows = useMemo(() => {
    const avaRow: {
      key: SelectedKey
      kind: CommsThreadKind
      title: string
      preview: string
      at: string | null
      subtitle: string
    } = {
      key: 'ava',
      kind: 'ava',
      title: 'Ava',
      preview: lastAva?.content?.slice(0, 80) || 'Your workspace helper · not a licensed adviser',
      at: lastAva?.created_at ?? null,
      subtitle: 'Helper',
    }

    const rows = [
      avaRow,
      ...staffThreads.map((t) => ({
        key: `cg:${t.id}` as SelectedKey,
        kind: t.thread_kind,
        title: t.title,
        preview: t.last_body?.slice(0, 80) || t.next_action || 'No messages yet',
        at: t.last_at ?? t.sort_at ?? t.updated_at,
        subtitle: t.owner_name ?? conciergeName,
        thread: t,
      })),
    ]

    const q = query.trim().toLowerCase()
    const filtered = q
      ? rows.filter(
          (r) =>
            r.title.toLowerCase().includes(q) ||
            r.preview.toLowerCase().includes(q) ||
            r.subtitle.toLowerCase().includes(q),
        )
      : rows

    return filtered.sort((a, b) => {
      const ta = a.at ? new Date(a.at).getTime() : 0
      const tb = b.at ? new Date(b.at).getTime() : 0
      if (a.key === 'ava' && !lastAva) return 1
      return tb - ta
    })
  }, [staffThreads, lastAva, query, conciergeName])

  const selectRow = (key: SelectedKey, threadId?: string) => {
    setSelected(key)
    setMobileShowChat(true)
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('tab', 'comms')
        next.set('thread', key === 'ava' ? 'ava' : threadId ?? key.replace(/^cg:/, ''))
        return next
      },
      { replace: true },
    )
  }

  const openConcierge = () => {
    mut.openChat.mutate(newConciergeKey(), {
      onSuccess: (r) => selectRow(`cg:${r.id}`, r.id),
    })
  }

  const selectedRequestId = selected?.startsWith('cg:') ? selected.slice(3) : null
  const selectedThread = staffThreads.find((t) => t.id === selectedRequestId)

  return (
    <section
      aria-label="Comms"
      className="overflow-hidden rounded-2xl border border-navy-800/10 bg-white shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-navy-800/10 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-navy-900">Comms</h2>
          <p className="text-xs text-navy-600">
            Chat with {conciergeFirst} or Ava
            {greetingName ? ` · Hi ${greetingName}` : ''}. Staff replies stay on your cover file.
          </p>
        </div>
        <p className="flex items-center gap-1.5 text-[11px] text-navy-600">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-700" />
          Concierge messages kept for FAIS
        </p>
      </div>

      <div className="grid min-h-[28rem] lg:grid-cols-[minmax(15rem,22rem)_minmax(0,1fr)]">
        {/* Thread list */}
        <div
          className={cn(
            'flex min-h-0 flex-col border-navy-800/10 lg:border-r',
            mobileShowChat && selected ? 'hidden lg:flex' : 'flex',
          )}
        >
          <div className="border-b border-navy-800/10 p-3">
            <label className="relative block">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-navy-400" />
              <input
                className="field w-full py-2 pr-3 pl-8 text-sm"
                placeholder="Search chats…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(inbox.data?.concierge_enabled || conciergeEnabled) && (
                <Button
                  type="button"
                  size="sm"
                  variant="accent"
                  disabled={mut.openChat.isPending}
                  onClick={openConcierge}
                >
                  <MessageSquare /> Message {conciergeFirst}
                </Button>
              )}
              <Button type="button" size="sm" variant="outline" onClick={() => selectRow('ava')}>
                <Bot /> Ask Ava
              </Button>
            </div>
          </div>

          <ul className="scroll-area flex-1 divide-y divide-navy-800/5" role="listbox" aria-label="Chat threads">
            {inbox.isLoading && (
              <li className="flex items-center gap-2 px-4 py-6 text-sm text-navy-600">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading chats…
              </li>
            )}
            {inbox.error && (
              <li className="px-4 py-4 text-sm text-red-700" role="alert">
                {(inbox.error as Error).message}
              </li>
            )}
            {!inbox.isLoading && listRows.length === 0 && (
              <li className="px-4 py-8 text-center text-sm text-navy-600">
                No chats yet. Message {conciergeFirst} or ask Ava.
              </li>
            )}
            {listRows.map((row) => {
              const chip = KIND_CHIP[row.kind]
              const active = selected === row.key
              return (
                <li key={row.key}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={cn(
                      'flex w-full gap-3 px-3 py-3 text-left transition hover:bg-navy-50/80',
                      active && 'bg-brand-50/70',
                    )}
                    onClick={() => selectRow(row.key, row.key.startsWith('cg:') ? row.key.slice(3) : undefined)}
                  >
                    <span
                      className={cn(
                        'grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold',
                        row.kind === 'ava' ? 'bg-violet-600 text-white' : 'bg-brand-900 text-white',
                      )}
                    >
                      {row.kind === 'ava' ? (
                        <Bot className="h-5 w-5" />
                      ) : (
                        row.title
                          .split(' ')
                          .map((p) => p[0])
                          .join('')
                          .slice(0, 2)
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-navy-950">{row.title}</span>
                        <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase', chip.className)}>
                          {chip.label}
                        </span>
                      </span>
                      <span className="mt-0.5 line-clamp-1 text-xs text-navy-600">{row.preview}</span>
                      <span className="mt-0.5 text-[10px] text-navy-500">
                        {row.subtitle}
                        {row.at ? ` · ${shortTime(row.at)}` : ''}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>

        {/* Active chat */}
        <div
          className={cn(
            'flex min-h-0 min-h-[24rem] flex-col',
            !mobileShowChat || !selected ? 'hidden lg:flex' : 'flex',
          )}
        >
          {!selected && (
            <div className="grid flex-1 place-items-center px-6 py-12 text-center">
              <div className="max-w-sm space-y-3">
                <Sparkles className="mx-auto h-8 w-8 text-amber-600" />
                <p className="text-sm font-semibold text-navy-900">Pick a chat</p>
                <p className="text-xs text-navy-600">
                  Ask {conciergeFirst} anything human (tyre size, call-back, docs). Use Ava for navigating quotes and
                  cover.
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {(inbox.data?.concierge_enabled || conciergeEnabled) && (
                    <Button type="button" size="sm" variant="accent" onClick={openConcierge}>
                      Message {conciergeFirst}
                    </Button>
                  )}
                  <Button type="button" size="sm" variant="outline" onClick={() => selectRow('ava')}>
                    Ask Ava
                  </Button>
                </div>
              </div>
            </div>
          )}

          {selected === 'ava' && (
            <AvaThreadPane
              conversationId={conversationId}
              messages={avaView?.messages ?? []}
              sending={avaSend.isPending}
              onSend={(t) => avaSend.mutate(t)}
              error={avaStartError ?? avaSend.error?.message ?? null}
              onBack={() => setMobileShowChat(false)}
            />
          )}

          {selectedRequestId && (
            <ConciergeThreadPane
              requestId={selectedRequestId}
              category={category}
              thread={selectedThread}
              conciergeName={conciergeName}
              basePath={basePath}
              onBack={() => setMobileShowChat(false)}
              onSent={() => void inbox.refetch()}
            />
          )}
        </div>
      </div>
    </section>
  )
}

function AvaThreadPane({
  conversationId,
  messages,
  sending,
  onSend,
  error,
  onBack,
}: {
  conversationId: string | null
  messages: Array<{ id: string; role: string; content: string; created_at?: string; quick_replies?: string[] }>
  sending: boolean
  onSend: (text: string) => void
  error: string | null
  onBack: () => void
}) {
  const [draft, setDraft] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const starters = ['Show me my quotes', 'I need a new comparison', 'What is waiting with my broker?']

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, sending])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!draft.trim() || sending || !conversationId) return
    onSend(draft.trim())
    setDraft('')
  }

  return (
    <>
      <header className="flex items-center gap-3 border-b border-navy-800/10 px-4 py-3">
        <Button type="button" size="sm" variant="ghost" className="lg:hidden" onClick={onBack}>
          Back
        </Button>
        <span className="grid h-9 w-9 place-items-center rounded-full bg-violet-600 text-white">
          <Bot className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-navy-900">Ava</p>
          <p className="truncate text-xs text-navy-600">Your workspace helper · not a licensed adviser</p>
        </div>
      </header>
      <div className="scroll-area flex-1 space-y-3 px-4 py-4">
        {messages.map((m) => (
          <div key={m.id} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div
              className={cn(
                'max-w-[85%] rounded-2xl px-3 py-2 text-sm',
                m.role === 'user'
                  ? 'rounded-br-md bg-brand-800 text-white'
                  : 'rounded-bl-md border border-navy-800/10 bg-navy-50 text-navy-900',
              )}
            >
              <p className="whitespace-pre-wrap">{m.content}</p>
            </div>
          </div>
        ))}
        {!messages.length && (
          <p className="text-center text-sm text-navy-600">Ask Ava about a quote, cover, or next step.</p>
        )}
        <div className="flex flex-wrap gap-1.5">
          {starters.map((s) => (
            <button
              key={s}
              type="button"
              className="rounded-full border border-navy-800/10 bg-white px-2.5 py-1 text-[11px] font-semibold text-navy-700 hover:bg-navy-50"
              onClick={() => onSend(s)}
              disabled={sending || !conversationId}
            >
              {s}
            </button>
          ))}
        </div>
        <div ref={bottomRef} />
      </div>
      <form onSubmit={submit} className="border-t border-navy-800/10 p-3">
        <textarea
          className="field min-h-[64px] text-sm"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask Ava about a quote, cover, or next step…"
          disabled={!conversationId || sending}
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-[10px] text-navy-500">
            {getAssistantAdapter().id === 'fal'
              ? 'Ava helps you navigate. A licensed broker confirms cover and price.'
              : 'Ava runs on the demo adapter in this build.'}
          </p>
          <Button type="submit" size="sm" disabled={!draft.trim() || sending || !conversationId}>
            {sending ? <Loader2 className="animate-spin" /> : null}
            Send
          </Button>
        </div>
        {error && (
          <p className="mt-1 text-xs text-red-700" role="alert">
            {error}
          </p>
        )}
      </form>
    </>
  )
}

function ConciergeThreadPane({
  requestId,
  category,
  thread,
  conciergeName,
  basePath,
  onBack,
  onSent,
}: {
  requestId: string
  category: DataCategory
  thread?: CommsInboxThread
  conciergeName: string
  basePath: '/my' | '/demo/my'
  onBack: () => void
  onSent: () => void
}) {
  const detail = useConciergeRequest(requestId, { categoryOverride: category })
  const mut = useConciergeMutations({ categoryOverride: category })
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const first = conciergeName.split(' ')[0]
  const data = detail.data

  const messages = useMemo(() => {
    const events = data?.events ?? []
    return events.filter((ev) => {
      if (!ev.body?.trim()) return false
      if (ev.event_type === 'status') return false
      if (ev.body.trim() === 'Request opened') return false
      return ev.event_type === 'message' || ev.event_type === 'created' || ev.event_type === 'info_request'
    })
  }, [data?.events])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, mut.message.isPending])

  const send = async (e: FormEvent) => {
    e.preventDefault()
    if (!draft.trim()) return
    setError(null)
    try {
      await mut.message.mutateAsync({ requestId, body: draft.trim(), key: newConciergeKey() })
      setDraft('')
      onSent()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send')
    }
  }

  const requestCall = async () => {
    setError(null)
    try {
      await mut.message.mutateAsync({
        requestId,
        body: 'Please call me about this.',
        key: newConciergeKey(),
      })
      onSent()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not request a call')
    }
  }

  const linkHref =
    thread?.linked_claim_id
      ? `${basePath}?tab=claims`
      : thread?.linked_quote_request_id
        ? `${basePath}?tab=quotes`
        : null
  const linkLabel =
    thread?.linked_claim_reference
      ? `Claim ${thread.linked_claim_reference}`
      : thread?.linked_quote_reference
        ? `Quote ${thread.linked_quote_reference}`
        : null

  return (
    <>
      <header className="flex items-center gap-3 border-b border-navy-800/10 px-4 py-3">
        <Button type="button" size="sm" variant="ghost" className="lg:hidden" onClick={onBack}>
          Back
        </Button>
        <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-900 text-xs font-bold text-white">
          {first.slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-navy-900">{data?.title ?? thread?.title ?? first}</p>
          <p className="truncate text-xs text-navy-600">
            {data?.owner_name ?? conciergeName}
            {data?.reference ? ` · ${data.reference}` : ''}
          </p>
        </div>
        {linkHref && linkLabel && (
          <Button size="sm" variant="outline" asChild>
            <Link to={linkHref}>{linkLabel}</Link>
          </Button>
        )}
      </header>

      <div className="scroll-area flex-1 space-y-3 px-4 py-4">
        {detail.isLoading && (
          <p className="flex items-center gap-2 text-sm text-navy-600">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </p>
        )}
        {data && <StaffBubbles detail={data} messages={messages} conciergeName={first} />}
        {!detail.isLoading && data && messages.length === 0 && (
          <p className="rounded-xl border border-dashed border-navy-800/15 bg-navy-50/40 px-3 py-6 text-center text-sm text-navy-600">
            Ask {first} anything — tyre size, a call-back, paperwork. Replies are saved to your file.
          </p>
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={send} className="border-t border-navy-800/10 p-3">
        <textarea
          className="field min-h-[64px] text-sm"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`Message ${first}…`}
          required
          disabled={mut.message.isPending}
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <Button type="submit" size="sm" className="bg-brand-800 text-white hover:bg-brand-900" disabled={mut.message.isPending || !draft.trim()}>
            {mut.message.isPending ? <Loader2 className="animate-spin" /> : null}
            Send
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => void requestCall()} disabled={mut.message.isPending}>
            <Phone /> Request a call
          </Button>
        </div>
        {error && (
          <p className="mt-1 text-xs text-red-700" role="alert">
            {error}
          </p>
        )}
      </form>
    </>
  )
}

function StaffBubbles({
  detail,
  messages,
  conciergeName,
}: {
  detail: ConciergeRequestDetail
  messages: ConciergeRequestDetail['events']
  conciergeName: string
}) {
  const staffNames = [detail.owner_name, detail.concierge_name].filter(Boolean)
  return (
    <ol className="space-y-3" aria-label="Conversation">
      {messages.map((ev) => {
        const mine = !ev.author || !staffNames.includes(ev.author)
        return (
          <li key={ev.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
            <div
              className={cn(
                'max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm',
                mine
                  ? 'rounded-br-md bg-brand-800 text-white'
                  : 'rounded-bl-md border border-navy-800/10 bg-white text-navy-900',
              )}
            >
              <p className="whitespace-pre-wrap">{ev.body}</p>
              <p className={cn('mt-1 text-[10px]', mine ? 'text-white/70' : 'text-navy-500')}>
                {ev.author ?? (mine ? 'You' : conciergeName)} · {shortTime(ev.created_at)}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
