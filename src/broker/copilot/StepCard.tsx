import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Ban, Building2, Check, CheckCircle2, CircleHelp, Copy, ExternalLink, FileText, PanelRightOpen, Search, UserRound } from 'lucide-react'
import { copilotApi, type EntityRef, type PolicyRef, type StepResult } from '@/copilot/api'
import { humanise } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { CategoryBadge, CopilotBadge } from './identity'
import { lineLabelOf } from './RecordViews'

const STATUS = {
  saved: { icon: CheckCircle2, tone: 'border-emerald-200 bg-emerald-50/60', iconTone: 'text-emerald-600', label: 'Saved' },
  retrieved: { icon: Search, tone: 'border-navy-800/10 bg-white', iconTone: 'text-brand-600', label: 'Retrieved' },
  needs_choice: { icon: CircleHelp, tone: 'border-amber-200 bg-amber-50/60', iconTone: 'text-amber-600', label: 'Needs your choice' },
  needs_input: { icon: CircleHelp, tone: 'border-amber-200 bg-amber-50/60', iconTone: 'text-amber-600', label: 'Needs information' },
  failed: { icon: AlertTriangle, tone: 'border-red-200 bg-red-50/60', iconTone: 'text-red-600', label: 'Not completed' },
  refused: { icon: Ban, tone: 'border-red-200 bg-red-50/60', iconTone: 'text-red-600', label: 'Refused' },
} as const

const isEntity = (c: EntityRef | PolicyRef): c is EntityRef => 'record_type' in c
const ENTITY_ICON: Record<EntityRef['record_type'], typeof UserRound> = {
  client: UserRound, account: Building2, policy: FileText, quote_option: FileText, team_member: UserRound, offer: FileText,
}
const ENTITY_LABEL: Partial<Record<EntityRef['record_type'], string>> = { client: 'Client', quote_option: 'Quote', team_member: 'Team member', offer: 'Offer' }

function StepLink({ link }: { link: StepResult['links'][number] }) {
  const [copied, setCopied] = useState(false)
  if (link.copy) {
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          void navigator.clipboard?.writeText(link.copy!).then(() => {
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1800)
          })
        }}
      >
        {copied ? <Check /> : <Copy />} {copied ? 'Copied' : link.label}
      </Button>
    )
  }
  if (/^https?:\/\//.test(link.to)) {
    return (
      <Button size="sm" variant="outline" asChild>
        <a href={link.to} target="_blank" rel="noreferrer">
          <ExternalLink /> {link.label}
        </a>
      </Button>
    )
  }
  return (
    <Button size="sm" variant={link.label === 'Open record' || link.label === 'Open client' || link.label === 'Open my workspace' ? 'default' : 'outline'} asChild>
      <Link to={link.to}>{link.label}</Link>
    </Button>
  )
}

