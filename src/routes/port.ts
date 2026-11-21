// The Supabase side of a Route: client record, notes/follow-ups, policy/claim writes, and run persistence.
import { salesApi, type SalesReceipt } from '@/copilot/salesApi'
import { policyClaimsApi } from '@/copilot/policyClaimsApi'
import { dataCategory } from '@/lib/supabase/category'
import { supabase } from '@/lib/supabase/client'
import type { Json } from '@/server/db/schema'
import type { RoutePort } from './definitions'

function saved(r: SalesReceipt) {
  if (r.outcome !== 'saved' || typeof r.id !== 'string' || !r.reference) throw new Error(r.reason ?? r.summary ?? 'The record was not saved.')
  return { id: r.id, reference: r.reference }
}

function asRecord(value: Json | undefined): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  return {}
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Supabase is not configured for this build.')
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data as T
}

export const supabaseRoutePort: RoutePort = {
  async clientRecord(personId) {
    const cat = dataCategory.get()
    const r = await salesApi.record(cat, personId)
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
  logNote: async (a) => saved(await salesApi.logComm(dataCategory.get(), { person_id: a.person_id, kind: 'note', direction: 'internal', body: a.body, key: a.key })),
  followUp: async (a) => saved(await salesApi.followUp(dataCategory.get(), { person_id: a.person_id, title: a.title, due_date: a.due_date, key: a.key })),

  async createEndorsement(a) {
    const r = await policyClaimsApi.createEndorsement(dataCategory.get(), {
      person_id: a.person_id,
      policy_id: a.policy_id,
      requested_effective_at: a.requested_effective_at,
      change: asRecord(a.change),
      item_id: a.item_id ?? null,
      notes: a.notes ?? null,
      key: a.key,
    })
    if (r.outcome !== 'saved' || !r.request_id || !r.reference) throw new Error(r.summary || 'Endorsement was not saved.')
    return { id: r.request_id, reference: r.reference }
  },

  async createClaim(a) {
    const r = await policyClaimsApi.createClaim(dataCategory.get(), {
      person_id: a.person_id,
      policy_id: a.policy_id ?? null,
      incident_at: a.incident_at,
      incident_time_unknown: a.incident_time_unknown,
      incident_type: a.incident_type,
      description: a.description,
      item_ids: a.item_ids,
      key: a.key,
    })
    if (r.outcome !== 'saved' || !r.claim_id || !r.reference) throw new Error(r.summary || 'Claim was not saved.')
    return { id: r.claim_id, reference: r.reference, version_review_needed: r.version_review_needed }
  },

  async transitionServiceRequest(a) {
    const r = await policyClaimsApi.transitionRequest(dataCategory.get(), {
      request_id: a.request_id,
      to_status: a.to_status,
      note: a.note ?? null,
      key: a.key,
    })
    return { summary: r.summary }
  },

  async confirmEndorsement(a) {
    const r = await policyClaimsApi.confirmEndorsement(dataCategory.get(), {
      request_id: a.request_id,
      confirmed_effective_at: a.confirmed_effective_at,
      confirmation_source: a.confirmation_source,
      insurer_reference: a.insurer_reference ?? null,
      key: a.key,
    })
    return { summary: r.summary, version_id: r.version_id }
  },

  async transitionClaim(a) {
    const r = await policyClaimsApi.transitionClaim(dataCategory.get(), {
      claim_id: a.claim_id,
      to_status: a.to_status,
      note: a.note ?? null,
      key: a.key,
    })
    return { summary: r.summary }
  },

  async recordClaimSubmission(a) {
    const r = await policyClaimsApi.recordClaimSubmission(dataCategory.get(), {
      claim_id: a.claim_id,
      channel: a.channel,
      insurer_reference: a.insurer_reference ?? null,
      submitted_at: new Date().toISOString(),
      key: a.key,
    })
    return { summary: r.summary }
  },

  async recordClaimDecision(a) {
    const r = await policyClaimsApi.recordClaimDecision(dataCategory.get(), {
      claim_id: a.claim_id,
      decision: a.decision,
      decision_source: a.decision_source,
      settlement_amount: a.settlement_amount ?? null,
      key: a.key,
    })
    return { summary: r.summary }
  },

  async createRenewal(a) {
    const r = await policyClaimsApi.createRenewal(dataCategory.get(), {
      person_id: a.person_id,
      policy_id: a.policy_id,
      requested_effective_at: a.requested_effective_at,
      change: asRecord(a.change),
      notes: a.notes ?? null,
      key: a.key,
    })
    if (r.outcome !== 'saved' || !r.request_id || !r.reference) throw new Error(r.summary || 'Renewal was not saved.')
    return { id: r.request_id, reference: r.reference }
  },

  async createCancellation(a) {
    const r = await policyClaimsApi.createCancellation(dataCategory.get(), {
      person_id: a.person_id,
      policy_id: a.policy_id,
      requested_effective_at: a.requested_effective_at,
      reason: a.reason,
      source: a.source ?? 'client',
      notes: a.notes ?? null,
      key: a.key,
    })
    if (r.outcome !== 'saved' || !r.request_id || !r.reference) throw new Error(r.summary || 'Cancellation was not saved.')
    return { id: r.request_id, reference: r.reference }
  },

  async filePolicy(a) {
    const r = await policyClaimsApi.filePolicy(dataCategory.get(), {
      person_id: a.person_id,
      policy_number: a.policy_number,
      confirmed_effective_at: a.confirmed_effective_at,
      confirmation_source: a.confirmation_source,
      provider_id: a.provider_id ?? null,
      insurer_name: a.insurer_name ?? null,
      quote_id: a.quote_id ?? null,
      source_type: a.source_type ?? null,
      schedule_note: a.schedule_note ?? null,
      insurer_reference: a.insurer_reference ?? null,
      cover_type: a.cover_type ?? null,
      premium_amount: a.premium_amount ?? null,
      premium_frequency: a.premium_frequency ?? null,
      item_label: a.item_label ?? null,
      item_type: a.item_type ?? null,
      excess: a.excess ?? null,
      key: a.key,
    })
    if (r.outcome !== 'saved' || !r.policy_id || !r.reference) throw new Error(r.summary || 'Policy was not filed.')
    return { id: r.policy_id, reference: r.reference, policy_number: r.policy_number ?? a.policy_number }
  },

  async syncCoverConfirmation(a) {
    const r = await policyClaimsApi.syncCoverConfirmation(dataCategory.get(), {
      person_id: a.person_id,
      policy_id: a.policy_id,
      offer_id: a.offer_id ?? null,
      insurer_reference: a.insurer_reference ?? null,
      cover_start_date: a.cover_start_date ?? null,
      key: a.key,
    })
    if (r.outcome !== 'saved' || !r.policy_id) throw new Error(r.summary || 'Cover confirmation sync failed.')
    return {
      policy_id: r.policy_id,
      open_path: r.open_path,
      summary: r.summary,
      lead_updated: r.lead_updated,
    }
  },

  async persistRun(run) {
    try {
      await rpc('route_upsert_run', { p_run: run, p_category: dataCategory.get() })
    } catch {
      /* local engine remains source of truth when offline / unauthenticated */
    }
  },

  async persistResult(result) {
    try {
      await rpc('route_append_result', { p_result: result, p_category: dataCategory.get() })
    } catch {
      /* ignore sync failures */
    }
  },
}

export async function hydrateRouteRunsFromSupabase(
  upsert: (run: Record<string, unknown>, results: Record<string, unknown>[]) => void,
): Promise<void> {
  try {
    const rows = await rpc<Record<string, unknown>[]>('route_list_runs', { p_scope: 'team', p_category: dataCategory.get() })
    for (const run of rows ?? []) {
      try {
        const detail = await rpc<{ run: Record<string, unknown>; results: Record<string, unknown>[] }>('route_get_run', {
          p_run_id: run.id,
          p_category: dataCategory.get(),
        })
        upsert(detail.run, detail.results ?? [])
      } catch {
        /* skip inaccessible */
      }
    }
  } catch {
    /* tables may not exist yet */
  }
}

export type { Json }
