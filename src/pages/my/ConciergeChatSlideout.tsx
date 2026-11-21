import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, Phone, ShieldCheck } from 'lucide-react'
import {
  newConciergeKey,
  useConciergeMutations,
  useConciergeRequest,
  type ConciergeHome,
  type ConciergeRequestDetail,
} from '@/api/concierge'
import { RightSlideout } from '@/broker/shared/RightSlideout'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { usePortalBasePath, usePortalCategory } from '@/pages/my/CustomerLayout'

type Prefill = 'message' | 'callback'

/** In-app concierge chat on Cover — messages persist for FAIS via client_interactions. */
export function ConciergeChatSlideout({
  open,
  onClose,
  home,
  prefill = 'message',
}: {
  open: boolean
  onClose: () => void
  home: ConciergeHome | undefined
  prefill?: Prefill
}) {
  const basePath = usePortalBasePath()
  const category = usePortalCategory()
  const mut = useConciergeMutations({ categoryOverride: category })
  const [requestId, setRequestId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [bootKey] = useState(() => newConciergeKey())
  const bottomRef = useRef<HTMLDivElement>(null)
  const openedForPrefill = useRef<Prefill | null>(null)

  const detail = useConciergeRequest(requestId ?? undefined, { categoryOverride: category })
  const concierge = home?.concierge
  const first = concierge?.name?.split(' ')[0] ?? 'your concierge'

  useEffect(() => {
    if (!open) {
      openedForPrefill.current = null
      return
    }
    setError(null)
    if (prefill === 'callback') {
      setDraft('Please call me about my cover.')
    } else if (openedForPrefill.current !== prefill) {
      setDraft('')
    }
    openedForPrefill.current = prefill

    if (requestId) return
    mut.openChat.mutate(bootKey, {
      onSuccess: (r) => setRequestId(r.id),
      onError: (e) => setError(e instanceof Error ? e.message : 'Could not open chat'),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open once per slideout session
  }, [open, prefill])

  useEffect(() => {
    if (!open) return
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [open, detail.data?.events?.length, mut.message.isPending])

  const messages = useMemo(() => {
    const events = detail.data?.events ?? []
    return events.filter((ev) => {
      if (!ev.body?.trim()) return false
      if (ev.event_type === 'status') return false
      if (ev.body.trim() === 'Request opened') return false
      return ev.event_type === 'message' || ev.event_type === 'created' || ev.event_type === 'info_request'
    })
  }, [detail.data?.events])

  const send = async (e: FormEvent) => {
    e.preventDefault()
    if (!requestId || !draft.trim()) return
    setError(null)
    const body = draft.trim()
    try {
      await mut.message.mutateAsync({ requestId, body, key: newConciergeKey() })
      setDraft('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send')
    }
  }

  const requestCall = async () => {
    if (!requestId) return
    setError(null)
    try {
      await mut.message.mutateAsync({
        requestId,
        body: 'Please call me about this.',
        key: newConciergeKey(),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not request a call')
    }
  }

  const booting = open && !requestId && (mut.openChat.isPending || !mut.openChat.isError)

  return (
    <RightSlideout
      open={open}
      onClose={onClose}
      title={`Message ${first}`}
      subtitle={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span>Your concierge · stays on Cover</span>
          {detail.data?.reference && (
            <span className="font-mono text-[11px] text-navy-500">{detail.data.reference}</span>
          )}
        </span>
      }
      size="wide"
      footer={
        <form onSubmit={send} className="flex w-full flex-col gap-2">
          <textarea
            className="field min-h-[72px] text-sm"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Message ${first}…`}
            disabled={!requestId || mut.message.isPending}
            required
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="submit"
              size="sm"
              className="bg-brand-800 text-white hover:bg-brand-900"
              disabled={!requestId || !draft.trim() || mut.message.isPending}
            >
              {mut.message.isPending ? <Loader2 className="animate-spin" /> : null}
              Send
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void requestCall()}
              disabled={!requestId || mut.message.isPending}
            >
              <Phone /> Request a call
            </Button>
            <Button type="button" size="sm" variant="ghost" asChild>
              <Link to={`${basePath}/concierge`}>All requests</Link>
            </Button>
          </div>
          {error && (
            <p className="text-xs text-red-700" role="alert">
              {error}
            </p>
          )}
        </form>
      }
    >
      <div className="flex h-full min-h-0 flex-col gap-3">
        <p className="flex items-start gap-2 rounded-lg border border-emerald-200/80 bg-emerald-50/60 px-3 py-2 text-[11px] text-navy-700">
          <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0 text-emerald-700" />
          Messages are kept permanently for FAIS record keeping on your client file. Live entries cannot be edited or
          deleted.
        </p>

        {booting && (
          <p className="flex items-center gap-2 text-sm text-navy-600">
            <Loader2 className="h-4 w-4 animate-spin" /> Opening chat with {first}…
          </p>
        )}

        {mut.openChat.isError && !requestId && (
          <p className="text-sm text-red-700" role="alert">
            {(mut.openChat.error as Error)?.message ?? 'Could not open chat'}
          </p>
        )}

        {requestId && detail.isLoading && (
          <p className="flex items-center gap-2 text-sm text-navy-600">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading messages…
          </p>
        )}

        {detail.data && <ChatThread detail={detail.data} messages={messages} conciergeName={first} />}
        <div ref={bottomRef} />
      </div>
    </RightSlideout>
  )
}

function ChatThread({
  detail,
  messages,
  conciergeName,
}: {
  detail: ConciergeRequestDetail
  messages: ConciergeRequestDetail['events']
  conciergeName: string
}) {
  if (!messages.length) {
    return (
      <p className="rounded-xl border border-dashed border-navy-800/15 bg-navy-50/40 px-3 py-6 text-center text-sm text-navy-600">
        Say hello to {conciergeName}. Your conversation is saved to your cover file.
      </p>
    )
  }

  return (
    <ol className="space-y-3" aria-label="Concierge chat">
      {messages.map((ev) => {
        const staffNames = [detail.owner_name, detail.concierge_name].filter(Boolean)
        const mine = !ev.author || !staffNames.includes(ev.author)
        return (
          <li
            key={ev.id}
            className={cn('flex', mine ? 'justify-end' : 'justify-start')}
          >
            <div
              className={cn(
                'max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm',
                mine
                  ? 'rounded-br-md bg-brand-800 text-white'
                  : 'rounded-bl-md border border-navy-800/10 bg-white text-navy-900',
              )}
            >
              <p className="whitespace-pre-wrap">{ev.body}</p>
              <p
                className={cn(
                  'mt-1 text-[10px]',
                  mine ? 'text-white/70' : 'text-navy-500',
                )}
              >
                {ev.author ?? (mine ? 'You' : conciergeName)} ·{' '}
                {new Date(ev.created_at).toLocaleString('en-ZA', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
