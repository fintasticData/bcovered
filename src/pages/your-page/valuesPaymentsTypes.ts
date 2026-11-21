/** Shared Values & payments desk — personal and business. */

export type ValuesAudience = 'customer' | 'broker'
export type ValuesScope = 'personal' | 'business'

export type ValuesTotalKey =
  | 'purchase'
  | 'insured'
  | 'replacement'
  | 'recorded'
  | 'premium'
  | 'paid'
  | 'outstanding'
  | 'commission_expected'
  | 'commission_earned'
  | 'commission_received'
  | 'commission_outstanding'

export type ValuesLineKind = 'item' | 'policy' | 'payment' | 'commission'

export interface ValuesLineRow {
  id: string
  kind: ValuesLineKind
  label: string
  secondary: string | null
  location: string | null
  cover_status: string | null
  purchase_value: number | null
  recorded_value: number | null
  insured_value: number | null
  replacement_value: number | null
  premium_amount: number | null
  premium_frequency: string | null
  paid_amount: number | null
  outstanding_amount: number | null
  next_due_date: string | null
  commission_amount: number | null
  commission_included: boolean
  commission_earned: number | null
  commission_received: number | null
  commission_outstanding: number | null
  policy_id: string | null
  item_id: string | null
  valuation_date: string | null
  as_at_note: string | null
}

export interface ValuesTotalCard {
  key: ValuesTotalKey
  label: string
  amount: number | null
  hint: string | null
  frequencyLabel?: string | null
}

export interface ValuesPaymentsSummary {
  as_at: string
  period_from: string
  period_to: string
  totals: ValuesTotalCard[]
  lines: ValuesLineRow[]
  recorded_complete: { counted: number; total: number }
  purchase_complete: { counted: number; total: number }
  replacement_complete: { counted: number; total: number }
  insured_active: boolean
}