function SubjectSearch({ step, onChoose }: { step: StepResult; onChoose: (c: EntityRef) => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<EntityRef[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const search = async (e: FormEvent) => {
    e.preventDefault()
    if (q.trim().length < 2) return
    setBusy(true)
    try {
      setResults(await copilotApi.search(q.trim(), step.category))
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-2">
      <form onSubmit={search} className="flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={step.input?.placeholder ?? 'Name or client number'} className="field flex-1 py-1.5 text-sm" aria-label="Search for the client or account" />
        <Button size="sm" type="submit" disabled={busy}>
          Search
        </Button>
      </form>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <ChoiceList choices={results} onChoose={(c) => isEntity(c) && onChoose(c)} />
    </div>
  )
}

function ChoiceList({ choices, onChoose }: { choices: Array<EntityRef | PolicyRef>; onChoose: (c: EntityRef | PolicyRef) => void }) {
  if (!choices.length) return null
  return (
    <ul className="space-y-1.5" role="list">
      {choices.map((c) =>
        isEntity(c) ? (
          <li key={`${c.record_type}:${c.id}`}>
            <button
              type="button"
              onClick={() => onChoose(c)}
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg border border-navy-800/10 bg-white px-3 py-2 text-left hover:border-brand-500"
            >
              {(() => {
                const Icon = ENTITY_ICON[c.record_type]
                return <Icon className="h-4 w-4 shrink-0 text-navy-500" aria-hidden />
              })()}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-navy-900">
                  {c.name} <span className="font-mono text-xs text-navy-600">{c.number}</span>
                </span>
                <span className="block truncate text-[11px] text-navy-500">
                  {c.record_type === 'client' ? (c.detail ?? 'Client') : (c.detail ?? ENTITY_LABEL[c.record_type] ?? humanise(c.record_type))}
                  {c.record_type !== 'account' && c.account ? ` · ${c.account.name} (${c.account.number})` : ''}
                </span>
              </span>
              <CategoryBadge category={c.category} />
            </button>
          </li>
        ) : (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onChoose(c)}
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg border border-navy-800/10 bg-white px-3 py-2 text-left hover:border-brand-500"
            >
              <FileText className="h-4 w-4 shrink-0 text-navy-500" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-sm font-semibold text-navy-900">{c.display_number}</span>
                <span className="block truncate text-[11px] text-navy-500">
                  {humanise(c.cover_type ?? '')} · {humanise(c.status)} · {lineLabelOf(c.line)}
                  {c.provider ? ` · ${c.provider}` : ''}
                </span>
              </span>
            </button>
          </li>
        ),
      )}
    </ul>
  )
}

export function StepCard({
  step,
  onChoose,
  onAnswer,
  onShow,
  selected,
  busy,
}: {
  step: StepResult
  onChoose: (choice: EntityRef | PolicyRef) => void
  onAnswer: (values: Record<string, string>) => void
  onShow?: () => void
  selected?: boolean
  busy?: boolean
}) {
  const s = STATUS[step.status]
  const [text, setText] = useState('')
  const answer = (e: FormEvent) => {
    e.preventDefault()
    if (!text.trim() || !step.input) return
    onAnswer({ [step.input.field]: text.trim() })
    setText('')
  }
  const r = step.receipt
  return (
    <div className={cn('rounded-xl border p-3 text-left text-sm', s.tone, selected && 'ring-2 ring-brand-500/40')}>
      <div className="flex items-start gap-2">
        <s.icon className={cn('mt-0.5 h-4 w-4 shrink-0', s.iconTone)} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="font-semibold text-navy-900">{step.title}</p>
            {step.handled_by !== 'ar' && <CopilotBadge id={step.handled_by} />}
            <CategoryBadge category={step.category} />
            <span className="text-[10px] font-semibold tracking-wide text-navy-500 uppercase">{s.label}</span>
          </div>
          <p className="mt-0.5 text-[11px] text-navy-500 italic">“{step.clause}”</p>
          <p className="mt-1 text-navy-800">{step.summary}</p>
        </div>
      </div>

      {r && (
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-white/80 p-2.5 text-xs">
          <div>
            <dt className="text-navy-500">Reference</dt>
            <dd className="font-mono font-semibold text-navy-900">{r.reference}</dd>
          </div>
          {r.client_number && (
            <div>
              <dt className="text-navy-500">Client</dt>
              <dd>
                {r.client_name} <span className="font-mono">{r.client_number}</span>
              </dd>
            </div>
          )}
          {r.account_number && (
            <div>
              <dt className="text-navy-500">Account</dt>
              <dd>
                {r.account_name} <span className="font-mono">{r.account_number}</span>
              </dd>
            </div>
          )}
          {r.policy_number && (
            <div>
              <dt className="text-navy-500">Policy</dt>
              <dd className="font-mono">{r.policy_number}</dd>
            </div>
          )}
          {r.replayed && <p className="col-span-2 text-[11px] text-navy-600">Already saved by an earlier attempt; nothing was written twice.</p>}
        </dl>
      )}

      {step.choices && step.choices.length > 0 && (
        <div className="mt-2">
          <ChoiceList choices={step.choices} onChoose={onChoose} />
        </div>
      )}

      {step.input && step.input.kind === 'confirm' && (
        <Button size="sm" variant="outline" className="mt-2" disabled={busy} onClick={() => onAnswer({ [step.input!.field]: 'true' })}>
          {step.input.label}
        </Button>
      )}
      {step.input && step.input.field === 'subject' && (
        <div className="mt-2">
          <SubjectSearch step={step} onChoose={onChoose} />
        </div>
      )}
      {step.input && step.input.kind !== 'confirm' && step.input.field !== 'subject' && step.input.field !== 'text' && (
        <form onSubmit={answer} className="mt-2 flex gap-2">
          {step.input.field === 'body' ? (
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder={step.input.placeholder} aria-label={step.input.label} className="field flex-1 resize-none py-1.5 text-sm" />
          ) : (
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder={step.input.placeholder} aria-label={step.input.label} className="field flex-1 py-1.5 text-sm" />
          )}
          <Button size="sm" type="submit" disabled={busy || !text.trim()}>
            {step.input.field === 'body' ? 'Save note' : 'Continue'}
          </Button>
        </form>
      )}

      {(step.links.length > 0 || onShow) && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {step.links.map((l) => (
            <StepLink key={l.to + l.label} link={l} />
          ))}
          {onShow && step.data !== undefined && (
            <button type="button" onClick={onShow} className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">
              <PanelRightOpen className="h-3.5 w-3.5" /> Show in editor
            </button>
          )}
        </div>
      )}
    </div>
  )
}
