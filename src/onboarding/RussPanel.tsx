import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Check, FileSearch, ListChecks, MessageSquare, MessagesSquare, Send, Sparkles, X } from 'lucide-react'
import type { OnboardingView, RussAction } from '@/api/client'
import { useAskRuss, useDecideExtraction, useRussPanel } from '@/api/hooks'
import { StatusBadge } from '@/components/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn, formatDateTime } from '@/lib/utils'
import { RUSS_SUGGESTIONS } from '@/server/agents/onboardingRuss'

interface ChatLine {
  id: number
  role: 'user' | 'russ'
  text: string
  actions?: RussAction[]
}

function ActionChips({ actions }: { actions: RussAction[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((a) =>
        a.enabled ? (
          <Link key={a.key} to={a.to} className="inline-flex items-center gap-1 rounded-full border border-brand-500/40 bg-brand-50 px-3 py-1.5 text-[11px] font-semibold text-brand-700 hover:border-brand-500">
            {a.label} <ArrowRight className="h-3 w-3" />
          </Link>
        ) : (
          <span key={a.key} title={a.reason ?? undefined} className="inline-flex cursor-not-allowed items-center rounded-full border border-navy-800/10 px-3 py-1.5 text-[11px] font-semibold text-navy-400">
            {a.label}
          </span>
        ),
      )}
    </div>
  )
}

