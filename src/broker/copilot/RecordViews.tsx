import { Link } from 'react-router-dom'
import { Building2, CalendarClock, FileText, MessageSquareText, UserRound } from 'lucide-react'
import type { AccountOverview, ClientOverview, HistoryItem, Interaction, PolicyDetail, PolicyRef } from '@/copilot/api'
import { StatusBadge, humanise } from '@/components/StatusBadge'
import type { DataCategory } from '@/lib/supabase/category'
import { formatDateTime } from '@/lib/utils'
import { EmptyState } from '../PageHeader'
import { CategoryBadge, CopilotBadge } from './identity'

const LINE_LABEL: Record<string, string> = {
  short_term_personal: 'Short-term · personal',
  short_term_commercial: 'Short-term · business',
  individual_life: 'Long-term · individual',
  group_risk: 'Long-term · group',
}
export const lineLabelOf = (line: string | null | undefined) => (line ? (LINE_LABEL[line] ?? humanise(line)) : '')
const money = (n: number | null | undefined) => (n == null ? '—' : `R${Number(n).toLocaleString('en-ZA', { maximumFractionDigits: 2 })}`)

function Section({ title, icon: Icon, children, count }: { title: string; icon: typeof FileText; children: React.ReactNode; count?: number }) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-navy-600 uppercase">
        <Icon className="h-3.5 w-3.5" aria-hidden /> {title}
        {count !== undefined && <span className="rounded-full bg-navy-100 px-1.5 text-[10px] text-navy-700">{count}</span>}
      </h3>
      {children}
    </section>
  )
}

function RecordHeader({ name, number, kind, category, extra }: { name: string; number: string | null; kind: string; category: DataCategory; extra?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-navy-800/10 bg-white p-4">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">{kind}</p>
        <p className="truncate text-lg font-semibold text-navy-900">{name}</p>
        {number && <p className="font-mono text-sm text-navy-700">{number}</p>}
      </div>
      <div className="flex items-center gap-2">
        {extra}
        <CategoryBadge category={category} />
      </div>
    </div>
  )
}

