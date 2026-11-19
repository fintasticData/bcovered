import type { GridRow } from '@/copilot/salesApi'
import type { QueueFilter } from './queueTypes'

export function applyQueueCounts(rows: GridRow[]): Partial<Record<QueueFilter, number>> {
  const now = Date.now()
  return {
    all: rows.length,
    leads: rows.filter((r) => r.stage === 'new_enquiry').length,
    info: rows.filter(
      (r) =>
        (r.stage === 'new_enquiry' && r.offers === 0) ||
        Boolean(r.next_follow_up?.due_date && new Date(r.next_follow_up.due_date).getTime() < now),
    ).length,
    quotes: rows.filter((r) => r.stage === 'offer_sent').length,
    decision: rows.filter((r) => r.stage === 'accepted').length,
    covered: rows.filter((r) => r.stage === 'sold' || r.stage === 'client').length,
    renewals: 0,
  }
}
