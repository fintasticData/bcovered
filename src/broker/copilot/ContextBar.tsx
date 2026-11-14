import { Link } from 'react-router-dom'
import { Building2, FileText, UserRound, X } from 'lucide-react'
import type { TurnContext } from '@/copilot/api'
import { humanise } from '@/components/StatusBadge'
import type { DataCategory } from '@/lib/supabase/category'
import { CategoryBadge } from './identity'

/** The records the copilot is working on, shown above the composer so the broker can see or change them. */
export function ContextBar({ context, category, onChange, onClear }: { context: TurnContext; category: DataCategory; onChange: () => void; onClear: () => void }) {
  const items = [
    context.person && { key: 'person', icon: UserRound, label: context.person.name, number: context.person.number, to: context.person.open_path ?? `/broker/people/${context.person.id}` },
    context.account && { key: 'account', icon: Building2, label: context.account.name, number: context.account.number, to: context.account.open_path ?? `/broker/accounts/${context.account.id}` },
    context.policy && {
      key: 'policy',
      icon: FileText,
      label: `${humanise(context.policy.cover_type ?? 'policy')} policy`,
      number: context.policy.display_number,
      to: context.policy.open_path,
    },
  ].filter(Boolean) as Array<{ key: string; icon: typeof UserRound; label: string; number: string | null; to: string }>

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-t border-navy-800/5 px-4 pt-2.5 text-xs">
      <span className="font-semibold text-navy-600">Working on</span>
      {items.length === 0 && <span className="text-navy-500">no record selected</span>}
      {items.map((i) => (
        <Link key={i.key} to={i.to} className="inline-flex items-center gap-1 rounded-full border border-navy-800/10 bg-white px-2 py-0.5 hover:border-brand-500" title="Open record">
          <i.icon className="h-3 w-3 text-navy-500" aria-hidden />
          <span className="font-medium text-navy-900">{i.label}</span>
          {i.number && <span className="font-mono text-navy-600">{i.number}</span>}
        </Link>
      ))}
      {items.length > 0 && <CategoryBadge category={category} />}
      <button type="button" onClick={onChange} className="cursor-pointer font-semibold text-brand-700 hover:underline">
        {items.length ? 'Change' : 'Choose'}
      </button>
      {items.length > 0 && (
        <button type="button" onClick={onClear} className="inline-flex cursor-pointer items-center gap-0.5 text-navy-500 hover:text-navy-900" aria-label="Clear the selected records">
          <X className="h-3 w-3" /> Clear
        </button>
      )}
    </div>
  )
}
