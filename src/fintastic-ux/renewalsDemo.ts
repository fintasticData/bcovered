/** Demo renewal queue shared by Renewals workspace and customer/business drawers. */

import { zar } from '@/lib/money'

export { zar }

export type RenewalStatus = 'review_excess' | 'review_change' | 'no_change'

export type RenewalRow = {
  id: string
  client: string
  policyNumber: string
  coverType: string
  expiringExcess: number
  proposedExcess: number
  expiringPremium: number
  proposedPremium: number
  status: RenewalStatus
  period: string
  renewalDate: string
  sumInsured: number
  /** Matches demo Ubuntu Foods business profile / customer when bridging drawers. */
  businessProfileId?: string
  customerId?: string
}

export const UBUNTU_FOODS_RENEWAL_ID = 'r1'
export const UBUNTU_FOODS_PROFILE_ID = 'a0000000-0000-4000-8000-000000000601'
export const UBUNTU_FOODS_CUSTOMER_ID = 'a0000000-0000-4000-8000-000000000305'

export const RENEWAL_DEMO: RenewalRow[] = [
  {
    id: 'r1',
    client: 'Ubuntu Foods (Pty) Ltd',
    policyNumber: 'BCF1234567',
    coverType: 'Commercial Combined',
    expiringExcess: 10000,
    proposedExcess: 15000,
    expiringPremium: 184320,
    proposedPremium: 176640,
    status: 'review_excess',
    period: 'Ending Mar 2026',
    renewalDate: '2026-03-15',
    sumInsured: 12000000,
    businessProfileId: UBUNTU_FOODS_PROFILE_ID,
    customerId: UBUNTU_FOODS_CUSTOMER_ID,
  },
  {
    id: 'r2',
    client: 'Mzansi Logistics',
    policyNumber: 'BCF1234890',
    coverType: 'Motor fleet',
    expiringExcess: 5000,
    proposedExcess: 7500,
    expiringPremium: 96200,
    proposedPremium: 94100,
    status: 'review_change',
    period: 'Ending Apr 2026',
    renewalDate: '2026-04-01',
    sumInsured: 4200000,
  },
  {
    id: 'r3',
    client: 'Kalahari Retail',
    policyNumber: 'BCF1235012',
    coverType: 'Commercial Combined',
    expiringExcess: 10000,
    proposedExcess: 10000,
    expiringPremium: 128400,
    proposedPremium: 128400,
    status: 'no_change',
    period: 'Ending May 2026',
    renewalDate: '2026-05-12',
    sumInsured: 8500000,
  },
  {
    id: 'r4',
    client: 'CapeRisk Packers',
    policyNumber: 'BCF1235111',
    coverType: 'Goods in transit',
    expiringExcess: 2500,
    proposedExcess: 5000,
    expiringPremium: 41200,
    proposedPremium: 39850,
    status: 'review_excess',
    period: 'Ending Mar 2026',
    renewalDate: '2026-03-28',
    sumInsured: 1500000,
  },
  {
    id: 'r5',
    client: 'Highveld Clinics',
    policyNumber: 'BCF1235200',
    coverType: 'Professional indemnity',
    expiringExcess: 15000,
    proposedExcess: 20000,
    expiringPremium: 72000,
    proposedPremium: 76500,
    status: 'review_excess',
    period: 'Ending Jun 2026',
    renewalDate: '2026-06-01',
    sumInsured: 5000000,
  },
  {
    id: 'r6',
    client: 'Garden Route Hotels',
    policyNumber: 'BCF1235301',
    coverType: 'Commercial Combined',
    expiringExcess: 10000,
    proposedExcess: 10000,
    expiringPremium: 210000,
    proposedPremium: 205800,
    status: 'no_change',
    period: 'Ending Jul 2026',
    renewalDate: '2026-07-18',
    sumInsured: 28000000,
  },
  {
    id: 'r7',
    client: 'Soweto Motors',
    policyNumber: 'BCF1235402',
    coverType: 'Motor fleet',
    expiringExcess: 3500,
    proposedExcess: 5000,
    expiringPremium: 54800,
    proposedPremium: 56100,
    status: 'review_change',
    period: 'Ending Apr 2026',
    renewalDate: '2026-04-22',
    sumInsured: 2100000,
  },
  {
    id: 'r8',
    client: 'Drakensberg Farms',
    policyNumber: 'BCF1235503',
    coverType: 'Agri package',
    expiringExcess: 7500,
    proposedExcess: 10000,
    expiringPremium: 89000,
    proposedPremium: 91200,
    status: 'review_excess',
    period: 'Ending Aug 2026',
    renewalDate: '2026-08-05',
    sumInsured: 9600000,
  },
  {
    id: 'r9',
    client: 'Table Bay Logistics',
    policyNumber: 'BCF1235604',
    coverType: 'Goods in transit',
    expiringExcess: 5000,
    proposedExcess: 5000,
    expiringPremium: 33600,
    proposedPremium: 32800,
    status: 'no_change',
    period: 'Ending Sep 2026',
    renewalDate: '2026-09-14',
    sumInsured: 1800000,
  },
  {
    id: 'r10',
    client: 'Limpopo Retail Group',
    policyNumber: 'BCF1235705',
    coverType: 'Commercial Combined',
    expiringExcess: 12000,
    proposedExcess: 15000,
    expiringPremium: 156000,
    proposedPremium: 149500,
    status: 'review_change',
    period: 'Ending Mar 2026',
    renewalDate: '2026-03-30',
    sumInsured: 14000000,
  },
]

