import { useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useStartRoute } from '@/api/hooks'
import { newKey } from '@/copilot/salesApi'
import { guidePath } from './launchRoute'

export function RouteStartButtons({
  personId,
  policyId,
  claimId,
  offerId,
  offerPrefill,
  actions,
}: {
  personId: string
  policyId?: string | null
  claimId?: string | null
  offerId?: string | null
  offerPrefill?: {
    insurer_name?: string | null
    cover_type?: string | null
    premium_amount?: number | null
    item_label?: string | null
    item_type?: string | null
    reference?: string | null
  } | null
  actions: Array<{ definition_id: string; label: string; variant?: 'outline' | 'accent' | 'default' }>
}) {
  const start = useStartRoute()
  const navigate = useNavigate()

  return (
    <div className="flex flex-wrap gap-1.5">
      {actions.map((a) => (
        <Button
          key={a.definition_id + (a.label ?? '')}
          size="sm"
          variant={a.variant ?? 'outline'}
          disabled={start.isPending}
          onClick={() =>
            start.mutate(
              {
                definition_id: a.definition_id,
                person_id: personId,
                policy_id: policyId ?? null,
                claim_id: claimId ?? null,
                offer_id: offerId ?? null,
                offer_prefill: offerPrefill ?? null,
                key: newKey(),
              },
              { onSuccess: (s) => navigate(guidePath(s.progress.run.id)) },
            )
          }
        >
          {start.isPending ? <Loader2 className="animate-spin" /> : null} {a.label}
        </Button>
      ))}
    </div>
  )
}
