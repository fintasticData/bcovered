import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUp, Bot, Loader2, User } from 'lucide-react'
import type { MessageView } from '@/api/client'
import { cn } from '@/lib/utils'

interface Props {
  title: string
  subtitle?: string
  avatar?: ReactNode
  messages: MessageView[]
  sending: boolean
  onSend: (text: string) => void
  placeholder?: string
  disabled?: boolean
  error?: string | null
  renderExtra?: (m: MessageView) => ReactNode
  headerAction?: ReactNode
  footerNote?: ReactNode
}

export function ChatPanel({
  title,
  subtitle,
  avatar,
  messages,
  sending,
  onSend,
  placeholder = 'Type a message…',
  disabled,
  error,
  renderExtra,
  headerAction,
  footerNote,
}: Props) {
  const [text, setText] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const last = messages[messages.length - 1]
  const quick = !sending && last?.role === 'assistant' ? last.quick_replies : []

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages.length, sending])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const t = text.trim()
    if (!t || sending || disabled) return
    onSend(t)
    setText('')
  }

  return (
    <section className="panel flex h-full min-h-0 flex-col overflow-hidden" aria-label={title}>
      <header className="flex items-center gap-3 border-b border-navy-800/10 px-4 py-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-500 text-white">
          {avatar ?? <Bot className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-navy-900">{title}</h2>
          {subtitle && <p className="truncate text-xs text-navy-600/80">{subtitle}</p>}
        </div>
        {headerAction}
      </header>

      <div ref={listRef} className="scroll-area flex-1 space-y-4 px-4 py-4" aria-live="polite">
        {messages.map((m) => (
          <div key={m.id} className={cn('flex gap-2.5', m.role === 'user' && 'flex-row-reverse')}>
            <span
              className={cn(
                'mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full',
                m.role === 'user' ? 'bg-navy-100 text-navy-700' : 'bg-brand-50 text-brand-700',
              )}
              aria-hidden
            >
              {m.role === 'user' ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
            </span>
            <div className={cn('max-w-[85%] space-y-2', m.role === 'user' && 'items-end text-right')}>
              <div
                className={cn(
                  'inline-block whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-left text-sm leading-relaxed',
                  m.role === 'user' ? 'rounded-tr-sm bg-navy-800 text-white' : 'rounded-tl-sm bg-mist text-navy-900',
                )}
              >
                {m.content}
              </div>
              {m.links.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {m.links.map((l) => (
                    <Link key={l.to} to={l.to} className="text-xs font-semibold text-brand-600 underline">
                      {l.label}
                    </Link>
                  ))}
                </div>
              )}
              {renderExtra?.(m)}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex items-center gap-2 text-xs text-navy-600">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Working…
          </div>
        )}
      </div>

      {quick.length > 0 && (
        <div className="scroll-x flex gap-2 border-t border-navy-800/5 px-4 pt-3 sm:flex-wrap">
          {quick.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => onSend(q)}
              disabled={disabled}
              className="shrink-0 cursor-pointer rounded-full border border-brand-500/30 bg-brand-50 px-3 py-1.5 text-xs font-medium whitespace-nowrap text-brand-700 transition hover:border-brand-500 disabled:opacity-50 sm:whitespace-normal"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={submit} className="flex items-center gap-2 px-4 py-3">
        <label className="sr-only" htmlFor={`chat-${title}`}>
          Message {title}
        </label>
        <input
          id={`chat-${title}`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className="field flex-1 rounded-full py-2.5"
          autoComplete="off"
        />
        <button
          type="submit"
          disabled={!text.trim() || sending || disabled}
          aria-label="Send"
          className="grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-full bg-brand-500 text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      </form>
      {(error || footerNote) && (
        <div className="px-4 pb-3 text-[11px] text-navy-600/70">
          {error && <p className="mb-1 font-medium text-red-600">{error}</p>}
          {footerNote}
        </div>
      )}
    </section>
  )
}