export function PolicyTable({ policies }: { policies: PolicyRef[] }) {
  if (!policies.length) return <p className="text-sm text-navy-600">No policies on record.</p>
  return (
    <div className="overflow-x-auto rounded-xl border border-navy-800/10">
      <table className="w-full min-w-[520px] text-sm">
        <thead className="bg-navy-50 text-left text-[11px] text-navy-600">
          <tr>
            <th className="px-3 py-2 font-semibold">Policy</th>
            <th className="px-3 py-2 font-semibold">Cover</th>
            <th className="px-3 py-2 font-semibold">Line</th>
            <th className="px-3 py-2 font-semibold">Status</th>
            <th className="px-3 py-2 font-semibold">Insurer</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-navy-800/5">
          {policies.map((p) => (
            <tr key={p.id}>
              <td className="px-3 py-2">
                <Link to={p.open_path} className="font-mono text-xs font-semibold text-brand-700 hover:underline">
                  {p.display_number}
                </Link>
                {p.policy_number && p.reference && p.policy_number !== p.reference && <span className="block font-mono text-[10px] text-navy-500">{p.reference}</span>}
              </td>
              <td className="px-3 py-2">{humanise(p.cover_type ?? '')}</td>
              <td className="px-3 py-2 text-xs text-navy-600">{lineLabelOf(p.line)}</td>
              <td className="px-3 py-2">
                <StatusBadge status={p.status} />
              </td>
              <td className="px-3 py-2 text-xs text-navy-600">{p.provider ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function InteractionList({ items }: { items: Interaction[] }) {
  if (!items.length) return <p className="text-sm text-navy-600">No notes yet.</p>
  return (
    <ul className="space-y-2">
      {items.map((i) => (
        <li key={i.id} className="rounded-xl border border-navy-800/10 bg-white p-3">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-navy-500">
            <span className="font-mono font-semibold text-navy-700">{i.reference}</span>
            <span>{humanise(i.kind)}</span>
            <span>{formatDateTime(i.created_at)}</span>
            {i.copilot && (i.copilot === 'ava' || i.copilot === 'russ' || i.copilot === 'ar') && <CopilotBadge id={i.copilot} />}
          </div>
          <p className="mt-1 text-sm whitespace-pre-line text-navy-900">{i.body}</p>
        </li>
      ))}
    </ul>
  )
}

export function HistoryTimeline({ items }: { items: HistoryItem[] }) {
  if (!items.length) return <EmptyState title="Nothing recorded yet" />
  return (
    <ol className="relative space-y-3 border-l border-navy-800/10 pl-4">
      {items.map((h, idx) => (
        <li key={`${h.reference}-${idx}`} className="relative">
          <span className="absolute top-1.5 -left-[21px] h-2.5 w-2.5 rounded-full bg-brand-500 ring-4 ring-white" aria-hidden />
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-navy-500">
            <span>{formatDateTime(h.at)}</span>
            <span className="font-semibold text-navy-700">{humanise(h.record_type)}</span>
            <Link to={h.open_path} className="font-mono font-semibold text-brand-700 hover:underline">
              {h.reference}
            </Link>
            {h.policy_number && <span className="font-mono">on {h.policy_number}</span>}
            {h.line && <span>{lineLabelOf(h.line)}</span>}
            {h.copilot && (h.copilot === 'ava' || h.copilot === 'russ' || h.copilot === 'ar') && <CopilotBadge id={h.copilot} />}
          </div>
          <p className="text-sm text-navy-900">{h.title}</p>
          {h.due_date && <p className="text-[11px] text-navy-500">Due {formatDateTime(h.due_date)}</p>}
        </li>
      ))}
    </ol>
  )
}

function OpenTasks({ tasks }: { tasks: ClientOverview['open_tasks'] }) {
  if (!tasks.length) return <p className="text-sm text-navy-600">No open follow-ups.</p>
  return (
    <ul className="space-y-1.5">
      {tasks.map((t) => (
        <li key={t.id} className="flex items-center justify-between gap-2 rounded-lg border border-navy-800/10 bg-white px-3 py-2 text-sm">
          <span>
            <span className="mr-2 font-mono text-xs font-semibold text-navy-700">{t.reference}</span>
            {t.title}
          </span>
          {t.due_date && <span className="shrink-0 text-[11px] text-navy-500">Due {formatDateTime(t.due_date)}</span>}
        </li>
      ))}
    </ul>
  )
}

export function ClientOverviewView({ data }: { data: ClientOverview }) {
  return (
    <div className="space-y-5">
      <RecordHeader
        name={data.client.name}
        number={data.client.number}
        kind="Client"
        category={data.client.category}
        extra={
          <Link to={data.client.open_path} className="text-xs font-semibold text-brand-700 hover:underline">
            Open record
          </Link>
        }
      />
      <Section title="Accounts" icon={Building2} count={data.accounts.length}>
        <ul className="flex flex-wrap gap-2">
          {data.accounts.map((a) => (
            <li key={a.id}>
              <Link to={a.open_path} className="inline-flex items-center gap-2 rounded-lg border border-navy-800/10 bg-white px-3 py-1.5 text-sm hover:border-brand-500">
                {a.name} <span className="font-mono text-xs text-navy-600">{a.number}</span>
                <span className="text-[11px] text-navy-500">{humanise(a.role)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Policies" icon={FileText} count={data.policies.length}>
        <PolicyTable policies={data.policies} />
      </Section>
      {data.schemes.length > 0 && (
        <Section title="Group schemes" icon={Building2} count={data.schemes.length}>
          <ul className="space-y-1.5 text-sm">
            {data.schemes.map((s) => (
              <li key={s.scheme_id} className="rounded-lg border border-navy-800/10 bg-white px-3 py-2">
                {s.name} · {s.employer} · {humanise(s.status)} · cover {money(s.cover_amount)}
              </li>
            ))}
          </ul>
        </Section>
      )}
      <Section title="Recent notes" icon={MessageSquareText} count={data.interactions.length}>
        <InteractionList items={data.interactions} />
      </Section>
      <Section title="Open follow-ups" icon={CalendarClock} count={data.open_tasks.length}>
        <OpenTasks tasks={data.open_tasks} />
      </Section>
    </div>
  )
}

export function AccountOverviewView({ data }: { data: AccountOverview }) {
  return (
    <div className="space-y-5">
      <RecordHeader
        name={data.account.name}
        number={data.account.number}
        kind={data.account.type === 'commercial' ? 'Business account' : 'Personal account'}
        category={data.account.category}
        extra={
          <Link to={data.account.open_path} className="text-xs font-semibold text-brand-700 hover:underline">
            Open record
          </Link>
        }
      />
      {data.account.previous_ref && <p className="text-xs text-navy-600">Previous system reference: {data.account.previous_ref}</p>}
      {data.business && (
        <Section title="Business profile" icon={Building2}>
          <Link to={data.business.open_path} className="block rounded-xl border border-navy-800/10 bg-white p-3 text-sm hover:border-brand-500">
            <span className="font-medium">{data.business.trading_name ?? data.business.registered_name}</span> · {humanise(data.business.industry)}
            {data.business.employees ? ` · ${data.business.employees} employees` : ''}
          </Link>
        </Section>
      )}
      <Section title="People" icon={UserRound} count={data.people.length}>
        <ul className="flex flex-wrap gap-2">
          {data.people.map((p) => (
            <li key={p.id}>
              <Link to={p.open_path} className="inline-flex items-center gap-2 rounded-lg border border-navy-800/10 bg-white px-3 py-1.5 text-sm hover:border-brand-500">
                {p.name} <span className="font-mono text-xs text-navy-600">{p.number}</span>
                <span className="text-[11px] text-navy-500">{humanise(p.role)}</span>
              </Link>
            </li>
          ))}
          {!data.people.length && <li className="text-sm text-navy-600">No people linked.</li>}
        </ul>
      </Section>
      <Section title="Policies" icon={FileText} count={data.policies.length}>
        <PolicyTable policies={data.policies} />
      </Section>
      {data.schemes.length > 0 && (
        <Section title="Group schemes" icon={Building2} count={data.schemes.length}>
          <SchemesTable schemes={data.schemes} />
        </Section>
      )}
      <Section title="Recent notes" icon={MessageSquareText} count={data.interactions.length}>
        <InteractionList items={data.interactions} />
      </Section>
      <Section title="Open follow-ups" icon={CalendarClock} count={data.open_tasks.length}>
        <OpenTasks tasks={data.open_tasks} />
      </Section>
    </div>
  )
}

export function SchemesTable({ schemes }: { schemes: AccountOverview['schemes'] }) {
  return (
    <ul className="space-y-1.5 text-sm">
      {schemes.map((s) => (
        <li key={s.scheme_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-navy-800/10 bg-white px-3 py-2">
          <span>
            {s.name} <span className="text-xs text-navy-500">· {humanise(s.benefit)}</span>
            {s.policy_number && <span className="ml-1 font-mono text-xs text-navy-600">{s.policy_number}</span>}
          </span>
          <span className="flex items-center gap-2 text-xs text-navy-600">
            {s.members} active members <StatusBadge status={s.status} />
          </span>
        </li>
      ))}
    </ul>
  )
}

export function MembersTable({ members }: { members: Array<{ person_id: string; client_number: string; name: string; status: string; cover_amount: number | null; open_path: string }> }) {
  return (
    <ul className="divide-y divide-navy-800/5 rounded-xl border border-navy-800/10 bg-white text-sm">
      {members.map((m) => (
        <li key={m.person_id} className="flex items-center justify-between gap-2 px-3 py-2">
          <Link to={m.open_path} className="hover:text-brand-700">
            {m.name} <span className="font-mono text-xs text-navy-600">{m.client_number}</span>
          </Link>
          <span className="flex items-center gap-2 text-xs text-navy-600">
            cover {money(m.cover_amount)} <StatusBadge status={m.status} />
          </span>
        </li>
      ))}
    </ul>
  )
}

export function PolicyDetailView({ data }: { data: PolicyDetail }) {
  return (
    <div className="space-y-5">
      <RecordHeader
        name={`${humanise(data.cover_type ?? 'policy')} policy`}
        number={data.display_number}
        kind={lineLabelOf(data.line)}
        category={data.category}
        extra={<StatusBadge status={data.status} />}
      />
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-xl border border-navy-800/10 bg-white p-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-[11px] text-navy-500">System reference</dt>
          <dd className="font-mono">{data.reference}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-navy-500">Insurer policy number</dt>
          <dd className="font-mono">{data.policy_number ?? 'Not issued yet'}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-navy-500">Insurer</dt>
          <dd>{data.provider ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-navy-500">Account</dt>
          <dd>
            {data.account ? (
              <Link to={`/broker/accounts/${data.account.id}`} className="text-brand-700 hover:underline">
                {data.account.name} <span className="font-mono text-xs">{data.account.number}</span>
              </Link>
            ) : (
              '—'
            )}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-navy-500">Premium</dt>
          <dd>
            {money(data.premium_amount)} {data.premium_frequency ? humanise(data.premium_frequency).toLowerCase() : ''}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-navy-500">Inception</dt>
          <dd>{data.inception_date ?? '—'}</dd>
        </div>
      </dl>
      {data.parties.length > 0 && (
        <Section title="Parties" icon={UserRound} count={data.parties.length}>
          <ul className="flex flex-wrap gap-2">
            {data.parties.map((p) => (
              <li key={`${p.person_id}-${p.role}`}>
                <Link to={`/broker/people/${p.person_id}`} className="inline-flex items-center gap-2 rounded-lg border border-navy-800/10 bg-white px-3 py-1.5 text-sm hover:border-brand-500">
                  {p.name} <span className="font-mono text-xs text-navy-600">{p.client_number}</span>
                  <span className="text-[11px] text-navy-500">{humanise(p.role)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}
      <Section title="Notes and activity" icon={MessageSquareText} count={data.interactions.length}>
        <InteractionList items={data.interactions} />
      </Section>
    </div>
  )
}
