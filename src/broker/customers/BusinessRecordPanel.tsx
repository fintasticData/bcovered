import { Link } from 'react-router-dom'
import { FileStack, Network, Sparkles, Store } from 'lucide-react'
import { useCommercialClient } from '@/api/hooks'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useDataCategory } from '@/lib/supabase/category'
import { useFranchiseList } from '@/copilot/franchiseApi'
import { EmptyState, ErrorState, LoadingState } from '../PageHeader'
import { AskCopilotButton } from '../copilot/AskCopilotButton'
import { SetupFranchiseDialog } from '../franchise/dialogs'
import { useState } from 'react'
import { coverLabel } from './commercialInterests'
import { lensPath } from '../russ/lenses'

export function BusinessRecordPanel({
  profileId,
  tab,
  onTab,
  canManage,
}: {
  profileId: string
  tab: string
  onTab: (tab: string) => void
  canManage: boolean
}) {
  const { data, isLoading, error } = useCommercialClient(profileId)
  const category = useDataCategory()
  const franchise = useFranchiseList(category)
  const [setupOpen, setSetupOpen] = useState(false)

  if (isLoading) return <LoadingState label="Opening business…" />
  if (error || !data) return <ErrorState message={error?.message ?? 'Business not found'} />

  const p = data.profile
  const name = p.trading_name ?? p.registered_name
  const partner = (franchise.data?.partners ?? []).find((x) => x.customer_id === p.customer_id)
  const roles = ['commercial_client', ...(partner ? ['franchisee'] : [])]
  const activeTab = ['overview', 'relationships', 'outlets', 'quotes', 'activity'].includes(tab) ? tab : 'overview'
  const openTasks = data.tasks.filter((t) => t.status === 'open').length

  return (
    <div className="space-y-4">
      <header className="space-y-2">
        <p className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">{data.industry.name}</p>
        <h2 className="text-xl font-semibold text-navy-900">{name}</h2>
        <p className="text-sm text-navy-600">
          Who: {name}
          {p.trading_name && p.trading_name !== p.registered_name ? ` (${p.registered_name})` : ''} · Broker:{' '}
          {data.assigned_broker ?? 'unassigned'} · Locations: {data.locations.length}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={p.status} />
          {roles.map((role) => (
            <span key={role} className="rounded-full bg-navy-50 px-2 py-0.5 text-[10px] font-semibold text-navy-700 ring-1 ring-navy-800/10">
              {role.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <AskCopilotButton copilot="ava" kind="account" id={p.customer_id} />
          <Button variant="outline" size="sm" asChild>
            <Link to={`/broker/commercial/risk-twins/${p.id}`}>
              <Network /> Risk Twin
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to={lensPath('commercial', `Request a commercial property quote for ${name}`)}>
              <Sparkles /> Ask Russ for quote
            </Link>
          </Button>
          {canManage && !partner && (
            <Button size="sm" variant="accent" onClick={() => setSetupOpen(true)}>
              <Store /> Add franchisee role
            </Button>
          )}
          {partner && (
            <Button size="sm" variant="outline" asChild>
              <Link to={`/broker/franchise?tab=franchisees`}>
                <Store /> Franchise operations
              </Link>
            </Button>
          )}
        </div>
      </header>

      <Tabs value={activeTab} onValueChange={onTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="relationships">Relationships</TabsTrigger>
          <TabsTrigger value="outlets">Outlets & referrals</TabsTrigger>
          <TabsTrigger value="quotes">Quotes & policies</TabsTrigger>
          <TabsTrigger value="activity">Chats & activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-3 pt-4">
          <dl className="grid gap-3 sm:grid-cols-2 text-sm">
            <div className="rounded-xl border border-navy-800/10 bg-white p-3">
              <dt className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Industry</dt>
              <dd className="mt-1 text-navy-900">{data.industry.name}</dd>
            </div>
            <div className="rounded-xl border border-navy-800/10 bg-white p-3">
              <dt className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Responsible broker</dt>
              <dd className="mt-1 text-navy-900">{data.assigned_broker ?? 'Unassigned'}</dd>
            </div>
            <div className="rounded-xl border border-navy-800/10 bg-white p-3 sm:col-span-2">
              <dt className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Next action</dt>
              <dd className="mt-1 text-navy-900">
                {openTasks > 0
                  ? `${openTasks} open request${openTasks === 1 ? '' : 's'}`
                  : data.risk_profile
                    ? 'Review exposures and request a quote'
                    : 'Build the Risk Twin or add franchisee outlets'}
              </dd>
            </div>
          </dl>
          {data.submissions[0] && (
            <Button size="sm" variant="outline" asChild>
              <Link to={`/broker/commercial/submissions/${data.submissions[0].id}`}>
                <FileStack /> Open submission pack
              </Link>
            </Button>
          )}
        </TabsContent>

        <TabsContent value="relationships" className="pt-4">
          <EmptyState title="Linked people">
            People linked as directors, employees, primary contacts or outlet managers appear here. Ask Ava to add or link a contact.
          </EmptyState>
        </TabsContent>

        <TabsContent value="outlets" className="space-y-3 pt-4">
          {!partner ? (
            <EmptyState title="No franchisee role yet">
              {canManage ? (
                <Button size="sm" className="mt-3" onClick={() => setSetupOpen(true)}>
                  <Store /> Add franchisee role and outlet
                </Button>
              ) : (
                'Ask a brokerage admin to set up franchisee outlets for this business.'
              )}
            </EmptyState>
          ) : (
            <ul className="space-y-2">
              {partner.outlets.map((o) => (
                <li key={o.id} className="rounded-xl border border-navy-800/10 bg-white p-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-navy-900">{o.name}</p>
                      <p className="text-xs text-navy-600">
                        {o.service_area ?? 'No service area'} · {o.sales_mode_label} · code {o.referral_code}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" asChild>
                      <Link to={`/broker/franchise?tab=franchisees&outlet=${o.id}`}>Open outlet</Link>
                    </Button>
                  </div>
                </li>
              ))}
              {canManage && (
                <Button size="sm" variant="outline" onClick={() => setSetupOpen(true)}>
                  Add another outlet
                </Button>
              )}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="quotes" className="space-y-3 pt-4">
          {(p.cover_interests ?? []).length > 0 && (
            <div className="rounded-xl border border-navy-800/10 bg-white p-3">
              <p className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Interested cover</p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {(p.cover_interests ?? []).map((c) => (
                  <li key={c.key} className="rounded-lg border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-900">
                    {coverLabel(c.key)}
                  </li>
                ))}
              </ul>
              {(p.cover_interests ?? []).some((c) => c.related.length > 0) && (
                <ul className="mt-2 space-y-1 text-xs text-navy-700">
                  {(p.cover_interests ?? []).flatMap((c) =>
                    c.related.map((item) => (
                      <li key={`${c.key}:${item}`} className="flex gap-2">
                        <span className="text-navy-400">·</span>
                        <span>
                          {item} <span className="text-navy-500">({coverLabel(c.key)})</span>
                        </span>
                      </li>
                    )),
                  )}
                </ul>
              )}
            </div>
          )}
          <EmptyState title="Quotes & policies">
            Continue commercial quotes from the Risk Twin or ask Russ via Ava to prepare a commercial property quote for {name}.
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <Button size="sm" asChild>
                <Link to={`/broker/commercial/risk-twins/${p.id}`}>Open Twin workspace</Link>
              </Button>
              <Button size="sm" variant="outline" asChild>
                <Link
                  to={lensPath(
                    'commercial',
                    (p.cover_interests ?? []).length
                      ? `Request a commercial quote for ${name} covering ${(p.cover_interests ?? []).map((c) => coverLabel(c.key)).join(', ')}`
                      : `Request a commercial property quote for ${name}`,
                  )}
                >
                  Ask Russ
                </Link>
              </Button>
            </div>
          </EmptyState>
        </TabsContent>

        <TabsContent value="activity" className="pt-4">
          <EmptyState title="Chats & activity">
            Ava and Russ conversations linked to this business appear here after they are saved against the responsible broker.
          </EmptyState>
        </TabsContent>
      </Tabs>

      {setupOpen && (
        <SetupFranchiseDialog
          partner={partner ? { id: partner.id, name: partner.name } : undefined}
          defaultPartnerName={partner ? undefined : name}
          customerId={p.customer_id}
          onClose={() => setSetupOpen(false)}
          onDone={() => setSetupOpen(false)}
        />
      )}
    </div>
  )
}
