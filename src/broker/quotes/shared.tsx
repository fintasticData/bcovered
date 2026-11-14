import { Badge } from '@/components/ui/badge'
import { SimulatedBadge } from '@/components/SimulatedBadge'
import { isQuoted, vehicleItem } from '@/lib/qe/sampleQuotes'
import type { QeInsurerQuote } from '@/lib/qe/types'
import { cn } from '@/lib/utils'

export function DemoSampleBadge({ className }: { className?: string }) {
  return (
    <SimulatedBadge
      label="Demo · Sample quotes"
      title="Fixed sample results from local demo data. Not insurer quotations and cannot be accepted as cover."
      className={className}
    />
  )
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => w && !['Demo', 'Insurer'].includes(w))
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

export function InsurerMark({ name, className }: { name: string; className?: string }) {
  return (
    <span aria-hidden className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-navy-800 text-xs font-bold text-white', className)}>
      {initials(name)}
    </span>
  )
}

/** The vehicle's outcome. Distinct from the insurer's processing status, which is "Complete" even when it declines. */
export function OutcomeBadge({ quote }: { quote: QeInsurerQuote }) {
  const status = vehicleItem(quote)?.status ?? 'No Quote'
  return <Badge tone={isQuoted(quote) ? 'success' : 'danger'}>{status}</Badge>
}
