import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Eye, Maximize2, Minimize2, PenLine, Sparkles } from 'lucide-react'
import { useAdvice, useApplySuggestion, useRequestSignoff, useUpdateAdviceSection } from '@/api/hooks'
import { StatusBadge } from '@/components/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ROA_SECTION_LABEL, ROA_SECTIONS, type RoaSection } from '@/server/db/lifeSchema'
import { cn, formatDateTime } from '@/lib/utils'
import { ErrorState, LoadingState } from '../PageHeader'
import { BasisBadge, Notice, zar } from '../shared/ui'

export default function AdvicePage() {
  const { roaId } = useParams()
  const { data, isLoading, error } = useAdvice(roaId)
  const apply = useApplySuggestion()
  const save = useUpdateAdviceSection()
  const signoff = useRequestSignoff()
  const [expanded, setExpanded] = useState(false)
  const [preview, setPreview] = useState(false)
  const [focus, setFocus] = useState<RoaSection | null>(null)
  const [drafts, setDrafts] = useState<Partial<Record<RoaSection, string>>>({})
  const refs = useRef<Partial<Record<RoaSection, HTMLDivElement | null>>>({})

  useEffect(() => {
    if (focus) refs.current[focus]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [focus])

  if (isLoading) return <LoadingState />
  if (error || !data) return <div className="p-6"><ErrorState message={error?.message ?? 'Not found'} /></div>
  const { roa } = data
  const editable = ['draft', 'awaiting_approval'].includes(roa.status)
  const pending = data.approvals.find((a) => a.status === 'pending')
  const dirty = Object.entries(drafts).some(([k, v]) => v !== roa.content[k as RoaSection])
  const suggestions = ROA_SECTIONS.filter((s) => roa.suggestions[s])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={cn('grid min-h-0 flex-1 gap-4 p-3 sm:p-4', !expanded && 'lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]')}>
        {!expanded && (
          <aside className="panel scroll-area flex min-h-0 flex-col gap-4 overflow-y-auto p-4" aria-label="Russ">
            <header className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-500 text-white">
                <Sparkles className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-semibold text-navy-900">Russ</p>
                <p className="text-xs text-navy-600">Prepared this draft for {data.adviser.name} to review</p>
              </div>
            </header>
            <Notice>
              Russ drafts and suggests. The authorised adviser ({data.adviser.category}) is responsible for the advice and signs it off. Nothing reaches the client before sign-off.
            </Notice>
            <div>
              <p className="mb-2 text-xs font-semibold text-navy-700">Suggested wording</p>
              {suggestions.length ? (
                suggestions.map((s) => (
                  <div key={s} className={cn('mb-3 rounded-xl border p-3', focus === s ? 'border-brand-500 bg-brand-50/60' : 'border-navy-800/10')}>
                    <div className="flex items-center justify-between gap-2">
                      <button type="button" onClick={() => setFocus(s)} className="cursor-pointer text-left text-xs font-semibold text-brand-700 underline">
                        {ROA_SECTION_LABEL[s]}
                      </button>
                      <Badge tone="accent">Suggested</Badge>
                    </div>
                    <p className="mt-1 text-sm text-navy-800">{roa.suggestions[s]}</p>
                    <Button size="sm" variant="accent" className="mt-2" disabled={!editable || apply.isPending} onClick={() => apply.mutate({ roa_id: roa.id, section: s }, { onSuccess: () => setFocus(s) })}>
                      Apply to draft
                    </Button>
                  </div>
                ))
              ) : (
                <p className="text-sm text-navy-500">No open suggestions.</p>
              )}
              {apply.error && <p className="text-xs text-red-600">{apply.error.message}</p>}
            </div>
            {data.needs && (
              <div>
                <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-navy-700">
                  Needs analysis <BasisBadge basis="calculated" />
                </p>
                <ul className="space-y-1 text-xs text-navy-700">
                  {data.needs.needs.map((n) => (
                    <li key={n.benefit_type_key}>
                      {n.label}: shortfall <strong>{zar(n.shortfall)}</strong> ({n.basis})
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {data.options.length > 0 && (
              <div>
                <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-navy-700">
                  Options considered <BasisBadge basis="simulated" />
                </p>
                <ul className="space-y-1 text-xs text-navy-700">
                  {data.options.map((o) => (
                    <li key={o.id} className={o.id === roa.recommended_option_id ? 'font-semibold text-navy-900' : undefined}>
                      {o.label}: {zar(o.monthly_premium)} pm{o.id === roa.recommended_option_id ? ' · recommended' : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        )}

        <section className="panel flex min-h-0 flex-col overflow-hidden" aria-label="Record of Advice editor">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-navy-800/10 px-4 py-3">
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold text-navy-900">
                Record of Advice · {data.person.first_names} {data.person.surname} · v{roa.version}
              </h1>
              <p className="flex flex-wrap items-center gap-2 text-xs text-navy-600">
                <StatusBadge status={roa.status} />
                {roa.status !== 'signed_off' && roa.status !== 'delivered' && <Badge tone="warning">Not signed off</Badge>}
                {dirty && <Badge tone="warning">Unsaved edits</Badge>}
                Adviser {data.adviser.name}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setPreview((p) => !p)}>
                {preview ? <PenLine /> : <Eye />} {preview ? 'Edit' : 'Preview'}
              </Button>
              {roa.status === 'draft' && (
                <Button size="sm" variant="accent" disabled={signoff.isPending || dirty} onClick={() => signoff.mutate(roa.id)}>
                  Request sign-off
                </Button>
              )}
              {pending && (
                <Button size="sm" variant="accent" asChild>
                  <Link to="/broker/approvals">Open approval</Link>
                </Button>
              )}
              <Button size="sm" variant="ghost" className="hidden lg:inline-flex" onClick={() => setExpanded((e) => !e)}>
                {expanded ? <Minimize2 /> : <Maximize2 />} {expanded ? 'Show Russ' : 'Expand editor'}
              </Button>
            </div>
          </div>
          {signoff.error && <p className="px-4 pt-2 text-xs text-red-600">{signoff.error.message}</p>}
          <div className="scroll-area flex-1 space-y-4 px-4 py-4">
            {roa.status === 'awaiting_approval' && (
              <Notice tone="warning">Sign-off is pending. Editing a section re-raises the request for the new wording, so the adviser always signs what is on screen.</Notice>
            )}
            {ROA_SECTIONS.map((s) => {
              const value = drafts[s] ?? roa.content[s]
              return (
                <div key={s} ref={(el) => void (refs.current[s] = el)} className={cn('rounded-xl border p-3 transition', focus === s ? 'border-brand-500 ring-2 ring-brand-500/30' : 'border-navy-800/10')}>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <label htmlFor={`roa-${s}`} className="text-xs font-semibold text-navy-700">
                      {ROA_SECTION_LABEL[s]}
                    </label>
                    {roa.suggestions[s] && <Badge tone="accent">Suggestion available</Badge>}
                  </div>
                  {preview || !editable ? (
                    <p className="text-sm whitespace-pre-line text-navy-800">{value || '–'}</p>
                  ) : (
                    <>
                      <textarea
                        id={`roa-${s}`}
                        value={value}
                        onFocus={() => setFocus(s)}
                        onChange={(e) => setDrafts({ ...drafts, [s]: e.target.value })}
                        rows={Math.min(8, Math.max(2, value.split('\n').length + 1))}
                        className="field py-2 text-sm"
                      />
                      {drafts[s] !== undefined && drafts[s] !== roa.content[s] && (
                        <div className="mt-1 flex gap-2">
                          <Button
                            size="sm"
                            disabled={save.isPending}
                            onClick={() =>
                              save.mutate(
                                { roa_id: roa.id, section: s, text: drafts[s]! },
                                {
                                  onSuccess: () =>
                                    setDrafts((d) => {
                                      const { [s]: _saved, ...rest } = d
                                      return rest
                                    }),
                                },
                              )
                            }
                          >
                            Save section
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setDrafts((d) => {
                                const { [s]: _discarded, ...rest } = d
                                return rest
                              })
                            }
                          >
                            Discard
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            })}
            {save.error && <p className="text-xs text-red-600">{save.error.message}</p>}
            <div className="rounded-xl border border-navy-800/10 p-3">
              <p className="text-xs font-semibold text-navy-700">Disclosures</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-navy-800">
                {roa.content.disclosures.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </div>
            <div className="text-xs text-navy-600">
              {data.approvals.map((a) => (
                <p key={a.id}>
                  {a.approval_type.replace(/_/g, ' ')}: {a.status.replace(/_/g, ' ')} · {formatDateTime(a.created_at)} {a.decision_note && `· “${a.decision_note}”`}
                </p>
              ))}
              {data.policy_id && (
                <Link to={`/broker/life/policies/${data.policy_id}`} className="font-semibold text-brand-600">
                  Open the resulting policy
                </Link>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
