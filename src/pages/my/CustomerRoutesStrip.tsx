import {
  ClipboardList,
  FilePlus2,
  MessageSquareHeart,
  Network,
  Plus,
  ShieldAlert,
  Wallet,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

export type CustomerRouteId =
  | 'add_item'
  | 'get_quote'
  | 'report_claim'
  | 'concierge'
  | 'review_risk'
  | 'confirm_values'
  | 'open_requests'

export type CoverAccount = 'personal' | 'business'

const PERSONAL_ROUTES: Array<{
  id: CustomerRouteId
  label: string
  hint: string
  icon: typeof Plus
}> = [
  { id: 'add_item', label: 'Add an item to insure', hint: 'Register an asset', icon: FilePlus2 },
  { id: 'get_quote', label: 'Get a quote', hint: 'Request options', icon: Plus },
  { id: 'report_claim', label: 'Report a claim', hint: 'Start a claim', icon: ShieldAlert },
  { id: 'concierge', label: 'Request concierge help', hint: 'VIP assistance', icon: MessageSquareHeart },
]

const BUSINESS_ROUTES: Array<{
  id: CustomerRouteId
  label: string
  hint: string
  icon: typeof Plus
}> = [
  { id: 'review_risk', label: 'Review risk profile', hint: 'Update exposures and locations', icon: Network },
  { id: 'confirm_values', label: 'Confirm values', hint: 'Check recorded asset values', icon: Wallet },
  { id: 'open_requests', label: 'Open requests', hint: 'Information your broker needs', icon: ClipboardList },
]

/** Customer task launcher — same journeys as toolbar / row / Ava entry points. */
export function CustomerRoutesStrip({
  account = 'personal',
  onLaunch,
  conciergeEnabled = false,
}: {
  account?: CoverAccount
  onLaunch: (id: CustomerRouteId) => void
  conciergeEnabled?: boolean
}) {
  const routes = account === 'business' ? BUSINESS_ROUTES : PERSONAL_ROUTES
  const visible =
    account === 'business'
      ? routes
      : routes.filter((r) => r.id !== 'concierge' || conciergeEnabled)

  return (
    <section aria-label="What you can do" className="space-y-2">
      <div className="flex items-center gap-2">
        <ClipboardList className="h-4 w-4 text-brand-700" />
        <h2 className="text-sm font-semibold text-navy-900">What you can do</h2>
      </div>
      <div className="scroll-x -mx-1 flex flex-nowrap gap-2 px-1 sm:flex-wrap sm:overflow-visible">
        {visible.map((r) => {
          const Icon = r.icon
          return (
            <Button
              key={r.id}
              size="sm"
              variant="outline"
              className="shrink-0 touch-manipulation"
              onClick={() => onLaunch(r.id)}
              title={r.hint}
            >
              <Icon /> {r.label}
            </Button>
          )
        })}
      </div>
    </section>
  )
}
