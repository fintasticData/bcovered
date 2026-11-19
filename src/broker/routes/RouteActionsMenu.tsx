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
  actions,
}: {
  personId: string
  policyId?: string | null
  claimId?: string | null
  actions: Array<{ definition_id: string; label: string }>
}) {
  const start = useStartRoute()
  const navigate = useNavigate()

  return (
    <div className="flex flex-wrap gap-1.5">
      {actions.map((a) => (
        <Button
          key={a.definition_id}
          size="sm"
          variant="outline"
          disabled={start.isPending}
          onClick={() =>
            start.mutate(
              {
                definition_id: a.definition_id,
                person_id: personId,
                policy_id: policyId ?? null,
                claim_id: claimId ?? null,
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
