import { Link } from 'react-router-dom'
import { ArrowRight, Bell, Building2, CheckCircle2, ClipboardList, FileText, Network } from 'lucide-react'
import { ApiError } from '@/api/client'
import { usePortalBusiness } from '@/api/hooks'
import { AdviceNotice } from '@/components/commercial/badges'
import { humanise } from '@/components/StatusBadge'
import { formatDate, formatDateTime } from '@/lib/utils'
import { ErrorState, LoadingState } from '@/broker/PageHeader'

export default function PortalBusinessPage() {
  const { data, isLoading, error } = usePortalBusiness()
  if (isLoading) return <div className="container-x py-10"><LoadingState /></div>
  if (error instanceof ApiError && error.code === 'not_found') {
    return (
      <div className="bg-mist">
        <div className="container-x py-10">
          <p className="eyebrow mb-1 flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5" /> Business portal
          </p>
          <h1 className="font-display text-3xl font-bold text-navy-900 sm:text-4xl">No business linked yet</h1>
          <p className="mt-2 max-w-2xl text-sm text-navy-600">
            Your account has no business risk review. Tell the Business Discovery Agent how your business operates and a broker
            reviews the findings. In Demo Studio, Scenario A creates a fictional restaurant group you can explore as Nomsa Dlamini.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link to="/business/risk-review" className="btn-dark px-4 py-2 text-xs">
              Start a business risk review <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/portal" className="btn-ghost px-4 py-2 text-xs">Back to my portal</Link>
            <Link to="/demo" className="btn-ghost px-4 py-2 text-xs">Demo Studio</Link>
          </div>
        </div>
      </div>
    )
  }
  if (error || !data) return <div className="container-x py-10"><ErrorState message={error?.message ?? 'Could not load your business portal'} /></div>
  const name = data.profile.trading_name ?? data.profile.registered_name
  const contact = data.profile.primary_contact?.name.split(' ')[0]

  return (
    <div className="bg-mist">
      <div className="container-x py-10">
        <p className="eyebrow mb-1 flex items-center gap-1.5">
          <Building2 className="h-3.5 w-3.5" /> Business portal
        </p>
        <h1 className="font-display text-3xl font-bold text-navy-900 sm:text-4xl">{name}</h1>
        <p className="mt-2 text-sm text-navy-600">
          {contact ? `Welcome, ${contact}. ` : ''}Your business risk review, the information your broker still needs, and messages in one place.
        </p>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[1.5fr_1fr]">
          <div className="space-y-6">
            <section className="panel p-5">
              <h2 className="text-sm font-semibold text-navy-900">Review status</h2>
              <p className="mt-1 text-base font-medium text-navy-900">{data.review_status}</p>
              <p className="mt-1 text-xs text-navy-600">
                {data.exposures.length} potential exposures identified across {data.locations.length} location{data.locations.length === 1 ? '' : 's'}. Your
                broker confirms which ones need cover; nothing has been sent to an insurer from this demo.
              </p>
              <Link to="/portal/business/risk-profile" className="btn-dark mt-4 px-4 py-2 text-xs">
                <Network className="h-4 w-4" /> View my risk profile <ArrowRight className="h-4 w-4" />
              </Link>
            </section>

            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-navy-900">
                <ClipboardList className="h-4 w-4 text-brand-500" /> Information your broker needs ({data.open_requests.length})
              </h2>
              {data.open_requests.length === 0 ? (
                <div className="panel p-5 text-sm text-navy-600">Nothing outstanding. Your broker has everything requested so far.</div>
              ) : (
                <ul className="space-y-2">
                  {data.open_requests.map((t) => (
                    <li key={t.id} className="panel flex items-start gap-3 p-4">
                      <FileText className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-navy-900">{t.title}</p>
                        {t.detail && <p className="text-xs text-navy-600">{t.detail}</p>}
                      </div>
                      <span className="shrink-0 text-[11px] text-navy-500">
                        {humanise(t.kind)} · by {formatDate(t.due_date)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-[11px] text-navy-600">Send documents to your broker by email for now. Your broker marks each request as received.</p>
              {data.completed_requests.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {data.completed_requests.map((t) => (
                    <li key={t.id} className="flex items-center gap-2 text-xs text-navy-600">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> {t.title}: received
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <aside className="space-y-6">
            <section className="panel p-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-navy-900">
                <Bell className="h-4 w-4 text-brand-500" /> Messages
              </h2>
              {data.notifications.length === 0 ? (
                <p className="mt-2 text-xs text-navy-600">No messages yet.</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {data.notifications.map((n) => (
                    <li key={n.id} className="rounded-xl bg-mist p-3">
                      <p className="text-sm font-medium text-navy-900">{n.subject}</p>
                      <p className="mt-0.5 text-xs text-navy-700">{n.body}</p>
                      <p className="mt-1 text-[11px] text-navy-500">{formatDateTime(n.created_at)} · in-app</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <AdviceNotice />
            <Link to="/portal" className="block text-xs font-semibold text-brand-600">
              Back to my portal
            </Link>
          </aside>
        </div>
      </div>
    </div>
  )
}
