import { useState } from 'react'
import { AlertTriangle, Ban, CheckCircle2, ChevronDown, Circle, Loader2, MinusCircle, Wrench } from 'lucide-react'
import type { StepView } from '@/api/client'
import type { StepStatus } from '@/server/db/schema'
import { cn, formatDateTime } from '@/lib/utils'
import { StatusBadge } from './StatusBadge'

export interface PlanStep {
  key: string
  name: string
  agent_label: string
  status: StepStatus
  summary?: string | null
  runs?: StepView['runs']
  error?: StepView['error']
  started_at?: string | null
}

const ICON: Record<StepStatus, JSX.Element> = {
  pending: <Circle className="h-4 w-4 text-navy-300" />,
  running: <Loader2 className="h-4 w-4 animate-spin text-brand-500" />,
  completed: <CheckCircle2 className="h-4 w-4 text-emerald-600" />,
  failed: <AlertTriangle className="h-4 w-4 text-red-600" />,
  skipped: <MinusCircle className="h-4 w-4 text-navy-300" />,
  cancelled: <Ban className="h-4 w-4 text-navy-300" />,
}

export function ExecutionPlan({ steps, detailed = false }: { steps: PlanStep[]; detailed?: boolean }) {
  return (
    <ol className="space-y-1">
      {steps.map((s, i) => (
        <PlanRow key={s.key} step={s} last={i === steps.length - 1} detailed={detailed} />
      ))}
    </ol>
  )
}

function PlanRow({ step, last, detailed }: { step: PlanStep; last: boolean; detailed: boolean }) {
  const [open, setOpen] = useState(false)
  const calls = step.runs?.flatMap((r) => r.tool_calls) ?? []
  const summary = step.summary ?? (step as { output?: { summary?: string } }).output?.summary
  return (
    <li className="relative flex gap-3 pb-3">
      {!last && <span className="absolute top-6 left-[7px] h-[calc(100%-1.25rem)] w-px bg-navy-100" aria-hidden />}
      <span className="mt-0.5 shrink-0">{ICON[step.status]}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn('text-sm font-medium', step.status === 'pending' ? 'text-navy-600/70' : 'text-navy-900')}>{step.name}</span>
          <span className="rounded-md bg-navy-50 px-1.5 py-0.5 text-[11px] font-semibold text-navy-600">{step.agent_label}</span>
          {detailed && <StatusBadge status={step.status} />}
        </div>
        {summary && <p className="mt-0.5 text-xs text-navy-600">{summary}</p>}
        {step.error && <p className="mt-1 text-xs font-medium text-red-600">{step.error.message}</p>}
        {detailed && calls.length > 0 && (
          <div className="mt-1.5">
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-brand-600"
            >
              <Wrench className="h-3 w-3" /> {calls.length} tool call{calls.length > 1 ? 's' : ''}
              <ChevronDown className={cn('h-3 w-3 transition', open && 'rotate-180')} />
            </button>
            {open && (
              <ul className="mt-2 space-y-1.5">
                {calls.map((c) => (
                  <li key={c.id} className="rounded-lg border border-navy-800/10 bg-mist px-2.5 py-1.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <code className="font-semibold text-navy-800">{c.tool}</code>
                      <span className="flex items-center gap-2 text-navy-600/70">
                        {c.duration_ms !== null && `${c.duration_ms} ms`} <StatusBadge status={c.status} />
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-navy-600/80" title={JSON.stringify(c.args)}>
                      {JSON.stringify(c.args)}
                    </p>
                    {c.idempotency_key && <p className="truncate text-[10px] text-navy-500/60">key {c.idempotency_key}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {detailed && step.started_at && <p className="mt-0.5 text-[11px] text-navy-500/60">Started {formatDateTime(step.started_at)}</p>}
      </div>
    </li>
  )
}
