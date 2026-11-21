import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { LeadRecordPanel } from './leads/LeadRecordPanel'

/** Deep-link fallback; primary UX is the Leads grid slide-out on `/broker/leads/:leadId`. */
export default function LeadDetailPage() {
  const { leadId } = useParams()
  if (!leadId) return null
  return (
    <div>
      <div className="border-b border-navy-800/10 bg-white px-4 py-2">
        <Link to="/broker/leads" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600">
          <ArrowLeft className="h-3.5 w-3.5" /> All leads
        </Link>
      </div>
      <LeadRecordPanel leadId={leadId} />
    </div>
  )
}
