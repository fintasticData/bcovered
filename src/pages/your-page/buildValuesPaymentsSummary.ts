import type { BusinessPageAsset, BusinessPageDto } from '@/api/businessPage'
import type { CustomerPageDto, CustomerPageItem } from '@/api/customerPage'
import type { BfTxnRow } from '@/copilot/brokerFinancialsApi'
import type {
  ValuesAudience,
  ValuesLineRow,
  ValuesPaymentsSummary,
  ValuesTotalCard,
} from './valuesPaymentsTypes'

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function monthStartIso(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function sum(nums: Array<number | null | undefined>): number {
  return nums.reduce<number>((s, n) => s + (typeof n === 'number' && !Number.isNaN(n) ? n : 0), 0)
}

function isActiveCover(status: string | null | undefined): boolean {
  if (!status) return false
  const s = status.toLowerCase()
  return s === 'covered' || s === 'in_force' || s === 'active'
}

function personalPurchase(item: CustomerPageItem): number | null {
  const d = item.details
  if (!d) return null
  const raw = d.purchase_price ?? d.purchase_value ?? d.bought_for
  return typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() ? Number(raw) : null
}

function personalReplacement(item: CustomerPageItem): number | null {
  const d = item.details
  if (!d) return null
  const raw = d.replacement_value ?? d.replacement_estimate
  if (typeof raw === 'number') return raw
  if (item.insured_value != null && (d.value_basis === 'replacement' || !d.value_basis)) return item.insured_value
  return null
}

function businessPurchase(asset: BusinessPageAsset): number | null {
  return asset.purchase_price ?? null
}

function businessReplacement(asset: BusinessPageAsset): number | null {
  if (asset.value_basis === 'replacement' && asset.declared_value != null) return asset.declared_value
  return asset.replacement_value ?? null
}

function businessInsured(asset: BusinessPageAsset): number | null {
  if (asset.cover_status === 'covered' && asset.insured_value != null) return asset.insured_value
  // Commercial book: no live policy link yet — insured only when explicitly set.
  return asset.insured_value ?? null
}

function commissionFromPremium(premium: number | null, rate = 0.1): number | null {
  if (premium == null) return null
  return Math.round(premium * rate * 100) / 100
}

function formatMoneyHint(counted: number, total: number, noun: string): string {
  return `${noun} recorded for ${counted} of ${total} items`
}

export function buildPersonalValuesSummary(
  dto: CustomerPageDto,
  opts?: {
    asAt?: string
    periodFrom?: string
    periodTo?: string
    audience?: ValuesAudience
    commissionTxns?: BfTxnRow[]
    paymentRows?: Array<{
      id: string
      label: string
      amount: number
      txn_type: string
      txn_date: string
      policy_id: string | null
      status: string
    }>
  },
): ValuesPaymentsSummary {
  const as_at = opts?.asAt ?? todayIso()
  const period_from = opts?.periodFrom ?? monthStartIso()
  const period_to = opts?.periodTo ?? todayIso()
  const audience = opts?.audience ?? 'customer'
  const items = dto.items.filter((i) => i.customer_status !== 'removed' && i.customer_status !== 'replaced')

  const lines: ValuesLineRow[] = items.map((item) => {
    const purchase = personalPurchase(item)
    const replacement = personalReplacement(item)
    const insured = isActiveCover(item.customer_status) ? item.insured_value : null
    const commission = commissionFromPremium(item.premium_amount)
    return {
      id: item.id,
      kind: 'item',
      label: item.display_label,
      secondary: item.item_type,
      location: item.location_name,
      cover_status: item.customer_status,
      purchase_value: purchase,
      recorded_value: item.insured_value,
      insured_value: insured,
      replacement_value: replacement,
      premium_amount: item.premium_amount,
      premium_frequency: item.premium_frequency,
      paid_amount: null,
      outstanding_amount: null,
      next_due_date: null,
      commission_amount: commission,
      commission_included: commission != null,
      commission_earned: null,
      commission_received: null,
      commission_outstanding: null,
      policy_id: item.policy_id,
      item_id: item.id,
      valuation_date: null,
      as_at_note: null,
    }
  })

  // Policy-level premiums (dedupe by policy)
  const seenPolicies = new Set<string>()
  for (const pol of dto.policies) {
    if (!pol.id || seenPolicies.has(pol.id)) continue
    seenPolicies.add(pol.id)
    if (lines.some((l) => l.policy_id === pol.id && l.premium_amount != null)) continue
    const commission = commissionFromPremium(pol.premium_amount)
    lines.push({
      id: `policy:${pol.id}`,
      kind: 'policy',
      label: pol.reference ?? pol.policy_number ?? 'Policy',
      secondary: pol.insurer_name ?? pol.cover_type,
      location: null,
      cover_status: pol.status,
      purchase_value: null,
      recorded_value: null,
      insured_value: null,
      replacement_value: null,
      premium_amount: pol.premium_amount,
      premium_frequency: pol.premium_frequency,
      paid_amount: null,
      outstanding_amount: null,
      next_due_date: null,
      commission_amount: commission,
      commission_included: commission != null,
      commission_earned: null,
      commission_received: null,
      commission_outstanding: null,
      policy_id: pol.id,
      item_id: null,
      valuation_date: null,
      as_at_note: null,
    })
  }

  for (const pay of opts?.paymentRows ?? []) {
    lines.push({
      id: pay.id,
      kind: 'payment',
      label: pay.label,
      secondary: pay.txn_type,
      location: null,
      cover_status: pay.status,
      purchase_value: null,
      recorded_value: null,
      insured_value: null,
      replacement_value: null,
      premium_amount: null,
      premium_frequency: null,
      paid_amount: pay.txn_type === 'collection' || pay.txn_type === 'payment' ? pay.amount : null,
      outstanding_amount: pay.txn_type === 'due' ? pay.amount : null,
      next_due_date: pay.txn_type === 'due' ? pay.txn_date : null,
      commission_amount: null,
      commission_included: false,
      commission_earned: null,
      commission_received: null,
      commission_outstanding: null,
      policy_id: pay.policy_id,
      item_id: null,
      valuation_date: null,
      as_at_note: pay.txn_date,
    })
  }

  const txns = opts?.commissionTxns ?? []
  let commission_earned = 0
  let commission_received = 0
  for (const t of txns) {
    commission_earned += Number(t.amount) || 0
    commission_received += Number(t.cash_received_amount) || 0
    if (audience === 'broker') {
      lines.push({
        id: `comm:${t.id}`,
        kind: 'commission',
        label: t.policy_number ?? t.event_ref ?? 'Commission',
        secondary: t.txn_type,
        location: null,
        cover_status: t.status,
        purchase_value: null,
        recorded_value: null,
        insured_value: null,
        replacement_value: null,
        premium_amount: null,
        premium_frequency: null,
        paid_amount: null,
        outstanding_amount: null,
        next_due_date: null,
        commission_amount: Number(t.amount) || 0,
        commission_included: false,
        commission_earned: Number(t.amount) || 0,
        commission_received: Number(t.cash_received_amount) || 0,
        commission_outstanding: Math.max(0, (Number(t.amount) || 0) - (Number(t.cash_received_amount) || 0)),
        policy_id: t.policy_id,
        item_id: null,
        valuation_date: String(t.period).slice(0, 10),
        as_at_note: null,
      })
    }
  }
  const commission_outstanding = Math.max(0, commission_earned - commission_received)

  const purchaseVals = lines.filter((l) => l.kind === 'item').map((l) => l.purchase_value)
  const recordedVals = lines.filter((l) => l.kind === 'item').map((l) => l.recorded_value)
  const insuredVals = lines.filter((l) => l.kind === 'item').map((l) => l.insured_value)
  const replacementVals = lines.filter((l) => l.kind === 'item').map((l) => l.replacement_value)
  const itemCount = lines.filter((l) => l.kind === 'item').length

  const policyPremiums = new Map<string, { amount: number; freq: string | null }>()
  for (const l of lines) {
    if (l.premium_amount == null) continue
    const key = l.policy_id ?? l.id
    if (!policyPremiums.has(key)) {
      policyPremiums.set(key, { amount: l.premium_amount, freq: l.premium_frequency })
    }
  }
  const recurring = [...policyPremiums.values()]
  const monthlyPremium = sum(
    recurring.map((p) => {
      if (p.freq === 'annually') return p.amount / 12
      if (p.freq === 'quarterly') return p.amount / 3
      return p.amount
    }),
  )
  const primaryFreq = recurring.find((p) => p.freq)?.freq ?? 'monthly'

  const paid = sum(lines.map((l) => l.paid_amount))
  const outstanding = sum(lines.map((l) => l.outstanding_amount))
  const disclosedCommission = sum(
    [...policyPremiums.keys()].map((key) => {
      const line = lines.find((l) => (l.policy_id ?? l.id) === key)
      return line?.commission_amount
    }),
  )

  const insured_active = insuredVals.some((v) => v != null && v > 0)

  const totals: ValuesTotalCard[] = [
    {
      key: 'purchase',
      label: audience === 'customer' ? 'What I paid for my items' : 'Total purchase value',
      amount: purchaseVals.some((v) => v != null) ? sum(purchaseVals) : null,
      hint: formatMoneyHint(
        purchaseVals.filter((v) => v != null).length,
        itemCount,
        'prices',
      ),
    },
    {
      key: 'recorded',
      label: 'Recorded asset value',
      amount: recordedVals.some((v) => v != null) ? sum(recordedVals) : null,
      hint: insured_active
        ? 'Confirmed cover uses Total insured value below'
        : 'Until cover basis is confirmed',
    },
    {
      key: 'insured',
      label: audience === 'customer' ? 'Total insured value' : 'Total insured value',
      amount: insured_active ? sum(insuredVals) : null,
      hint: insured_active
        ? 'Active cover as at selected date · shared sums counted once'
        : 'No active insured amounts yet — still reviewing recorded values',
    },
    {
      key: 'replacement',
      label: 'Current replacement value',
      amount: replacementVals.some((v) => v != null) ? sum(replacementVals) : null,
      hint: formatMoneyHint(
        replacementVals.filter((v) => v != null).length,
        itemCount,
        'valuations',
      ),
    },
    {
      key: 'premium',
      label: 'Recurring premium',
      amount: recurring.length ? (primaryFreq === 'monthly' ? sum(recurring.map((p) => p.amount)) : monthlyPremium) : null,
      hint: recurring.length
        ? primaryFreq === 'monthly'
          ? 'Monthly'
          : `Shown as monthly equivalent · ${primaryFreq} billing`
        : null,
      frequencyLabel: primaryFreq === 'monthly' ? 'monthly' : 'monthly equivalent',
    },
    {
      key: 'paid',
      label: audience === 'customer' ? 'Paid this month' : 'Payments received',
      amount: paid || null,
      hint: `${period_from} → ${period_to}`,
    },
    {
      key: 'outstanding',
      label: audience === 'customer' ? 'Next payment' : 'Outstanding and next due',
      amount: outstanding || null,
      hint: outstanding ? 'Includes overdue where present' : 'Nothing overdue in this period',
    },
  ]

  if (audience === 'broker') {
    totals.push(
      {
        key: 'commission_expected',
        label: 'Commission · Expected',
        amount: disclosedCommission || commission_earned || null,
        hint: 'From policy commission terms',
      },
      {
        key: 'commission_earned',
        label: 'Commission · Earned',
        amount: commission_earned || null,
        hint: 'Posted earnings',
      },
      {
        key: 'commission_received',
        label: 'Commission · Received',
        amount: commission_received || null,
        hint: 'Insurer cash received',
      },
      {
        key: 'commission_outstanding',
        label: 'Commission · Outstanding',
        amount: commission_outstanding || null,
        hint: 'Earned less received',
      },
    )
  } else {
    totals.push({
      key: 'commission_expected',
      label: 'Commission',
      amount: disclosedCommission || null,
      hint: disclosedCommission ? 'Included in your premium' : null,
    })
  }

  return {
    as_at,
    period_from,
    period_to,
    totals,
    lines,
    recorded_complete: {
      counted: recordedVals.filter((v) => v != null).length,
      total: itemCount,
    },
    purchase_complete: {
      counted: purchaseVals.filter((v) => v != null).length,
      total: itemCount,
    },
    replacement_complete: {
      counted: replacementVals.filter((v) => v != null).length,
      total: itemCount,
    },
    insured_active,
  }
}

export function buildBusinessValuesSummary(
  dto: BusinessPageDto,
  opts?: {
    asAt?: string
    periodFrom?: string
    periodTo?: string
    audience?: ValuesAudience
    commissionTxns?: BfTxnRow[]
  },
): ValuesPaymentsSummary {
  const as_at = opts?.asAt ?? todayIso()
  const period_from = opts?.periodFrom ?? monthStartIso()
  const period_to = opts?.periodTo ?? todayIso()
  const audience = opts?.audience ?? 'customer'
  const assets = dto.assets

  const lines: ValuesLineRow[] = assets.map((asset) => {
    const purchase = businessPurchase(asset)
    const replacement = businessReplacement(asset)
    const insured = businessInsured(asset)
    return {
      id: asset.id,
      kind: 'item',
      label: asset.display_label,
      secondary: asset.asset_class,
      location: asset.location_name,
      cover_status: asset.cover_status,
      purchase_value: purchase,
      recorded_value: asset.declared_value,
      insured_value: insured,
      replacement_value: replacement,
      premium_amount: asset.premium_amount ?? null,
      premium_frequency: asset.premium_frequency ?? null,
      paid_amount: null,
      outstanding_amount: null,
      next_due_date: null,
      commission_amount: commissionFromPremium(asset.premium_amount ?? null),
      commission_included: Boolean(asset.premium_amount),
      commission_earned: null,
      commission_received: null,
      commission_outstanding: null,
      policy_id: asset.policy_id ?? null,
      item_id: asset.id,
      valuation_date: asset.valuation_date,
      as_at_note: null,
    }
  })

  const txns = opts?.commissionTxns ?? []
  let commission_earned = 0
  let commission_received = 0
  for (const t of txns) {
    commission_earned += Number(t.amount) || 0
    commission_received += Number(t.cash_received_amount) || 0
    if (audience === 'broker') {
      lines.push({
        id: `comm:${t.id}`,
        kind: 'commission',
        label: t.policy_number ?? t.event_ref ?? 'Commission',
        secondary: t.txn_type,
        location: null,
        cover_status: t.status,
        purchase_value: null,
        recorded_value: null,
        insured_value: null,
        replacement_value: null,
        premium_amount: null,
        premium_frequency: null,
        paid_amount: null,
        outstanding_amount: null,
        next_due_date: null,
        commission_amount: Number(t.amount) || 0,
        commission_included: false,
        commission_earned: Number(t.amount) || 0,
        commission_received: Number(t.cash_received_amount) || 0,
        commission_outstanding: Math.max(0, (Number(t.amount) || 0) - (Number(t.cash_received_amount) || 0)),
        policy_id: t.policy_id,
        item_id: null,
        valuation_date: String(t.period).slice(0, 10),
        as_at_note: null,
      })
    }
  }

  const purchaseVals = lines.filter((l) => l.kind === 'item').map((l) => l.purchase_value)
  const recordedVals = lines.filter((l) => l.kind === 'item').map((l) => l.recorded_value)
  const insuredVals = lines.filter((l) => l.kind === 'item').map((l) => l.insured_value)
  const replacementVals = lines.filter((l) => l.kind === 'item').map((l) => l.replacement_value)
  const itemCount = assets.length
  const insured_active = insuredVals.some((v) => v != null && v > 0)
  const commission_outstanding = Math.max(0, commission_earned - commission_received)
  const disclosedCommission = sum(lines.filter((l) => l.kind === 'item').map((l) => l.commission_amount))

  const totals: ValuesTotalCard[] = [
    {
      key: 'purchase',
      label: audience === 'customer' ? 'What I paid for my items' : 'Total purchase value',
      amount: purchaseVals.some((v) => v != null) ? sum(purchaseVals) : null,
      hint: formatMoneyHint(purchaseVals.filter((v) => v != null).length, itemCount, 'prices'),
    },
    {
      key: 'recorded',
      label: 'Recorded asset value',
      amount: recordedVals.some((v) => v != null) ? sum(recordedVals) : null,
      hint: `Sum of declared values · ${formatMoneyHint(recordedVals.filter((v) => v != null).length, itemCount, 'values')}`,
    },
    {
      key: 'insured',
      label: 'Total insured value',
      amount: insured_active ? sum(insuredVals) : null,
      hint: insured_active
        ? 'Active cover as at selected date · shared sums counted once'
        : 'No active insured amounts yet — still reviewing recorded values',
    },
    {
      key: 'replacement',
      label: 'Current replacement value',
      amount: replacementVals.some((v) => v != null) ? sum(replacementVals) : null,
      hint: formatMoneyHint(replacementVals.filter((v) => v != null).length, itemCount, 'valuations'),
    },
    {
      key: 'premium',
      label: 'Recurring premium',
      amount: sum(lines.map((l) => l.premium_amount)) || null,
      hint: 'Policy-level when allocated',
      frequencyLabel: 'monthly',
    },
    {
      key: 'paid',
      label: audience === 'customer' ? 'Paid this month' : 'Payments received',
      amount: null,
      hint: `${period_from} → ${period_to}`,
    },
    {
      key: 'outstanding',
      label: audience === 'customer' ? 'Next payment' : 'Outstanding and next due',
      amount: null,
      hint: 'Nothing due yet on this business book',
    },
  ]

  if (audience === 'broker') {
    totals.push(
      {
        key: 'commission_expected',
        label: 'Commission · Expected',
        amount: disclosedCommission || commission_earned || null,
        hint: 'By policy · sites contribute once',
      },
      {
        key: 'commission_earned',
        label: 'Commission · Earned',
        amount: commission_earned || null,
        hint: 'Posted earnings',
      },
      {
        key: 'commission_received',
        label: 'Commission · Received',
        amount: commission_received || null,
        hint: 'Insurer cash received',
      },
      {
        key: 'commission_outstanding',
        label: 'Commission · Outstanding',
        amount: commission_outstanding || null,
        hint: 'Earned less received',
      },
    )
  } else {
    totals.push({
      key: 'commission_expected',
      label: 'Commission',
      amount: disclosedCommission || null,
      hint: disclosedCommission ? 'Included in your premium' : 'Shown when premium terms include disclosed commission',
    })
  }

  return {
    as_at,
    period_from,
    period_to,
    totals,
    lines,
    recorded_complete: {
      counted: recordedVals.filter((v) => v != null).length,
      total: itemCount,
    },
    purchase_complete: {
      counted: purchaseVals.filter((v) => v != null).length,
      total: itemCount,
    },
    replacement_complete: {
      counted: replacementVals.filter((v) => v != null).length,
      total: itemCount,
    },
    insured_active,
  }
}
