import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { useDataCategory, type DataCategory } from '@/lib/supabase/category'

export type PolicyPaymentRow = {
  id: string
  label: string
  amount: number
  txn_type: string
  txn_date: string
  policy_id: string | null
  status: string
}

/** Customer-visible premium dues / collections / refunds for Values & payments (From/To period). */
export function usePolicyPaymentRows(opts: {
  policyIds: string[]
  from: string
  to: string
  category?: DataCategory
  enabled?: boolean
}) {
  const active = useDataCategory()
  const category = opts.category ?? active
  const ids = [...new Set(opts.policyIds.filter(Boolean))].sort()

  return useQuery({
    queryKey: ['policy-payment-rows', category, ids.join(','), opts.from, opts.to],
    enabled: Boolean(supabase) && ids.length > 0 && opts.enabled !== false,
    queryFn: async (): Promise<PolicyPaymentRow[]> => {
      if (!supabase || ids.length === 0) return []
      const { data, error } = await supabase
        .from('policy_transactions')
        .select('id, policy_id, txn_type, amount, txn_date, status, source_ref')
        .eq('data_category', category)
        .in('policy_id', ids)
        .gte('txn_date', opts.from)
        .lte('txn_date', opts.to)
        .neq('txn_type', 'commission')
        .order('txn_date', { ascending: false })
        .limit(200)
      if (error) throw error
      return (data ?? []).map((r) => ({
        id: String(r.id),
        label: `${String(r.txn_type).replace(/_/g, ' ')} · ${String(r.txn_date).slice(0, 10)}`,
        amount: Number(r.amount) || 0,
        txn_type: String(r.txn_type),
        txn_date: String(r.txn_date).slice(0, 10),
        policy_id: r.policy_id ? String(r.policy_id) : null,
        status: String(r.status ?? 'posted'),
      }))
    },
    staleTime: 15_000,
    retry: false,
  })
}
