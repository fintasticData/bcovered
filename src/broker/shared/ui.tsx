import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const zar0 = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 })
const zar2 = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Rand amount. Whole rands by default; exact cents for reconciliation figures. */
export const zar = (n: number | null | undefined, exact = false) => (n === null || n === undefined ? '–' : (exact ? zar2 : zar0).format(n).replace('ZAR', 'R'))
export const pct = (n: number | null | undefined, digits = 1) => (n === null || n === undefined || !Number.isFinite(n) ? '–' : `${(n * 100).toFixed(digits)}%`)
export const num = (n: number | null | undefined, digits = 0) =>
  n === null || n === undefined ? '–' : n.toLocaleString('en-ZA', { minimumFractionDigits: digits, maximumFractionDigits: digits })

const BASIS: Record<string, { label: string; tone: 'info' | 'accent' | 'warning' | 'neutral' | 'success'; title: string }> = {
  reported: { label: 'Reported', tone: 'info', title: 'Supplied by a third party (insurer, administrator, manager or payroll) and shown as received' },
  calculated: { label: 'Calculated', tone: 'accent', title: 'Calculated by B-Covered from dated source records; not an official figure' },
  estimated: { label: 'Estimated', tone: 'warning', title: 'An estimate; confirm before relying on it' },
  adjusted: { label: 'Adjusted', tone: 'warning', title: 'Changed by a person after it was received' },
  verified: { label: 'Verified', tone: 'success', title: 'Checked against a document' },
  declared: { label: 'Declared', tone: 'neutral', title: 'As told to us by the client, not yet checked' },
  extracted: { label: 'Extracted', tone: 'info', title: 'Read from a document by an agent; awaiting confirmation' },
  inferred: { label: 'Inferred', tone: 'warning', title: 'Inferred by an agent' },
  simulated: { label: 'Simulated', tone: 'warning', title: 'From a synthetic rate table; never an insurer quote' },
}

/** Where a figure or fact comes from. */
export function BasisBadge({ basis, className }: { basis: string; className?: string }) {
  const b = BASIS[basis] ?? { label: basis, tone: 'neutral' as const, title: basis }
  return (
    <Badge tone={b.tone} title={b.title} className={className}>
      {b.label}
    </Badge>
  )
}

const SOURCE: Record<string, { label: string; tone: 'info' | 'accent' | 'neutral' }> = {
  broker: { label: 'Broker', tone: 'accent' },
  insurer: { label: 'Insurer', tone: 'info' },
  administrator: { label: 'Administrator', tone: 'info' },
  system: { label: 'System', tone: 'neutral' },
}

/** Who reported a status: the broker's own work, or the insurer's or administrator's official position. */
export function SourceBadge({ source }: { source: string }) {
  const s = SOURCE[source] ?? { label: source, tone: 'neutral' as const }
  return <Badge tone={s.tone}>{s.label}</Badge>
}

export function Stat({ label, value, hint, basis, tone }: { label: string; value: ReactNode; hint?: ReactNode; basis?: string; tone?: 'danger' | 'warning' }) {
  return (
    <div className={cn('rounded-xl border border-navy-800/10 bg-white p-3', tone === 'danger' && 'border-red-200 bg-red-50/40', tone === 'warning' && 'border-amber-200 bg-amber-50/40')}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold text-navy-500">{label}</p>
        {basis && <BasisBadge basis={basis} />}
      </div>
      <p className="mt-0.5 text-lg font-semibold text-navy-900">{value}</p>
      {hint && <p className="text-[11px] text-navy-600">{hint}</p>}
    </div>
  )
}

export function Section({ title, actions, children, className }: { title: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('panel p-4', className)}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-navy-900">{title}</h2>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  )
}

export function Table({ head, children, minWidth = 640 }: { head: ReactNode[]; children: ReactNode; minWidth?: number }) {
  return (
    <div className="scroll-area overflow-x-auto">
      <table className="w-full text-sm" style={{ minWidth }}>
        <thead className="bg-mist text-left text-[11px] font-semibold tracking-wide text-navy-500 uppercase">
          <tr>
            {head.map((h, i) => (
              <th key={i} className="px-3 py-2">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-navy-800/5">{children}</tbody>
      </table>
    </div>
  )
}

export const Td = ({ children, className }: { children?: ReactNode; className?: string }) => <td className={cn('px-3 py-2 align-top text-navy-800', className)}>{children}</td>

export function RowLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="font-medium text-navy-900 hover:text-brand-600">
      {children}
    </Link>
  )
}

export function Page({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return <div className={cn('mx-auto space-y-4 p-4 sm:p-6', wide ? 'max-w-[1400px]' : 'max-w-7xl')}>{children}</div>
}

export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warning' }) {
  return (
    <p className={cn('rounded-xl border px-3 py-2 text-xs', tone === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-sky-200 bg-sky-50 text-sky-900')}>{children}</p>
  )
}

export function Filters<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: Array<{ id: T; label: string }> }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((f) => (
        <button
          key={f.id}
          type="button"
          onClick={() => onChange(f.id)}
          aria-pressed={value === f.id}
          className={cn('cursor-pointer rounded-full px-3 py-1.5 text-xs font-semibold', value === f.id ? 'bg-navy-800 text-white' : 'bg-white text-navy-700 ring-1 ring-navy-800/10')}
        >
          {f.label}
        </button>
      ))}
    </div>
  )
}
