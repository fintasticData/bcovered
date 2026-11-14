import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { StepResult } from '@/copilot/api'
import type { FranchiseEnquiryGrid, FranchisePerformance, FranchiseSales, SetupReceipt } from '@/copilot/franchiseApi'
import { EmptyState } from '../PageHeader'
import { MemberLabel, dateTime, money, shortDate } from '../book/bits'
import { OutletReceipt } from './dialogs'
import { EnquiryStageBadge, pct } from './shared'

export const isFranchiseStep = (step: StepResult) => step.intent === 'franchise_setup' || step.intent === 'franchise_enquiries' || step.intent === 'franchise_sales'

/** Russ's franchise results in the editor: the outlet setup with its QR code, the enquiry grid, or outlet totals with their sales. */
export function FranchiseStepView({ step }: { step: StepResult }) {
  const d = step.data
  if (!d) return <EmptyState title={step.title}>{step.summary}</EmptyState>
  if (step.intent === 'franchise_setup') {
    const r = d as SetupReceipt
    return r.outlet ? <OutletReceipt r={r} /> : <EmptyState title={step.title}>{step.summary}</EmptyState>
  }
  if (step.intent === 'franchise_enquiries') return <EnquiryRows grid={d as FranchiseEnquiryGrid} />
  if ('by_outlet' in (d as object)) return <SalesTotals sales={d as FranchiseSales} />
  return <Performance perf={d as FranchisePerformance} />
}

function EnquiryRows({ grid }: { grid: FranchiseEnquiryGrid }) {
  if (!grid.rows.length) return <EmptyState title="No franchise enquiries match" />
  return (
    <div className="overflow-x-auto rounded-xl border border-navy-800/10">
      <table className="w-full min-w-[36rem] text-left text-sm">
        <thead className="bg-navy-50/80 text-[11px] font-semibold tracking-wide text-navy-500 uppercase">
          <tr>
            <th className="px-3 py-2">Outlet</th>
            <th className="px-3 py-2">Client or contact</th>
            <th className="px-3 py-2">Assigned broker</th>
            <th className="px-3 py-2">Received</th>
            <th className="px-3 py-2">Progress</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-navy-800/5">
          {grid.rows.map((r) => (
            <tr key={r.id}>
              <td className="px-3 py-2">{r.outlet.label}</td>
              <td className="px-3 py-2">
                <Link to={r.open_path} className="font-medium text-brand-700 hover:underline">{r.name}</Link>
                <span className="block font-mono text-[11px] text-navy-500">{r.client?.client_number ?? r.phone ?? '–'}</span>
              </td>
              <td className="px-3 py-2"><MemberLabel member={r.handler} /></td>
              <td className="px-3 py-2 text-xs">{dateTime(r.received_at)}</td>
              <td className="px-3 py-2"><EnquiryStageBadge stage={r.stage} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-3 py-2 text-[11px] text-navy-500">Open a client to log the call and set the follow-up.</p>
    </div>
  )
}

function SalesTotals({ sales }: { sales: FranchiseSales }) {
  const [outlet, setOutlet] = useState<string | null>(null)
  if (!sales.by_outlet.length) return <EmptyState title="No confirmed franchise sales in this period">{sales.note}</EmptyState>
  const rows = sales.rows.filter((r) => !outlet || r.outlet.id === outlet)
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-navy-800/5 rounded-xl border border-navy-800/10 bg-white">
        {sales.by_outlet.map((o) => (
          <li key={o.outlet_id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
            <span className="text-navy-900">{o.label}</span>
            <button type="button" aria-pressed={outlet === o.outlet_id} className="cursor-pointer font-semibold text-brand-700 hover:underline" onClick={() => setOutlet(outlet === o.outlet_id ? null : o.outlet_id)}>
              {o.sales} sale{o.sales === 1 ? '' : 's'}
            </button>
          </li>
        ))}
      </ul>
      <ul className="space-y-2">
        {rows.map((s) => (
          <li key={s.id} className="rounded-lg border border-navy-800/10 bg-white px-3 py-2 text-xs text-navy-700">
            <span className="font-mono font-semibold text-navy-900">{s.reference}</span> · sold {shortDate(s.sold_at)} · enquiry <span className="font-mono">{s.enquiry?.reference ?? '–'}</span>
            <span className="block">
              {s.client ? <Link to={s.open_path} className="text-brand-700 hover:underline">{s.client.name} {s.client.client_number}</Link> : '–'} · seller {s.seller?.name ?? '–'} · {s.outlet.label} · {money(s.premium_amount)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Performance({ perf }: { perf: FranchisePerformance }) {
  if (!perf.rows.length) return <EmptyState title="No outlets yet" />
  return (
    <div className="overflow-x-auto rounded-xl border border-navy-800/10">
      <table className="w-full text-left text-sm">
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
          {perf.rows.map((r) => (
            <tr key={r.id}>
              <td className="px-3 py-2">{r.label}</td>
              <td className="px-3 py-2">{r.service_area ?? '–'}</td>
              <td className="px-3 py-2 text-right">{r.enquiries}</td>
              <td className="px-3 py-2 text-right">{r.offered}</td>
              <td className="px-3 py-2 text-right">{r.sold}</td>
              <td className="px-3 py-2 text-right font-semibold">{pct(r.conversion)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
