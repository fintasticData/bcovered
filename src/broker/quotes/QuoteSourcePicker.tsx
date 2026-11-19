import { Lock, Sparkles, ClipboardList, Database } from 'lucide-react'
import {
  isQuoteSourceEnabled,
  QUOTE_SOURCE_HELP,
  QUOTE_SOURCE_LABEL,
  type QuoteSource,
} from '@/lib/quotes/sources'
import { cn } from '@/lib/utils'

const ICONS: Record<QuoteSource, typeof Sparkles> = {
  sample_ai: Sparkles,
  sample_fixed: Database,
  manual: ClipboardList,
  live: Lock,
}

const ORDER: QuoteSource[] = ['sample_ai', 'sample_fixed', 'manual', 'live']

export function QuoteSourcePicker({
  value,
  onChange,
}: {
  value: QuoteSource
  onChange: (s: QuoteSource) => void
}) {
  return (
    <div className="space-y-2" role="radiogroup" aria-label="Quote source">
      <p className="text-xs font-semibold tracking-wide text-navy-500 uppercase">How do you want quotes?</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {ORDER.map((s) => {
          const enabled = isQuoteSourceEnabled(s)
          const Icon = ICONS[s]
          const selected = value === s
          return (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={!enabled}
              onClick={() => enabled && onChange(s)}
              title={QUOTE_SOURCE_HELP[s]}
              className={cn(
                'flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition',
                !enabled && 'cursor-not-allowed opacity-55',
                selected && enabled ? 'border-brand-500 bg-brand-50/60' : 'border-navy-800/10 bg-white hover:border-brand-500/40',
              )}
            >
              <span className={cn('mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg', selected && enabled ? 'bg-brand-600 text-white' : 'bg-navy-100 text-navy-700')}>
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-navy-900">
                  {QUOTE_SOURCE_LABEL[s]}
                  {!enabled && <span className="ml-1 text-[10px] font-bold tracking-wide text-amber-800 uppercase">Coming soon</span>}
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-navy-600">{QUOTE_SOURCE_HELP[s]}</span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
