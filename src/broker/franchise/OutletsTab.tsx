import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Info } from 'lucide-react'
import { useFranchisePerformance, useFranchiseSales, type FranchiseSale } from '@/copilot/franchiseApi'
import { dataCategory, type DataCategory } from '@/lib/supabase/category'
import { cn } from '@/lib/utils'
import { EmptyState, LoadingState } from '../PageHeader'
import { ErrorText, MemberLabel, money, perFrequency, shortDate } from '../book/bits'
import { Chips, pct } from './shared'

type View = 'intake' | 'sales'

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border border-navy-800/10 bg-white px-3 py-2.5">
      <p className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">{label}</p>
      <p className="mt-0.5 text-xl font-semibold text-navy-900">{value}</p>
      {hint && <p className="text-[11px] text-navy-500">{hint}</p>}
    </div>
  )
}

/** One grid of outlets: enquiries, enquiries offered, enquiries sold and conversion for the intake period, or confirmed sales by sale date. */
export function OutletsTab({ category, from, to, view, onView, onOpenOutlet, onOpenEnquiries }: {
  category: DataCategory
  from: string | null
  to: string | null
  view: View
  onView: (v: View) => void
  onOpenOutlet: (outletId: string) => void
  onOpenEnquiries: (a: { outlet_id: string; status: 'sold' | 'offered' | null }) => void
}) {
  return (
    <div className="space-y-4">
      <Chips<View>
        label="Outlet report"
        value={view}
        onChange={onView}
        options={[{ id: 'intake', label: 'Enquiries and conversion' }, { id: 'sales', label: 'Sales by sale date' }]}
      />
      {view === 'intake' ? (
        <Intake category={category} from={from} to={to} onOpenOutlet={onOpenOutlet} onOpenEnquiries={onOpenEnquiries} />
      ) : (
        <SalesByOutlet category={category} from={from} to={to} />
      )}
    </div>
  )
}

