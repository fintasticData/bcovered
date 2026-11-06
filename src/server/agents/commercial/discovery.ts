import type { BusinessProfile } from '../../db/commercialSchema'
import type { ContactDetails, Customer, Json, Lead } from '../../db/schema'
import { factsToProfileDraft, type BusinessFacts } from '../../domain/commercial/facts'
import type { ProfileSnapshot } from '../../domain/commercial/exposureRules'
import type { StepContext, StepOutcome } from '../../jobs/runner'
import { templateFor } from '../../tools/risk'

export interface CommercialReviewInputs {
  source: 'business_discovery' | 'broker_copilot'
  business_profile_id?: string
  facts?: BusinessFacts
  contact?: ContactDetails
  consent?: { processing: boolean; marketing: boolean; notice_version: string }
  conversation_id?: string
}

export interface ReviewOutputs {
  discover?: { business_profile_id: string; customer_id: string; lead_id: string | null }
  twin?: { risk_profile_id: string }
  submission?: { submission_id: string }
}

export const reviewInputs = (ctx: StepContext) => ctx.job.inputs as unknown as CommercialReviewInputs
export const reviewOutputs = (ctx: StepContext) => (ctx.job.outputs ?? {}) as unknown as ReviewOutputs

export function requireProfileId(ctx: StepContext): string {
  const id = reviewOutputs(ctx).discover?.business_profile_id ?? reviewInputs(ctx).business_profile_id
  if (!id) throw new Error('No business profile for this review')
  return id
}

/** Business Discovery Agent: retrieves existing records, or turns the conversation into a persisted profile. */
export function runDiscoverStep(ctx: StepContext): StepOutcome {
  const inputs = reviewInputs(ctx)

  if (inputs.business_profile_id) {
    const s = ctx.call<ProfileSnapshot>('business.get_profile', { profile_id: inputs.business_profile_id })
    ctx.link({ customer_id: s.profile.customer_id })
    const output = { business_profile_id: s.profile.id, customer_id: s.profile.customer_id, lead_id: null }
    return {
      kind: 'done',
      output: {
        ...output,
        reused: true,
        summary: `Retrieved existing records for ${s.profile.registered_name}: ${s.locations.length} location${s.locations.length === 1 ? '' : 's'}, ${s.assets.length} assets, ${s.activities.length} activities`,
      } as unknown as Json,
    }
  }

  if (!inputs.consent?.processing) throw new Error('POPIA processing consent is required before creating records')
  const facts = inputs.facts ?? {}
  const contact = inputs.contact ?? {}
  const template = templateFor(ctx.repo, facts.industry_key ?? '')
  const draft = factsToProfileDraft({ ...facts, industry_key: template.key }, contact, template.name)

  const matches = ctx.call<Array<{ profile: BusinessProfile }>>('business.discover', { query: draft.registered_name })
  const { customer } = ctx.call<{ customer: Customer; created: boolean }>('customer.create', {
    full_name: draft.registered_name,
    email: contact.email,
    phone: contact.phone,
    region: draft.operating_regions[0],
    customer_type: 'commercial',
  })
  ;(['processing', 'marketing'] as const).forEach((purpose) =>
    ctx.call('customer.record_consent', {
      customer_id: customer.id,
      purpose,
      granted: purpose === 'processing' ? true : inputs.consent!.marketing,
      source: inputs.source,
      notice_version: inputs.consent!.notice_version,
    }),
  )
  ctx.call('customer.create_portal_user', { customer_id: customer.id, full_name: contact.full_name })
  if (inputs.conversation_id) ctx.call('customer.link_conversation', { customer_id: customer.id, conversation_id: inputs.conversation_id })

  const existing = matches.find((m) => m.profile.customer_id === customer.id)?.profile
  const { legal_entities, locations, activities, assets, ...fields } = draft
  const broker = ctx.repo.list('app_users', (u) => u.role === 'broker').sort((a, b) => a.created_at.localeCompare(b.created_at))[0]
  const { profile, created } = ctx.call<{ profile: BusinessProfile; created: boolean }>('business.create_profile', {
    ...fields,
    assigned_broker_id: broker?.id ?? null,
    customer_id: customer.id,
    legal_entities,
    locations,
    activities,
    assets,
  })

  const lead = ctx.call<Lead>('lead.create', {
    customer_id: customer.id,
    conversation_id: inputs.conversation_id ?? null,
    line: 'commercial',
    product_category: 'commercial_package',
    urgency: 'medium',
    summary: `Business Discovery conversation: ${draft.activities_summary}`,
    missing_info: draft.missing_info,
    source: inputs.source,
  })
  ctx.link({ customer_id: customer.id, lead_id: lead.id })

  return {
    kind: 'done',
    output: {
      business_profile_id: profile.id,
      customer_id: customer.id,
      lead_id: lead.id,
      reused: Boolean(existing) || !created,
      summary: `${created ? 'Business profile created' : 'Existing business profile reused'} for ${profile.registered_name}: ${locations.length} locations, ${assets.length} assets, ${draft.missing_info.length} items missing`,
    },
  }
}