export function RussPanel({ view, onShowField }: { view: OnboardingView; onShowField: (path: string) => void }) {
  const [tab, setTab] = useState('chat')
  const { data: panel } = useRussPanel()
  const ask = useAskRuss()
  const decide = useDecideExtraction()
  const [draft, setDraft] = useState('')
  const [lines, setLines] = useState<ChatLine[]>([
    {
      id: 0,
      role: 'russ',
      text: `Hi, I’m Russ. I’ll help you set up ${view.organisation.name}: what’s required, what’s missing, reading your documents and preparing your import. I suggest; you confirm. I only see this brokerage’s onboarding records.`,
    },
  ])
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => endRef.current?.scrollIntoView({ block: 'end' }), [lines.length])

  const pending = view.proposals.filter((p) => p.status === 'suggested')
  const openFeedback = view.feedback.filter((f) => !f.resolved_at)
  const canEdit = view.capabilities.includes('edit_setup') && ['draft', 'information_required'].includes(view.application.status)

  const send = (text: string) => {
    const message = text.trim()
    if (!message) return
    const id = Date.now()
    setLines((l) => [...l, { id, role: 'user', text: message }])
    setDraft('')
    ask.mutate(message, {
      onSuccess: (r) => setLines((l) => [...l, { id: id + 1, role: 'russ', text: r.reply, actions: r.actions }]),
      onError: (e) => setLines((l) => [...l, { id: id + 1, role: 'russ', text: e.message }]),
    })
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    send(draft)
  }

  return (
    <section className="panel flex h-full min-h-0 flex-col overflow-hidden" aria-label="Russ onboarding assistant">
      <div className="flex items-center gap-2 border-b border-navy-800/10 px-4 py-3">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500 text-white">
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-navy-900">Russ · onboarding</h2>
          <p className="truncate text-[11px] text-navy-600">Explains requirements, reads documents, guides your import</p>
        </div>
      </div>
      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
        <TabsList className="mx-3 mt-3">
          <TabsTrigger value="chat">
            <MessageSquare className="h-3.5 w-3.5" /> Chat
          </TabsTrigger>
          <TabsTrigger value="suggestions">
            <FileSearch className="h-3.5 w-3.5" /> Suggestions{pending.length ? ` (${pending.length})` : ''}
          </TabsTrigger>
          <TabsTrigger value="tasks">
            <ListChecks className="h-3.5 w-3.5" /> Tasks
          </TabsTrigger>
          <TabsTrigger value="review">
            <MessagesSquare className="h-3.5 w-3.5" /> Review{openFeedback.length ? ` (${openFeedback.length})` : ''}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="chat" className="flex min-h-0 flex-1 flex-col">
          <div className="scroll-area flex-1 space-y-3 px-4 py-3" aria-live="polite">
            {lines.map((l) => (
              <div key={l.id} className={cn('max-w-[92%] rounded-2xl px-3 py-2 text-sm whitespace-pre-line', l.role === 'user' ? 'ml-auto bg-navy-800 text-white' : 'bg-mist text-navy-900')}>
                {l.text}
                {l.actions && l.actions.length > 0 && (
                  <div className="mt-2">
                    <ActionChips actions={l.actions} />
                  </div>
                )}
              </div>
            ))}
            {ask.isPending && <p className="text-xs text-navy-500">Russ is checking your records…</p>}
            <div ref={endRef} />
          </div>
          <div className="space-y-2 border-t border-navy-800/10 px-3 py-3">
            <div className="scroll-x flex gap-2">
              {RUSS_SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => send(s)} className="shrink-0 cursor-pointer rounded-full border border-navy-800/10 bg-white px-3 py-1 text-[11px] text-navy-700 hover:border-brand-500">
                  {s}
                </button>
              ))}
            </div>
            <form onSubmit={submit} className="flex gap-2">
              <label htmlFor="russ-onboarding-input" className="sr-only">
                Ask Russ
              </label>
              <input
                id="russ-onboarding-input"
                className="min-w-0 flex-1 rounded-xl border border-navy-800/15 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                placeholder="Ask about requirements, documents or your import"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={500}
              />
              <button type="submit" className="grid h-10 w-10 cursor-pointer place-items-center rounded-xl bg-brand-500 text-white disabled:opacity-50" disabled={!draft.trim() || ask.isPending} aria-label="Send">
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        </TabsContent>

        <TabsContent value="suggestions" className="scroll-area min-h-0 flex-1 space-y-3 px-4 py-3">
          <p className="text-xs text-navy-600">Values Russ found in your documents. Nothing changes until you apply it to your draft. Applied and dismissed suggestions stay on record with their source.</p>
          {view.proposals.length === 0 && (
            <p className="rounded-xl border border-dashed border-navy-800/15 p-4 text-center text-xs text-navy-600">
              No suggestions. Russ suggests a value when a document has a labelled detail (for example “Registration number:” or “FSP number:”) that differs from your draft.
            </p>
          )}
          {view.proposals.map((p) => (
            <article key={p.id} className={cn('rounded-xl border p-3', p.status === 'suggested' ? 'border-brand-500/30 bg-white' : 'border-navy-800/10 bg-mist/60')}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button type="button" onClick={() => onShowField(p.target_field)} className="cursor-pointer text-left text-sm font-semibold text-navy-900 underline-offset-2 hover:underline">
                  {p.field_label}
                </button>
                <span className="flex items-center gap-1">
                  <Badge tone={p.method === 'parsed' ? 'info' : 'warning'} title={p.method === 'parsed' ? 'Read from the text of the document' : 'No text could be read; fictional sample value'}>
                    {p.method === 'parsed' ? 'Read from document' : 'Simulated extraction'}
                  </Badge>
                  <StatusBadge status={p.status} />
                </span>
              </div>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                <dt className="text-navy-500">Current</dt>
                <dd className="text-navy-800">{p.current_value ? String(p.current_value) : <em className="text-navy-400">empty</em>}</dd>
                <dt className="text-navy-500">Suggested</dt>
                <dd className="font-semibold text-navy-900">{String(p.suggested_value)}</dd>
                <dt className="text-navy-500">Source</dt>
                <dd className="text-navy-700">
                  {p.document_name}
                  {p.source_page ? `, ${p.source_page}` : ''}: “{p.source_excerpt}”
                </dd>
              </dl>
              {p.status === 'suggested' && canEdit && (
                <div className="mt-3 flex gap-2">
                  <button type="button" className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50" disabled={decide.isPending} onClick={() => decide.mutate({ proposal_id: p.id, decision: 'apply' }, { onSuccess: () => onShowField(p.target_field) })}>
                    <Check className="h-3.5 w-3.5" /> Apply to draft
                  </button>
                  <button type="button" className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-navy-800/15 px-3 py-1.5 text-xs font-semibold text-navy-700 disabled:opacity-50" disabled={decide.isPending} onClick={() => decide.mutate({ proposal_id: p.id, decision: 'dismiss' })}>
                    <X className="h-3.5 w-3.5" /> Dismiss
                  </button>
                </div>
              )}
            </article>
          ))}
          {decide.error && <p className="text-xs text-red-600">{decide.error.message}</p>}
        </TabsContent>

        <TabsContent value="tasks" className="scroll-area min-h-0 flex-1 space-y-3 px-4 py-3">
          {panel && <ActionChips actions={panel.actions} />}
          <ul className="space-y-2">
            {panel?.tasks.map((t) => (
              <li key={t.key}>
                <Link to={t.to} className={cn('block rounded-xl border p-3 hover:border-brand-500', t.tone === 'warning' ? 'border-amber-200 bg-amber-50/60' : t.tone === 'success' ? 'border-emerald-200 bg-emerald-50/60' : 'border-navy-800/10 bg-white')}>
                  <span className="block text-sm font-medium text-navy-900">{t.label}</span>
                  <span className="block text-[11px] text-navy-600">{t.detail}</span>
                </Link>
              </li>
            ))}
          </ul>
        </TabsContent>

        <TabsContent value="review" className="scroll-area min-h-0 flex-1 space-y-3 px-4 py-3">
          <p className="text-xs text-navy-600">Feedback from B-Covered reviewers. Fix each point, then resubmit from Readiness.</p>
          {view.feedback.length === 0 && <p className="rounded-xl border border-dashed border-navy-800/15 p-4 text-center text-xs text-navy-600">No reviewer feedback yet.</p>}
          {view.feedback.map((f) => (
            <article key={f.id} className={cn('rounded-xl border p-3 text-sm', f.resolved_at ? 'border-navy-800/10 bg-mist/60 text-navy-600' : 'border-amber-200 bg-amber-50/60 text-navy-900')}>
              {f.requirement_label && <p className="text-[11px] font-semibold text-navy-500">{f.requirement_label}</p>}
              <p>{f.body}</p>
              <p className="mt-1 text-[11px] text-navy-500">
                {f.author_name} · {formatDateTime(f.created_at)}
                {f.resolved_at && ` · resolved on resubmission`}
              </p>
            </article>
          ))}
          <h3 className="pt-2 text-xs font-semibold tracking-wide text-navy-500 uppercase">History</h3>
          <ol className="space-y-1.5">
            {view.history.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-2 text-xs text-navy-700">
                <StatusBadge status={h.to_status} /> {formatDateTime(h.created_at)}
                {h.actor_name && <span className="text-navy-500">· {h.actor_name}</span>}
                {h.reason && <span className="w-full text-navy-600">{h.reason}</span>}
              </li>
            ))}
          </ol>
        </TabsContent>
      </Tabs>
    </section>
  )
}