function Intake({ category, from, to, onOpenOutlet, onOpenEnquiries }: {
  category: DataCategory
  from: string | null
  to: string | null
  onOpenOutlet: (outletId: string) => void
  onOpenEnquiries: (a: { outlet_id: string; status: 'sold' | 'offered' | null }) => void
}) {
  const q = useFranchisePerformance(category, { from, to })
  if (q.isLoading) return <LoadingState label="Counting outlet enquiries…" />
  if (q.error) return <ErrorText error={q.error} />
  const d = q.data!
  const t = d.totals
  const count = (n: number, outletId: string, status: 'sold' | 'offered' | null, label: string) =>
    n > 0 ? (
      <button type="button" className="cursor-pointer font-semibold text-brand-700 hover:underline" onClick={() => onOpenEnquiries({ outlet_id: outletId, status })} aria-label={label}>
        {n}
      </button>
    ) : <span className="text-navy-400">0</span>
  return (
    <div className="@container space-y-4">
      {d.note && <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {d.note}</p>}
      <div className="grid grid-cols-2 gap-2 @xl:grid-cols-4">
        <Stat label="Enquiries received" value={t.enquiries} hint={`${t.outlets} outlet${t.outlets === 1 ? '' : 's'}`} />
        <Stat label="Offered" value={t.offered} hint="Enquiries with an offer sent" />
        <Stat label="Sold" value={t.sold} hint="Confirmed cover" />
        <Stat label="Conversion" value={pct(t.conversion)} hint="Sold ÷ received" />
      </div>
      {d.rows.length === 0 ? (
        category === 'live' ? (
          <EmptyState title="No Live outlets yet">Live totals only count Live outlets and enquiries; Sample set-up and test sales are never included. Switch the report to Sample to see them.</EmptyState>
        ) : (
          <EmptyState title="No outlets yet">Set up a franchisee and its outlet to give it a customer code, link and QR code.</EmptyState>
        )
      ) : (
        <>
        <ul className="space-y-2 @2xl:hidden" aria-label="Outlets">
          {d.rows.map((r) => (
            <li key={r.id} className={cn('rounded-xl border border-navy-800/10 bg-white p-3 text-sm', r.status === 'paused' && 'opacity-60')}>
              <div className="flex items-start justify-between gap-2">
                <button type="button" className="min-w-0 cursor-pointer text-left" onClick={() => onOpenOutlet(r.id)}>
                  <span className="block truncate font-medium text-navy-900 hover:underline">{r.name}</span>
                  <span className="block text-[11px] text-navy-500">{r.partner_name} · {r.sales_mode_label}{r.service_area ? ` · ${r.service_area}` : ''}{r.status === 'paused' ? ' · paused' : ''}</span>
                </button>
                <span className="shrink-0 text-right">
                  <span className="block text-base font-semibold text-navy-900">{pct(r.conversion)}</span>
                  <span className="block text-[10px] text-navy-500">conversion</span>
                </span>
              </div>
              <dl className="mt-2 grid grid-cols-3 gap-2 border-t border-navy-800/5 pt-2 text-xs">
                <div><dt className="text-[10px] font-semibold tracking-wide text-navy-500 uppercase">Enquiries</dt><dd>{count(r.enquiries, r.id, null, `Open ${r.enquiries} enquiries from ${r.label}`)}</dd></div>
                <div><dt className="text-[10px] font-semibold tracking-wide text-navy-500 uppercase">Offered</dt><dd>{count(r.offered, r.id, null, `Open enquiries from ${r.label}`)}</dd></div>
                <div><dt className="text-[10px] font-semibold tracking-wide text-navy-500 uppercase">Sold</dt><dd>{count(r.sold, r.id, 'sold', `Open sold enquiries from ${r.label}`)}</dd></div>
              </dl>
            </li>
          ))}
        </ul>
        <div className="hidden overflow-x-auto rounded-xl border border-navy-800/10 @2xl:block">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="bg-navy-50/80 text-[11px] font-semibold tracking-wide text-navy-500 uppercase">
              <tr>
                <th className="px-3 py-2">Outlet</th>
                <th className="px-3 py-2">Area</th>
                <th className="px-3 py-2 text-right">Enquiries</th>
                <th className="px-3 py-2 text-right">Offered</th>
                <th className="px-3 py-2 text-right">Sold</th>
                <th className="px-3 py-2 text-right">Conversion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-800/5">
              {d.rows.map((r) => (
                <tr key={r.id} className={cn(r.status === 'paused' && 'opacity-60')}>
                  <td className="px-3 py-2.5">
                    <button type="button" className="cursor-pointer text-left" onClick={() => onOpenOutlet(r.id)}>
                      <span className="block font-medium text-navy-900 hover:underline">{r.name}</span>
                      <span className="block text-[11px] text-navy-500">{r.partner_name} · {r.sales_mode_label}{r.status === 'paused' ? ' · paused' : ''}</span>
                    </button>
                  </td>
                  <td className="px-3 py-2.5 text-navy-700">{r.service_area ?? '–'}</td>
                  <td className="px-3 py-2.5 text-right">{count(r.enquiries, r.id, null, `Open ${r.enquiries} enquiries from ${r.label}`)}</td>
                  <td className="px-3 py-2.5 text-right">{count(r.offered, r.id, null, `Open enquiries from ${r.label}`)}</td>
                  <td className="px-3 py-2.5 text-right">{count(r.sold, r.id, 'sold', `Open sold enquiries from ${r.label}`)}</td>
                  <td className="px-3 py-2.5 text-right font-semibold text-navy-900">{pct(r.conversion)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
      {d.partners.length > 1 && (
        <div className="overflow-x-auto rounded-xl border border-navy-800/10">
          <table className="w-full text-left text-sm">
            <caption className="px-3 pt-2 text-left text-[11px] font-semibold tracking-wide text-navy-500 uppercase">By franchisee</caption>
            <tbody className="divide-y divide-navy-800/5">
              {d.partners.map((p) => (
                <tr key={p.partner_id}>
                  <td className="px-3 py-2 font-medium text-navy-900">{p.name}</td>
                  <td className="px-3 py-2 text-navy-600">{p.outlets} outlet{p.outlets === 1 ? '' : 's'}</td>
                  <td className="px-3 py-2 text-right">{p.enquiries} received</td>
                  <td className="px-3 py-2 text-right">{p.sold} sold</td>
                  <td className="px-3 py-2 text-right font-semibold">{pct(p.conversion)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-navy-500">
        Counts enquiries received in the period. Each enquiry counts once at each stage, however many insurer quotes it had. Conversion is enquiries resulting in a confirmed sale ÷ enquiries received.
      </p>
    </div>
  )
}

function SalesByOutlet({ category, from, to }: { category: DataCategory; from: string | null; to: string | null }) {
  const [outletId, setOutletId] = useState<string | null>(null)
  const q = useFranchiseSales(category, { from, to })
  if (q.isLoading) return <LoadingState label="Loading sales by outlet…" />
  if (q.error) return <ErrorText error={q.error} />
  const d = q.data!
  const rows = outletId ? d.rows.filter((r) => r.outlet.id === outletId) : d.rows
  return (
    <div className="space-y-4">
      {d.note && <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {d.note}</p>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="Confirmed sales" value={d.totals.sales} hint="By sale date" />
        <Stat label="Outlets with sales" value={d.totals.outlets} />
        <Stat label="Premium" value={money(d.totals.monthly_premium)} hint="Monthly equivalent" />
      </div>
      {d.by_outlet.length === 0 ? (
        <EmptyState title="No confirmed franchise sales in this period" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-navy-800/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-navy-50/80 text-[11px] font-semibold tracking-wide text-navy-500 uppercase">
              <tr>
                <th className="px-3 py-2">Originating outlet</th>
                <th className="px-3 py-2 text-right">Sales</th>
                <th className="px-3 py-2 text-right">Premium (monthly)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-800/5">
              {d.by_outlet.map((o) => (
                <tr key={o.outlet_id} className={cn(outletId === o.outlet_id && 'bg-brand-50/60')}>
                  <td className="px-3 py-2.5 font-medium text-navy-900">{o.label}</td>
                  <td className="px-3 py-2.5 text-right">
                    <button type="button" className="cursor-pointer font-semibold text-brand-700 hover:underline" aria-pressed={outletId === o.outlet_id}
                      onClick={() => setOutletId(outletId === o.outlet_id ? null : o.outlet_id)}>
                      {o.sales}
                    </button>
                  </td>
                  <td className="px-3 py-2.5 text-right">{money(o.monthly_premium)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > 0 && <SalesList rows={rows} category={category} title={outletId ? `Sales from ${rows[0].outlet.label}` : 'All sales in the period'} onClear={outletId ? () => setOutletId(null) : undefined} />}
    </div>
  )
}

function SalesList({ rows, category, title, onClear }: { rows: FranchiseSale[]; category: DataCategory; title: string; onClear?: () => void }) {
  const navigate = useNavigate()
  const open = (path: string) => {
    dataCategory.set(category)
    navigate(path)
  }
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-navy-500 uppercase">{title}</h3>
        {onClear && <button type="button" className="cursor-pointer text-xs font-semibold text-brand-700 hover:underline" onClick={onClear}>Show all outlets</button>}
      </div>
      <ul className="space-y-2">
        {rows.map((s) => (
          <li key={s.id} className="rounded-xl border border-navy-800/10 bg-white px-3 py-2.5 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-xs font-semibold text-navy-900">{s.reference}</span>
              <span className="text-xs text-navy-500">Sold {shortDate(s.sold_at)} · cover from {shortDate(s.cover_start_date)}</span>
            </div>
            <div className="mt-1 grid gap-1 text-xs text-navy-700 sm:grid-cols-2">
              <span>
                Client{' '}
                {s.client ? (
                  <button type="button" className="cursor-pointer font-medium text-brand-700 hover:underline" onClick={() => open(s.open_path)}>
                    {s.client.name} <span className="font-mono">{s.client.client_number}</span>
                  </button>
                ) : '–'}
              </span>
              <span>Enquiry <span className="font-mono">{s.enquiry?.reference ?? '–'}</span>{s.enquiry ? ` · received ${shortDate(s.enquiry.received_at)}` : ''}</span>
              <span>Outlet {s.outlet.label}{s.referred_by ? ` · referred by ${s.referred_by.name}` : ''}</span>
              <span className="flex items-center gap-1">Seller <MemberLabel member={s.seller} /></span>
              <span>{s.offer ? `${s.offer.insurer} · ${s.offer.product.replace(/_/g, ' ')}` : '–'} · {money(s.premium_amount)} {perFrequency(s.premium_frequency)}</span>
              <span>Insurer reference <span className="font-mono">{s.insurer_reference}</span></span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
