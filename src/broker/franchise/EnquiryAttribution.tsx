import { Store, UserRound } from 'lucide-react'
import { useEnquiryAttribution } from '@/copilot/franchiseApi'
import { shortDate } from '../book/bits'
import { EnquiryStageBadge } from './shared'

/** "Referred by" for a client with no referring team member: the outlet that introduced them, if any. */
export function FranchiseReferrer({ personId }: { personId: string }) {
  const q = useEnquiryAttribution(personId)
  const first = [...(q.data?.enquiries ?? [])].reverse().find((e) => e.outlet)
  if (!first?.outlet) return <span className="text-navy-400">No referral</span>
  return (
    <span className="block min-w-0">
      <span className="flex items-center gap-1.5 font-medium text-navy-900"><Store className="h-3.5 w-3.5 text-brand-600" aria-hidden /> {first.outlet.label}</span>
      {first.referred_by && <span className="block text-[11px] text-navy-500">via {first.referred_by.name}</span>}
    </span>
  )
}

/** On the client record: for each enquiry, who referred the client, who is handling it and who sold the cover. */
export function EnquiryAttribution({ personId }: { personId: string }) {
  const q = useEnquiryAttribution(personId)
  const rows = q.data?.enquiries ?? []
  if (!rows.length) return null
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold tracking-wide text-navy-500 uppercase">Referred, handled and sold</h3>
      <ul className="space-y-1.5 text-sm">
        {rows.map((e) => (
          <li key={e.id} className="rounded-lg border border-navy-800/10 bg-white px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-1.5">
                {e.outlet ? <Store className="h-3.5 w-3.5 text-brand-600" aria-hidden /> : <UserRound className="h-3.5 w-3.5 text-navy-500" aria-hidden />}
                <span className="font-mono text-xs">{e.reference}</span>
                <span className="text-xs text-navy-500">{shortDate(e.received_at)}</span>
              </span>
              <EnquiryStageBadge stage={e.stage} />
            </div>
            <p className="mt-1 text-xs text-navy-700">
              {e.outlet ? <><strong>Franchise:</strong> {e.outlet.label}</> : <strong>Direct</strong>}
              {e.referred_by ? ` · referred by ${e.referred_by.name}` : ''}
              {' · '}handled by {e.handled_by?.name ?? 'nobody yet'}
              {e.sold_by ? ` · sold by ${e.sold_by.name}${e.sale ? ` (${e.sale.reference})` : ''}` : ''}
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}
