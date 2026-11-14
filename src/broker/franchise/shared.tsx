import { FlaskConical, Radio } from 'lucide-react'
import { ENQUIRY_STAGE_LABEL, type EnquiryStage } from '@/copilot/franchiseApi'
import type { DataCategory } from '@/lib/supabase/category'
import { cn } from '@/lib/utils'

const STAGE_TONE: Record<EnquiryStage, string> = {
  received: 'border-sky-200 bg-sky-50 text-sky-800',
  contacted: 'border-indigo-200 bg-indigo-50 text-indigo-800',
  offered: 'border-amber-200 bg-amber-50 text-amber-800',
  sold: 'border-emerald-200 bg-emerald-50 text-emerald-800',
}

export function EnquiryStageBadge({ stage }: { stage: EnquiryStage }) {
  return <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap', STAGE_TONE[stage])}>{ENQUIRY_STAGE_LABEL[stage]}</span>
}

export const pct = (v: number | null | undefined) => (typeof v === 'number' ? `${Math.round(v * 1000) / 10}%` : '–')

/** Commercial reporting reads its own category (Live by default), separate from the workspace's Sample / Live switch. */
export function ReportingCategory({ value, onChange }: { value: DataCategory; onChange: (next: DataCategory) => void }) {
  const item = (v: DataCategory, label: string, Icon: typeof Radio) => (
    <button
      type="button"
      role="radio"
      aria-checked={value === v}
      onClick={() => onChange(v)}
      className={cn(
        'flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition',
        value === v ? (v === 'live' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-amber-500 text-white shadow-sm') : 'text-navy-600 hover:text-navy-900',
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden /> {label}
    </button>
  )
  return (
    <div role="radiogroup" aria-label="Reporting category" className="inline-flex gap-0.5 rounded-xl bg-navy-100/70 p-0.5">
      {item('live', 'Live', Radio)}
      {item('sample', 'Sample', FlaskConical)}
    </div>
  )
}

export const PERIODS = [
  { id: 'this_month', label: 'This month' },
  { id: 'last_month', label: 'Last month' },
  { id: 'last_90', label: 'Last 90 days' },
  { id: 'this_year', label: 'This year' },
  { id: 'all', label: 'All time' },
] as const
export type PeriodId = (typeof PERIODS)[number]['id']

export function PeriodPicker({ value, onChange, label }: { value: PeriodId | 'custom'; onChange: (p: PeriodId) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 text-xs text-navy-600">
      <span className="font-semibold">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as PeriodId)} className="rounded-lg border border-navy-800/15 bg-white px-2 py-1 text-xs text-navy-900">
        {value === 'custom' && <option value="custom">Custom dates</option>}
        {PERIODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select>
    </label>
  )
}

/** Small filter chips, as in the client grid. */
export function Chips<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ id: T; label: string; count?: number }>; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            'cursor-pointer rounded-full border px-3 py-1 text-xs font-semibold transition',
            value === o.id ? 'border-navy-800 bg-navy-800 text-white' : 'border-navy-800/15 bg-white text-navy-700 hover:border-navy-800/40',
          )}
        >
          {o.label}
          {typeof o.count === 'number' && <span className={cn('ml-1.5', value === o.id ? 'text-white/70' : 'text-navy-400')}>{o.count}</span>}
        </button>
      ))}
    </div>
  )
}

export const waShare = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`
export const absUrl = (path: string) => `${window.location.origin}${path}`
export const outletShareText = (label: string, path: string) => `Need cover? Request a quote through ${label}: ${absUrl(path)}`
