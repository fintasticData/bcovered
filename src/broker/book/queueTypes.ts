import type { Stage } from '@/copilot/salesApi'

export type BrowseMode = 'people' | 'items'
export type QueueFilter = 'all' | 'leads' | 'info' | 'quotes' | 'decision' | 'covered' | 'renewals'

export const QUEUE_FILTERS: Array<{ id: QueueFilter; label: string; stage?: Stage | '' }> = [
  { id: 'all', label: 'All', stage: '' },
  { id: 'leads', label: 'Leads', stage: 'new_enquiry' },
  { id: 'info', label: 'Information needed', stage: '' },
  { id: 'quotes', label: 'Quotes ready', stage: 'offer_sent' },
  { id: 'decision', label: 'Awaiting decision', stage: 'accepted' },
  { id: 'covered', label: 'Covered', stage: 'sold' },
  { id: 'renewals', label: 'Renewals', stage: '' },
]

export function stageForFilter(filter: QueueFilter): Stage | '' {
  return QUEUE_FILTERS.find((f) => f.id === filter)?.stage ?? ''
}
