import { Link } from 'react-router-dom'
import { MessageSquare, Phone, Sparkles } from 'lucide-react'
import { useConciergeHome } from '@/api/concierge'
import { useMe } from '@/api/hooks'
import { Button } from '@/components/ui/button'
import { usePortalBasePath, usePortalCategory, usePortalConciergeEnabled } from '@/pages/my/CustomerLayout'

/** Compact VIP concierge strip on Cover — Message opens Comms tab. */
export function ConciergeContactBanner({
  onOpenChat,
}: {
  /** Opens Comms with concierge thread (preferred). */
  onOpenChat?: (mode?: 'message' | 'callback') => void
} = {}) {
  const enabled = usePortalConciergeEnabled()
  const basePath = usePortalBasePath()
  const category = usePortalCategory()
  const { data: me } = useMe()
  const home = useConciergeHome({
    categoryOverride: category,
    enabled: enabled && me?.role === 'customer',
    authEmail: me?.email,
  })

  if (!enabled || !home.data?.enabled || !home.data.concierge) return null

  const c = home.data.concierge
  const first = c.name.split(' ')[0]
  const commsConcierge = `${basePath}?tab=comms&thread=concierge`

  const openChat = (mode: 'message' | 'callback' = 'message') => {
    if (onOpenChat) onOpenChat(mode)
  }

  return (
    <section
      id="vip-concierge"
      aria-label="VIP Concierge"
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-white px-4 py-3 scroll-mt-24"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-900 text-sm font-bold text-white">
          {c.name
            .split(' ')
            .map((p) => p[0])
            .join('')
            .slice(0, 2)}
        </span>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[10px] font-bold tracking-wide text-amber-900 uppercase">
            <Sparkles className="h-3 w-3" /> Your concierge
          </p>
          <p className="truncate text-sm font-semibold text-navy-950">{c.name}</p>
          <p className="text-xs text-navy-600">Message in Comms — chats stay on Cover with your items.</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {onOpenChat ? (
          <>
            <Button size="sm" variant="accent" type="button" onClick={() => openChat('message')}>
              <MessageSquare /> Message {first}
            </Button>
            <Button size="sm" variant="outline" type="button" onClick={() => openChat('callback')}>
              <Phone /> Request a call
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="accent" asChild>
              <Link to={commsConcierge}>
                <MessageSquare /> Message {first}
              </Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link to={commsConcierge}>
                <Phone /> Request a call
              </Link>
            </Button>
          </>
        )}
        <Button size="sm" variant="ghost" asChild>
          <Link to={`${basePath}/concierge/new`}>New request</Link>
        </Button>
      </div>
    </section>
  )
}
