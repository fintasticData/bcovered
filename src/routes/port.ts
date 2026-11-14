// The Supabase side of a Route: the client record it reads and the Sample note or follow-up it writes, through the
// same sales functions as the client record's buttons (so FAIS retention and row-level security apply).
import { salesApi, type SalesReceipt } from '@/copilot/salesApi'
import type { RoutePort } from './definitions'

function saved(r: SalesReceipt) {
  if (r.outcome !== 'saved' || typeof r.id !== 'string' || !r.reference) throw new Error(r.reason ?? r.summary ?? 'The record was not saved.')
  return { id: r.id, reference: r.reference }
}

export const supabaseRoutePort: RoutePort = {
  async clientRecord(personId) {
    const r = await salesApi.record('sample', personId)
    return {
      person_id: r.id,
      client_number: r.client_number,
      name: r.name,
      first_names: r.first_names,
      surname: r.surname,
      phone: r.account?.phone ?? null,
      email: r.account?.email ?? null,
      category: r.category,
    }
  },
  logNote: async (a) => saved(await salesApi.logComm('sample', { person_id: a.person_id, kind: 'note', direction: 'internal', body: a.body, key: a.key })),
  followUp: async (a) => saved(await salesApi.followUp('sample', { person_id: a.person_id, title: a.title, due_date: a.due_date, key: a.key })),
}
