import { Link, Navigate, useSearchParams } from 'react-router-dom'
import {
  Camera,
  Check,
  ChevronRight,
  Clock,
  FileText,
  MessageSquare,
  Phone,
  Plus,
  Upload,
} from 'lucide-react'
import {
  coverSectionLabel,
  ITEM_STATUS_LABEL,
  STATUS_LABEL,
  useConciergeHome,
  type ConciergeHome,
  type ConciergeItemStatus,
  type ConciergeStatus,
} from '@/api/concierge'
import { useMe } from '@/api/hooks'
import { ErrorState, LoadingState } from '@/broker/PageHeader'
import { Button } from '@/components/ui/button'
import { useSupabaseAuth } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { usePortalBasePath, usePortalCategory } from '@/pages/my/CustomerLayout'
import { ConciergeShell } from './ConciergeShell'

const ITEM_STATUS_CLASS: Record<ConciergeItemStatus, string> = {
  covered: 'bg-emerald-100 text-emerald-900',
  awaiting_quote: 'bg-amber-100 text-amber-950',
  awaiting_acceptance: 'bg-sky-100 text-sky-950',
  awaiting_cover: 'bg-navy-100 text-navy-800',
  replaced: 'bg-navy-100 text-navy-600',
  removed: 'bg-navy-100 text-navy-600',
}

const money = (n?: number | null) =>
  n == null || Number.isNaN(Number(n)) ? null : `R ${Number(n).toLocaleString('en-ZA')}`

function ItemIcon({ type }: { type: string }) {
  if (type === 'equipment') return <Camera className="h-5 w-5 text-navy-500" />
  return (
    <span className="grid h-14 w-14 place-items-center rounded-xl bg-navy-100 text-xs font-bold uppercase text-navy-600">
      {type.slice(0, 2)}
    </span>
  )
}

