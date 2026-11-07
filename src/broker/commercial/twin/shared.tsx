import type { ReactNode } from 'react'
import { CheckCircle2, CircleDashed, CircleDot, Clock, TriangleAlert } from 'lucide-react'
import type { StageStatus } from '@/api/client'
import { FACT_BASIS_LABEL } from '@/components/commercial/badges'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { CompletenessStatus, FactBasis } from '@/server/db/commercialSchema'

export type TwinTab = 'assessment' | 'graph' | 'actions' | 'insurance' | 'changes'

export function Card({ title, description, action, children, className }: { title: string; description?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('panel p-5', className)} aria-label={title}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-navy-900">{title}</h3>
          {description && <p className="mt-0.5 text-xs text-navy-600">{description}</p>}
        </div>
        {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  )
}

const STAGE: Record<StageStatus, { label: string; tone: 'success' | 'warning' | 'info' | 'neutral'; icon: typeof CheckCircle2 }> = {
  completed: { label: 'Completed', tone: 'success', icon: CheckCircle2 },
  review_required: { label: 'Review required', tone: 'warning', icon: TriangleAlert },
  in_progress: { label: 'In progress', tone: 'info', icon: CircleDot },
  pending: { label: 'Pending', tone: 'neutral', icon: Clock },
  not_started: { label: 'Not started', tone: 'neutral', icon: CircleDashed },
}

export function StageBadge({ status }: { status: StageStatus }) {
  const s = STAGE[status]
  return (
    <Badge tone={s.tone} className="max-w-full whitespace-normal">
      <s.icon /> {s.label}
    </Badge>
  )
}

const COMPLETENESS: Record<CompletenessStatus, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  complete: { label: 'Complete', tone: 'success' },
  partial: { label: 'Partial', tone: 'warning' },
  missing: { label: 'Missing', tone: 'danger' },
  pending: { label: 'Pending', tone: 'neutral' },
}

export function CompletenessBadge({ status }: { status: CompletenessStatus }) {
  return <Badge tone={COMPLETENESS[status].tone}>{COMPLETENESS[status].label}</Badge>
}

export function FactBasisBadge({ basis }: { basis: FactBasis }) {
  const tone = basis === 'verified' ? 'success' : basis === 'unknown' ? 'danger' : basis === 'inferred' ? 'accent' : 'info'
  return (
    <Badge tone={tone} title="The weakest source among the evidence for this finding">
      {FACT_BASIS_LABEL[basis]}
    </Badge>
  )
}

export function InlineError({ error }: { error: Error | null }) {
  return error ? (
    <p className="text-xs font-medium text-red-600" role="alert">
      {error.message}
    </p>
  ) : null
}

export const money = (v: number | null | undefined) => (v === null || v === undefined ? 'Not recorded' : `R${v.toLocaleString('en-ZA')}`)