export const STATUS_LABEL: Record<RenewalStatus, string> = {
  review_excess: 'Review excess',
  review_change: 'Review change',
  no_change: 'No change',
}

export const STATUS_CLASS: Record<RenewalStatus, string> = {
  review_excess: 'bg-amber-100 text-amber-900',
  review_change: 'bg-sky-100 text-sky-900',
  no_change: 'bg-emerald-100 text-emerald-900',
}

export function findRenewalForBusiness(profileId: string, tradingName?: string | null) {
  const byId = RENEWAL_DEMO.find((r) => r.businessProfileId === profileId)
  if (byId) return byId
  const name = (tradingName ?? '').toLowerCase()
  if (name.includes('ubuntu foods')) return RENEWAL_DEMO.find((r) => r.id === UBUNTU_FOODS_RENEWAL_ID) ?? null
  return null
}

export function findRenewalForCustomer(customerId: string, customerName?: string | null) {
  const byId = RENEWAL_DEMO.find((r) => r.customerId === customerId)
  if (byId) return byId
  const name = (customerName ?? '').toLowerCase()
  if (name.includes('ubuntu foods')) return RENEWAL_DEMO.find((r) => r.id === UBUNTU_FOODS_RENEWAL_ID) ?? null
  return null
}

export function renewalDecisionHeadline(row: RenewalRow): string {
  const delta = row.proposedExcess - row.expiringExcess
  if (delta > 0) return `Excess increases by ${zar(delta)}`
  if (delta < 0) return `Excess decreases by ${zar(Math.abs(delta))}`
  const pct =
    row.expiringPremium === 0
      ? 0
      : ((row.proposedPremium - row.expiringPremium) / row.expiringPremium) * 100
  if (pct !== 0) return `Premium changes by ${pct.toFixed(1)}%`
  return 'No material change on this renewal'
}

export function renewalRussMessage(row: RenewalRow): string {
  const delta = row.proposedExcess - row.expiringExcess
  if (delta > 0) {
    return `The insurer is proposing ${zar(delta)} more excess (${zar(row.expiringExcess)} → ${zar(row.proposedExcess)}).`
  }
  if (delta < 0) {
    return `Proposed excess is ${zar(Math.abs(delta))} lower than expiring terms.`
  }
  return 'Excess is unchanged on the proposed renewal.'
}

export function renewalQueueHref(focusId: string, extra?: Record<string, string | null | undefined>) {
  const params = new URLSearchParams()
  params.set('view', 'fintastic')
  params.set('focus', focusId)
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v) params.set(k, v)
    }
  }
  return `/broker/renewals?${params.toString()}`
}
