import { Link } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { INCIDENT_TYPES } from '@/broker/claims/claimLabels'
import {
  policyClaimsApi,
  useBrokerClaimAlerts,
  usePolicyClaimsMutation,
} from '@/copilot/policyClaimsApi'

function typeLabel(value: string) {
  return INCIDENT_TYPES.find((t) => t.value === value)?.label ?? value.replace(/_/g, ' ')
}

/** High-visibility strip for newly submitted customer claims. */
export function BrokerSpecialAlertsBar() {
  const alerts = useBrokerClaimAlerts()
  const ack = usePolicyClaimsMutation(policyClaimsApi.acknowledgeClaimAlert)
  const rows = alerts.data?.rows ?? []
  const count = alerts.data?.count ?? 0
  if (!count || !rows.length) return null

  const first = rows[0]!
  const more = count - 1

  return (
    <div
      className="border-b border-rose-300/60 bg-rose-50 px-3 py-2 text-xs text-rose-950 sm:px-5"
      role="status"
      aria-live="polite"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2">
        <ShieldAlert className="h-4 w-4 shrink-0 text-rose-700" aria-hidden />
        <p className="min-w-0 flex-1 font-medium">
          <span className="font-bold text-rose-950">New claim submitted</span>
          {' · '}
          <span className="font-mono font-semibold">{first.reference}</span>
          {' · '}
          {first.customer_name}
          {' · '}
          <span className="capitalize">{typeLabel(first.incident_type)}</span>
          {first.created_at ? ` · ${new Date(first.created_at).toLocaleString()}` : null}
          {more > 0 ? ` · +${more} more` : null}
        </p>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="accent" asChild>
            <Link to={`/broker/claims/${first.id}?view=fintastic`}>Review claim</Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link to={`/broker/customers/people/${first.person_id}?rtab=claims`}>Client claims</Link>
          </Button>
          {more > 0 && (
            <Button size="sm" variant="ghost" asChild>
              <Link to="/broker/claims?filter=new">All new</Link>
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            type="button"
            disabled={ack.isPending}
            onClick={() => ack.mutate(first.id)}
          >
            Dismiss
          </Button>
        </div>
      </div>
    </div>
  )
}
