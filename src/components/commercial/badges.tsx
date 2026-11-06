import type { ReactNode } from 'react'
import { AlertCircle, CircleHelp, MessageSquareQuote, ShieldCheck, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { CoverageStatus, FieldSource, RiskPriority } from '@/server/db/commercialSchema'
import { cn } from '@/lib/utils'

const SOURCE: Record<FieldSource, { label: string; tone: 'success' | 'info' | 'accent' | 'danger'; icon: typeof ShieldCheck; title: string }> = {
  verified: { label: 'Verified', tone: 'success', icon: ShieldCheck, title: 'Checked against a document or record' },
  declared: { label: 'Declared', tone: 'info', icon: MessageSquareQuote, title: 'Stated by the customer, not yet verified' },
  inferred: { label: 'AI inferred', tone: 'accent', icon: Sparkles, title: 'Inferred by an agent from other information; needs confirmation' },
  missing: { label: 'Missing', tone: 'danger', icon: CircleHelp, title: 'Not provided yet' },
}

export function ProvenanceBadge({ source, className }: { source: FieldSource; className?: string }) {
  const s = SOURCE[source]
  return (
    <Badge tone={s.tone} className={className} title={s.title}>
      <s.icon /> {s.label}
    </Badge>
  )
}

export const COVERAGE_LABEL: Record<CoverageStatus, string> = {
  confirmed_covered: 'Confirmed covered',
  confirmed_excluded: 'Confirmed excluded',
  potentially_covered: 'Potentially covered',
  unknown: 'Unknown',
  awaiting_broker_review: 'Awaiting broker review',
}

const COVERAGE_TONE: Record<CoverageStatus, 'success' | 'danger' | 'info' | 'neutral' | 'warning'> = {
  confirmed_covered: 'success',
  confirmed_excluded: 'danger',
  potentially_covered: 'info',
  unknown: 'neutral',
  awaiting_broker_review: 'warning',
}

export const COVERAGE_BORDER: Record<CoverageStatus, string> = {
  confirmed_covered: 'border-emerald-400',
  confirmed_excluded: 'border-red-400',
  potentially_covered: 'border-sky-400',
  unknown: 'border-navy-300',
  awaiting_broker_review: 'border-amber-400',
}

export function CoverageBadge({ status, className }: { status: CoverageStatus; className?: string }) {
  return (
    <Badge tone={COVERAGE_TONE[status]} className={className} title="Coverage evidence status, based only on documents analysed so far">
      {COVERAGE_LABEL[status]}
    </Badge>
  )
}

export function PriorityBadge({ priority, className }: { priority: RiskPriority; className?: string }) {
  const tone = priority === 'high' ? 'danger' : priority === 'medium' ? 'warning' : 'neutral'
  return (
    <Badge tone={tone} className={cn('capitalize', className)} title="Advisory review order for the broker, explained by its inputs. Not a probability of loss.">
      {priority} priority
    </Badge>
  )
}

export function AdviceNotice({ className, children }: { className?: string; children?: ReactNode }) {
  return (
    <p className={cn('flex items-start gap-2 rounded-xl border border-navy-800/10 bg-mist px-3 py-2 text-[11px] leading-relaxed text-navy-700', className)}>
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-500" />
      <span>
        {children ??
          'Potential exposures are areas for a broker to investigate, not confirmed cover or financial advice. Only a licensed broker can recommend cover.'}
      </span>
    </p>
  )
}
