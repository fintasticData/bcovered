import { useState } from 'react'
import { AlertTriangle, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { newKey, salesApi, useBookGrid, useSalesMutation, STAGE_LABEL, type GridRow, type MemberRef, type PendingMatch, type Stage } from '@/copilot/salesApi'
import { usePersonSources } from '@/copilot/franchiseApi'
import { cn } from '@/lib/utils'
import { EmptyState, LoadingState } from '../PageHeader'
import { CategoryBadge, ErrorText, inputClass, KIND_LABEL, MemberLabel, StageBadge, shortDate } from './bits'

function PendingMatches({ items, onOpen }: { items: PendingMatch[]; onOpen: (id: string) => void }) {
  const resolve = useSalesMutation(salesApi.resolveMatch)
  if (!items.length) return null
  return (
    <section className="mb-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3" aria-label="Enquiries to confirm">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-900"><AlertTriangle className="h-4 w-4" /> {items.length} referral enquir{items.length === 1 ? 'y needs' : 'ies need'} a match check</h3>
      <ul className="mt-2 space-y-2">
        {items.map((e) => (
          <li key={e.id} className="rounded-lg bg-white p-3 text-sm ring-1 ring-amber-200">
            <p className="font-medium text-navy-900">
              {e.name} <span className="font-mono text-xs text-navy-500">{e.reference}</span>
              <span className="text-xs font-normal text-navy-600"> · {[e.phone, e.email, e.interest].filter(Boolean).join(' · ')} · via {e.referrer?.name ?? 'referral'}</span>
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {e.candidates.map((c) => (
                <Button key={c.id} size="sm" variant="outline" disabled={resolve.isPending}
                  onClick={() => resolve.mutate({ enquiry_id: e.id, person_id: c.id, key: newKey() }, { onSuccess: () => onOpen(c.id) })}>
                  Same person as {c.name} ({c.number})
                </Button>
              ))}
              <Button size="sm" disabled={resolve.isPending}
                onClick={() => resolve.mutate({ enquiry_id: e.id, create_new: true, key: newKey() }, { onSuccess: (r) => r.person_id && onOpen(String(r.person_id)) })}>
                New person
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <ErrorText error={resolve.error} />
    </section>
  )
}

function LastComm({ c }: { c: GridRow['last_communication'] }) {
  if (!c) return <span className="text-navy-400">None yet</span>
  return (
    <span className="block min-w-0">
      <span className="text-xs text-navy-600">{shortDate(c.at)} · {KIND_LABEL[c.kind] ?? c.kind}{c.direction === 'inbound' ? ' (in)' : ''}</span>
      <span className="block truncate text-navy-900" title={c.summary}>{c.summary}</span>
    </span>
  )
}

export function ClientGrid({ scope, onScope, canSeeTeam, member, onClearMember, onOpen, selectedId }: {
  scope: 'mine' | 'team'
  onScope: (s: 'mine' | 'team') => void
  canSeeTeam: boolean
  member: MemberRef | null
  onClearMember: () => void
  onOpen: (personId: string) => void
  selectedId?: string | null
}) {
  const [query, setQuery] = useState('')
  const [stage, setStage] = useState<Stage | ''>('')
  const grid = useBookGrid({ scope, member_id: member?.member_id ?? null, stage: stage || null, query: query.trim().length >= 2 ? query.trim() : null })
  const d = grid.data
  const t = d?.totals
  const sources = usePersonSources(d?.rows.map((r) => r.id) ?? []).data ?? {}

  return (
    <div className="@container flex min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2">
        {canSeeTeam && (
          <div role="radiogroup" aria-label="Whose clients" className="inline-flex gap-0.5 rounded-xl bg-navy-100/70 p-0.5">
            {(['mine', 'team'] as const).map((s) => (
              <button key={s} type="button" role="radio" aria-checked={scope === s} onClick={() => onScope(s)}
                className={cn('cursor-pointer rounded-lg px-3 py-1 text-xs font-semibold', scope === s ? 'bg-white text-navy-900 shadow-sm' : 'text-navy-600 hover:text-navy-900')}>
                {s === 'mine' ? 'Mine' : 'Team'}
              </button>
            ))}
          </div>
        )}
        {member && (
          <span className="inline-flex items-center gap-1 rounded-full border border-brand-500/30 bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-800">
            Referred to or assigned to {member.name}
            <button type="button" onClick={onClearMember} className="cursor-pointer rounded-full p-0.5 hover:bg-brand-100" aria-label="Clear team member filter"><X className="h-3 w-3" /></button>
          </span>
        )}
        <label className="relative ml-auto min-w-[10rem] flex-1 sm:max-w-xs">
          <span className="sr-only">Search clients</span>
          <Search className="pointer-events-none absolute top-2.5 left-2.5 h-4 w-4 text-navy-400" />
          <input className={`${inputClass} pl-8`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, client number or phone" />
        </label>
        <label className="sr-only" htmlFor="grid-stage">Stage</label>
        <select id="grid-stage" className={`${inputClass} w-auto`} value={stage} onChange={(e) => setStage(e.target.value as Stage | '')}>
          <option value="">All stages</option>
          {(Object.keys(STAGE_LABEL) as Stage[]).map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
        </select>
      </div>

      {t && (
        <p className="mt-2 text-xs text-navy-600">
          {t.people} {t.people === 1 ? 'person' : 'people'} · {t.new_enquiry} new enquir{t.new_enquiry === 1 ? 'y' : 'ies'} · {t.offer_sent} offer sent · {t.accepted} accepted · {t.sold} sold
          {d?.category === 'live' ? ' (Live)' : ' (Sample)'}
        </p>
      )}

      <div className="mt-3 min-h-0 flex-1">
        {d && <PendingMatches items={d.pending_matches} onOpen={onOpen} />}
        {grid.isLoading ? (
          <LoadingState label="Loading clients…" />
        ) : grid.error ? (
          <ErrorText error={grid.error} />
        ) : !d?.rows.length ? (
          <EmptyState title={scope === 'mine' ? 'No clients assigned to you yet' : 'No clients yet'}>
            Add a client, or share your referral link: submitted enquiries appear here as new prospects.
          </EmptyState>
        ) : (
          <>
          <ul className="space-y-2 @3xl:hidden" aria-label="Clients">
            {d.rows.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => onOpen(r.id)}
                  className={cn('block w-full cursor-pointer rounded-xl border bg-white p-3 text-left text-sm active:bg-brand-50/60', selectedId === r.id ? 'border-brand-500 bg-brand-50/60' : 'border-navy-800/10')}>
                  <span className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-navy-900">{r.name}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-navy-500">
                        <span className="font-mono">{r.client_number}</span>
                        <span>{r.contact_stage === 'client' ? 'Client' : 'Prospect'}</span>
                        <CategoryBadge category={r.category} />
                        {sources[r.id]?.channel === 'franchise' && <span className="font-semibold text-brand-700">Franchise · {sources[r.id].outlet}</span>}
                      </span>
                    </span>
                    <StageBadge stage={r.stage} />
                  </span>
                  <span className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <span className="min-w-0">
                      <span className="block text-[10px] font-semibold tracking-wide text-navy-500 uppercase">Assigned to</span>
                      <MemberLabel member={r.assigned} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[10px] font-semibold tracking-wide text-navy-500 uppercase">Next follow-up</span>
                      {r.next_follow_up ? (
                        <span className={cn('block truncate font-semibold', r.next_follow_up.due_date && new Date(r.next_follow_up.due_date) < new Date() ? 'text-red-700' : 'text-navy-800')}>
                          {r.next_follow_up.due_date ? shortDate(r.next_follow_up.due_date) : 'No date'} · <span className="font-normal text-navy-600">{r.next_follow_up.title}</span>
                        </span>
                      ) : <span className="block text-navy-400">–</span>}
                    </span>
                  </span>
                  <span className="mt-2 block border-t border-navy-800/5 pt-2 text-xs"><LastComm c={r.last_communication} /></span>
                </button>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto rounded-xl border border-navy-800/10 bg-white @3xl:block">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-navy-50/80 text-[11px] font-semibold tracking-wide text-navy-500 uppercase">
                <tr>
                  <th className="px-3 py-2">Person</th>
                  <th className="px-3 py-2">Assigned to</th>
                  <th className="px-3 py-2">Referred by</th>
                  <th className="px-3 py-2">Source</th>
                  <th className="px-3 py-2">Stage</th>
                  <th className="px-3 py-2">Last communication</th>
                  <th className="px-3 py-2">Next follow-up</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-800/5">
                {d.rows.map((r) => (
                  <tr key={r.id} onClick={() => onOpen(r.id)} className={cn('cursor-pointer align-top hover:bg-brand-50/40', selectedId === r.id && 'bg-brand-50/60')}>
                    <td className="px-3 py-2.5">
                      <button type="button" className="cursor-pointer text-left font-medium text-navy-900 hover:text-brand-700" onClick={(e) => { e.stopPropagation(); onOpen(r.id) }}>
                        {r.name}
                      </button>
                      <span className="mt-0.5 flex items-center gap-1.5 text-xs text-navy-500">
                        <span className="font-mono">{r.client_number}</span>
                        <span>{r.contact_stage === 'client' ? 'Client' : 'Prospect'}</span>
                        <CategoryBadge category={r.category} />
                      </span>
                    </td>
                    <td className="px-3 py-2.5"><MemberLabel member={r.assigned} /></td>
                    <td className="px-3 py-2.5"><MemberLabel member={r.referred_by} code empty="–" /></td>
                    <td className="px-3 py-2.5 text-xs">
                      {sources[r.id]?.channel === 'franchise' ? (
                        <span className="block"><span className="font-semibold text-brand-700">Franchise</span><span className="block text-navy-600">{sources[r.id].outlet}</span></span>
                      ) : sources[r.id] ? <span className="text-navy-600">Direct</span> : <span className="text-navy-400">–</span>}
                    </td>
                    <td className="px-3 py-2.5"><StageBadge stage={r.stage} /></td>
                    <td className="max-w-[16rem] px-3 py-2.5"><LastComm c={r.last_communication} /></td>
                    <td className="px-3 py-2.5 text-xs">
                      {r.next_follow_up ? (
                        <span className="block">
                          <span className={cn('font-semibold', r.next_follow_up.due_date && new Date(r.next_follow_up.due_date) < new Date() ? 'text-red-700' : 'text-navy-800')}>
                            {r.next_follow_up.due_date ? shortDate(r.next_follow_up.due_date) : 'No date'}
                          </span>
                          <span className="block truncate text-navy-600" title={r.next_follow_up.title}>{r.next_follow_up.title}</span>
                        </span>
                      ) : <span className="text-navy-400">–</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>
    </div>
  )
}