export default function ConciergeHomePage() {
  const { data: me, isLoading: meLoading } = useMe()
  const auth = useSupabaseAuth()
  const category = usePortalCategory()
  const basePath = usePortalBasePath()
  const [params] = useSearchParams()
  const previewPersonId = params.get('personId')
  const isCustomer = me?.role === 'customer'
  const isStaff =
    Boolean(me?.member_role) ||
    ['broker', 'manager', 'admin', 'platform_admin', 'platform_read_only', 'onboarding_reviewer'].includes(
      me?.role ?? '',
    ) ||
    Boolean(me?.organisation)
  const staffPreview = Boolean(isStaff && !isCustomer && previewPersonId)
  const home = useConciergeHome({
    enabled: isCustomer || staffPreview,
    authEmail: isCustomer ? me?.email : null,
    personId: staffPreview ? previewPersonId : null,
    staffPreview,
    categoryOverride: category,
  })

  if (meLoading) {
    return (
      <ConciergeShell>
        <LoadingState label="Opening VIP Concierge…" />
      </ConciergeShell>
    )
  }

  // Customers use Cover as the single items desk; concierge contact lives there.
  if (isCustomer && !staffPreview) {
    return <Navigate to={basePath} replace />
  }

  if (isStaff && !isCustomer && !staffPreview) {
    return <Navigate to="/broker/concierge" replace />
  }

  if (staffPreview && auth.status !== 'signed_in') {
    return (
      <ConciergeShell>
        <ErrorState
          message={
            auth.error ??
            'Preview needs a live Supabase login. Auth token grant failed for this staff identity.'
          }
        />
        <div className="mt-3 flex justify-center">
          <Button size="sm" variant="outline" asChild>
            <Link to="/broker/concierge">Concierge queue</Link>
          </Button>
        </div>
      </ConciergeShell>
    )
  }

  if (
    isCustomer &&
    (auth.status === 'signing_in' ||
      auth.status !== 'signed_in' ||
      (me?.email && auth.email?.toLowerCase() !== me.email.toLowerCase()))
  ) {
    const stuck =
      auth.status === 'error' ||
      (auth.status === 'signed_in' && me?.email && auth.email?.toLowerCase() !== me.email.toLowerCase())
    if (stuck) {
      return (
        <ConciergeShell>
          <section className="mx-auto max-w-lg rounded-2xl border border-navy-800/10 bg-white p-8 text-center">
            <h1 className="font-display text-xl font-bold text-navy-900">Concierge sign-in needed</h1>
            <p className="mt-2 text-sm text-navy-600">
              {auth.error ??
                'Supabase Auth is still on another user. Use Signed in as (header) to select your customer identity, then return here.'}
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button size="sm" variant="outline" asChild>
                <Link to="/my">Back to My Page</Link>
              </Button>
              <Button size="sm" variant="accent" asChild>
                <Link to="/sign-in?zone=client&next=/my/concierge">Sign in</Link>
              </Button>
            </div>
          </section>
        </ConciergeShell>
      )
    }
    return (
      <ConciergeShell>
        <LoadingState label="Connecting VIP Concierge…" />
      </ConciergeShell>
    )
  }

  if (home.isLoading) {
    return (
      <ConciergeShell>
        <LoadingState label="Opening VIP Concierge…" />
      </ConciergeShell>
    )
  }

  if (home.error || !home.data) {
    return (
      <ConciergeShell>
        <ErrorState message={home.error?.message ?? 'Unable to open Concierge'} />
        <div className="mt-3 flex justify-center">
          <Button size="sm" variant="outline" asChild>
            <Link to="/my">Back to My Page</Link>
          </Button>
        </div>
      </ConciergeShell>
    )
  }

  if (!home.data.enabled) {
    return (
      <ConciergeShell>
        <section className="mx-auto max-w-lg rounded-2xl border border-navy-800/10 bg-white p-8 text-center">
          <h1 className="font-display text-2xl font-bold text-navy-900">VIP Concierge</h1>
          <p className="mt-2 text-sm text-navy-600">
            Your account is not enrolled in Concierge yet. Ask your broker to enable it — My Page cover stays available.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button size="sm" variant="accent" asChild>
              <Link to="/my">Back to My Page</Link>
            </Button>
          </div>
        </section>
      </ConciergeShell>
    )
  }

  const dto = home.data
  const firstName = dto.greeting_name ?? 'there'
  const concierge = dto.concierge
  const actionRequests = (dto.requests ?? []).filter((r) => r.status === 'action_needed')
  const otherRequests = (dto.requests ?? []).filter((r) => r.status !== 'action_needed')

  return (
    <ConciergeShell>
      {staffPreview && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Staff preview of <strong>{dto.full_name}</strong> Concierge desk.
          <Link className="ml-2 font-semibold underline" to="/my/concierge">
            Exit preview
          </Link>
        </p>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-navy-950">VIP Concierge</h1>
          <p className="mt-1 text-sm text-navy-600">Welcome back, {firstName}.</p>
        </div>
        {!staffPreview && (
          <Button size="sm" className="bg-navy-950 text-white hover:bg-navy-900" asChild>
            <Link to="/my/concierge/new">
              <Plus className="h-4 w-4" /> New request
            </Link>
          </Button>
        )}
      </div>

      {concierge && (
        <section className="mt-6 overflow-hidden rounded-2xl border border-navy-800/10 bg-white shadow-sm">
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl bg-brand-900 text-2xl font-bold text-white">
                {concierge.name
                  .split(' ')
                  .map((p) => p[0])
                  .join('')
                  .slice(0, 2)}
              </div>
              <div>
                <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-950">
                  Your concierge
                </span>
                <h2 className="mt-1 font-display text-2xl font-bold text-navy-950">{concierge.name}</h2>
              </div>
            </div>
            {!staffPreview && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" className="bg-brand-800 text-white hover:bg-brand-900" asChild>
                  <Link to={`/my/concierge/new?kind=assist`}>
                    <MessageSquare className="h-4 w-4" /> Message {concierge.name.split(' ')[0]}
                  </Link>
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <Link to={`/my/concierge/new?kind=callback`}>
                    <Phone className="h-4 w-4" /> Request a call
                  </Link>
                </Button>
              </div>
            )}
          </div>
        </section>
      )}

      <div className="mt-6 space-y-4 lg:hidden">
        {actionRequests.map((r) => (
          <RequestCard key={r.id} request={r} highlight />
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section>
          <h3 className="text-sm font-semibold tracking-wide text-navy-500 uppercase">My items & cover</h3>
          <ul className="mt-3 space-y-3">
            {(dto.items ?? []).map((item) => (
              <ItemCard key={item.id} item={item} readOnly={staffPreview} />
            ))}
            {!staffPreview && (
              <li>
                <Link
                  to="/my/concierge/new?kind=add_item"
                  className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-navy-300 bg-white/60 px-3 py-4 text-sm font-semibold text-navy-700 hover:border-brand-400"
                >
                  <Plus className="h-4 w-4" /> Add an item to insure
                </Link>
              </li>
            )}
          </ul>
        </section>

        <div className="space-y-6">
          <section>
            <h3 className="text-sm font-semibold tracking-wide text-navy-500 uppercase">My policies</h3>
            <ul className="mt-3 space-y-2">
              {(dto.policies ?? []).length === 0 && (
                <li className="rounded-2xl border border-navy-800/10 bg-white p-4 text-sm text-navy-600">
                  No issued policies linked yet. Covered items will show a policy once your broker files cover.
                </li>
              )}
              {(dto.policies ?? []).map((p) => (
                <li key={p.id} className="rounded-2xl border border-navy-800/10 bg-white px-4 py-3 shadow-sm">
                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-800">
                      <FileText className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-navy-950">{p.policy_number || p.reference || 'Policy'}</p>
                      <p className="text-xs text-navy-600">
                        {coverSectionLabel(null, p.cover_type) ?? 'Cover'}
                        {p.cover_type === 'contents' ? ' · HCAT' : null}
                        {p.insurer_name ? ` · ${p.insurer_name}` : null}
                        {money(p.premium_amount) ? ` · ${money(p.premium_amount)}/${p.premium_frequency ?? 'mo'}` : null}
                      </p>
                      {p.items?.length > 0 && (
                        <p className="mt-1 text-[11px] text-navy-500">{p.items.map((i) => i.label).join(' · ')}</p>
                      )}
                      <div className="mt-2">
                        <Button size="sm" variant="outline" asChild>
                          <Link to={`/my?reportClaim=1&policyId=${p.id}`}>Open policy actions</Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3 className="text-sm font-semibold tracking-wide text-navy-500 uppercase">My requests</h3>
            <div className="mt-3 space-y-3">
              <div className="hidden space-y-3 lg:block">
                {actionRequests.map((r) => (
                  <RequestCard key={r.id} request={r} highlight />
                ))}
              </div>
              {otherRequests.map((r) => (
                <RequestCard key={r.id} request={r} />
              ))}
              {(dto.requests ?? []).length === 0 && (
                <p className="rounded-2xl border border-navy-800/10 bg-white p-4 text-sm text-navy-600">
                  No open requests. Ask your concierge when you need help with cover.
                </p>
              )}
            </div>
          </section>
        </div>
      </div>
    </ConciergeShell>
  )
}

function ItemCard({
  item,
  readOnly,
}: {
  item: NonNullable<ConciergeHome['items']>[number]
  readOnly?: boolean
}) {
  const status = (item.customer_status ?? 'awaiting_cover') as ConciergeItemStatus
  const section = coverSectionLabel(item.section_code, item.cover_type, item.item_type)
  const body = (
    <>
      {item.photo_url ? (
        <img src={item.photo_url} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
      ) : (
        <ItemIcon type={item.item_type} />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-navy-950">{item.display_label}</p>
        <p className="mt-0.5 text-[11px] font-semibold tracking-wide text-navy-500 uppercase">
          {item.section_code ? `${item.section_code} · ` : null}
          {section}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', ITEM_STATUS_CLASS[status])}>
            {status === 'covered' ? <Check className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
            {ITEM_STATUS_LABEL[status]}
          </span>
          {item.policy_number || item.policy_reference ? (
            <span className="text-[11px] font-medium text-brand-800">
              {item.policy_number || item.policy_reference}
              {item.insurer_name ? ` · ${item.insurer_name}` : null}
            </span>
          ) : (
            <span className="text-[11px] text-navy-500">No policy linked yet</span>
          )}
        </div>
        {(money(item.insured_value) || money(item.premium_amount)) && (
          <p className="mt-1 text-xs text-navy-600">
            {money(item.insured_value) ? `Insured ${money(item.insured_value)}` : null}
            {money(item.insured_value) && money(item.premium_amount) ? ' · ' : null}
            {money(item.premium_amount) ? `${money(item.premium_amount)}/${item.premium_frequency ?? 'mo'}` : null}
          </p>
        )}
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-navy-400" />
    </>
  )

  return (
    <li>
      {readOnly ? (
        <div className="flex items-center gap-3 rounded-2xl border border-navy-800/10 bg-white p-3 shadow-sm">{body}</div>
      ) : (
        <Link
          to={
            item.policy_id
              ? `/my?reportClaim=1&policyId=${item.policy_id}&itemId=${item.id}`
              : `/my/concierge/new?itemId=${item.id}`
          }
          className="flex items-center gap-3 rounded-2xl border border-navy-800/10 bg-white p-3 shadow-sm transition hover:border-brand-300"
        >
          {body}
        </Link>
      )}
    </li>
  )
}

function RequestCard({
  request,
  highlight,
}: {
  request: {
    id: string
    title: string
    status: ConciergeStatus
    next_action: string | null
    owner_name: string | null
  }
  highlight?: boolean
}) {
  return (
    <article
      className={cn(
        'rounded-2xl border bg-white p-4 shadow-sm',
        highlight ? 'border-amber-300 ring-1 ring-amber-200' : 'border-navy-800/10',
      )}
    >
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-800">
          <Camera className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-navy-950">{request.title}</p>
          {highlight && (
            <span className="mt-1 inline-flex rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-900">
              {STATUS_LABEL[request.status]}
            </span>
          )}
          {request.next_action && (
            <p className="mt-2 text-sm text-navy-600">
              {request.owner_name ? `${request.owner_name.split(' ')[0]} — ` : null}
              {request.next_action === 'Upload receipt'
                ? 'Lerato has asked for proof of purchase.'
                : request.next_action}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {request.status === 'action_needed' && (
              <Button size="sm" className="bg-brand-800 text-white hover:bg-brand-900" asChild>
                <Link to={`/my/concierge/requests/${request.id}`}>
                  <Upload className="h-4 w-4" /> Upload receipt
                </Link>
              </Button>
            )}
            <Button size="sm" variant="outline" asChild>
              <Link to={`/my/concierge/requests/${request.id}`}>View updates</Link>
            </Button>
          </div>
        </div>
      </div>
    </article>
  )
}
