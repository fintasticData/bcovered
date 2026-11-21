import { Link } from 'react-router-dom'
import { MessageSquare, Maximize2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { TermField } from './ChangeReviewView'
import { CopilotNudge } from './CopilotNudge'
import { RenewalTermsTable } from './RenewalTermsTable'
import { renewalQueueHref, type RenewalRow, zar, renewalDecisionHeadline, renewalRussMessage } from './renewalsDemo'

export function renewalFieldsFromRow(row: RenewalRow): TermField[] {
  return [
    {
      id: 'excess',
      label: 'Excess',
      expiring: zar(row.expiringExcess),
      proposed: zar(row.proposedExcess),
      changed: row.expiringExcess !== row.proposedExcess,
    },
    {
      id: 'premium',
      label: 'Annual premium',
      expiring: zar(row.expiringPremium),
      proposed: zar(row.proposedPremium),
      changed: row.expiringPremium !== row.proposedPremium,
    },
    { id: 'period', label: 'Period', expiring: row.period, proposed: row.period },
    { id: 'policy', label: 'Policy number', expiring: row.policyNumber, proposed: row.policyNumber },
    {
      id: 'sum',
      label: 'Sum insured',
      expiring: zar(row.sumInsured),
      proposed: zar(row.sumInsured),
    },
  ]
}

/** Narrow-drawer renewal reading order: header → decision → terms → Russ → Discuss + Open full queue. */
export function RenewalCompactPanel({
  row,
  onDiscuss,
  onClose,
  className,
  queueExtraParams,
}: {
  row: RenewalRow
  onDiscuss?: () => void
  onClose?: () => void
  className?: string
  queueExtraParams?: Record<string, string | null | undefined>
}) {
  const decision = renewalDecisionHeadline(row)
  const russ = renewalRussMessage(row)
  const fields = renewalFieldsFromRow(row)
  const queueHref = renewalQueueHref(row.id, queueExtraParams)

  return (
    <div className={cn('@container flex flex-col gap-4', className)} style={{ containerType: 'inline-size' }}>
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold tracking-wide text-navy-500 uppercase">Renewals</p>
          <h3 className="truncate text-lg font-semibold text-navy-900">{row.client}</h3>
          <p className="text-xs tabular-nums text-navy-600">{row.policyNumber}</p>
        </div>
        {onClose && (
          <Button size="sm" variant="ghost" type="button" onClick={onClose} aria-label="Close renewal">
            <X />
          </Button>
        )}
      </header>

      <p className="text-base font-semibold text-navy-900">{decision}</p>

      <RenewalTermsTable fields={fields} />

      <CopilotNudge>{russ}</CopilotNudge>

      <footer className="flex flex-wrap gap-2 border-t border-navy-800/10 pt-3">
        {onDiscuss && (
          <Button size="sm" variant="accent" type="button" onClick={onDiscuss}>
            <MessageSquare /> Discuss renewal
          </Button>
        )}
        <Button size="sm" variant="outline" asChild>
          <Link to={queueHref}>
            <Maximize2 /> Open full queue
          </Link>
        </Button>
      </footer>
    </div>
  )
}
