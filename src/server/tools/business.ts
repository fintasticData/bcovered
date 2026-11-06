import { z } from 'zod'
import type { BusinessProfile, FieldSource } from '../db/commercialSchema'
import type { Repo } from '../db/store'
import type { ProfileSnapshot } from '../domain/commercial/exposureRules'
import { ToolError } from '../lib/errors'
import { defineTool, STAFF, type ToolDef } from './registry'

const source = z.enum(['verified', 'declared', 'inferred', 'missing'])

const profileDraft = z.object({
  customer_id: z.uuid(),
  registered_name: z.string().trim().min(2),
  trading_name: z.string().nullable(),
  registration_number: z.string().nullable(),
  vat_number: z.string().nullable(),
  industry_key: z.string().min(2),
  activities_summary: z.string().nullable(),
  years_trading: z.number().int().min(0).max(200).nullable(),
  annual_turnover: z.number().nonnegative().nullable(),
  employee_count: z.number().int().nonnegative().nullable(),
  operating_regions: z.array(z.string()),
  primary_contact: z.object({ name: z.string(), email: z.string().nullable(), phone: z.string().nullable(), role: z.string().nullable() }).nullable(),
  existing_cover: z
    .object({ insurer: z.string().nullable(), policy_count: z.number().nullable(), renewal_month: z.string().nullable(), notes: z.string().nullable() })
    .nullable(),
  loss_history: z.object({ claims_last_5_years: z.number().int().nullable(), notes: z.string().nullable() }).nullable(),
  field_sources: z.record(z.string(), source),
  missing_info: z.array(z.string()),
  assigned_broker_id: z.uuid().nullable().optional(),
  legal_entities: z.array(
    z.object({ legal_name: z.string().min(2), registration_number: z.string().nullable(), role: z.enum(['primary', 'subsidiary', 'property_owner', 'other']), source }),
  ),
  locations: z
    .array(
      z.object({
        name: z.string().min(1),
        suburb: z.string().nullable(),
        city: z.string().nullable(),
        province: z.string().nullable(),
        occupancy: z.string(),
        ownership: z.enum(['owned', 'leased', 'unknown']),
        construction: z.string().nullable(),
        fire_protection: z.array(z.string()),
        security: z.array(z.string()),
        backup_power: z.boolean().nullable(),
        public_access: z.boolean(),
        seating_capacity: z.number().int().nullable(),
        source,
      }),
    )
    .min(1),
  activities: z.array(
    z.object({
      location_index: z.number().int().nullable(),
      kind: z.enum(['operation', 'revenue_stream', 'supplier_dependency', 'customer_dependency']),
      name: z.string().min(2),
      description: z.string().nullable(),
      share_of_revenue: z.number().min(0).max(1).nullable(),
      source,
    }),
  ),
  assets: z.array(
    z.object({
      location_index: z.number().int().nullable(),
      asset_class: z.enum(['buildings', 'contents', 'stock', 'machinery', 'electronic_equipment', 'vehicle', 'mobile_plant', 'other']),
      description: z.string().min(2),
      quantity: z.number().int().min(1),
      declared_value: z.number().nonnegative().nullable(),
      value_basis: z.enum(['replacement', 'market', 'book', 'unknown']),
      source,
    }),
  ),
})

/** Profile fields a person or agent may change through business.update_profile. */
const EDITABLE = {
  trading_name: z.string().trim().min(2).nullable(),
  registration_number: z.string().trim().regex(/^\d{4}\/\d{6}\/\d{2}$/, 'Use the CIPC format 2015/123456/07').nullable(),
  vat_number: z.string().trim().regex(/^4\d{9}$/, 'South African VAT numbers have 10 digits and start with 4').nullable(),
  years_trading: z.number().int().min(0).max(200).nullable(),
  annual_turnover: z.number().nonnegative().nullable(),
  employee_count: z.number().int().nonnegative().nullable(),
} as const
export type EditableProfileField = keyof typeof EDITABLE
export const EDITABLE_PROFILE_FIELDS = Object.keys(EDITABLE) as EditableProfileField[]

export function profileSnapshot(repo: Repo, profileId: string): ProfileSnapshot {
  const profile = repo.require('business_profiles', profileId)
  const of = <T extends { business_profile_id: string }>(rows: T[]) => rows.filter((r) => r.business_profile_id === profileId)
  return {
    profile,
    legal_entities: of(repo.list('business_legal_entities')),
    locations: of(repo.list('business_locations')).sort((a, b) => a.created_at.localeCompare(b.created_at) || a.name.localeCompare(b.name)),
    activities: of(repo.list('business_activities')),
    assets: of(repo.list('commercial_assets')),
  }
}

export const businessTools = [
  defineTool({
    name: 'business.discover',
    description: 'Find existing business profiles by registered or trading name, or registration number.',
    allow: ['agent', ...STAFF],
    sideEffect: false,
    input: z.object({ query: z.string().trim().min(2) }),
    run: ({ repo }, { query }) => {
      const q = query.toLowerCase().replace(/\(pty\)\s*ltd|\bltd\b|\bcc\b/g, '').trim()
      return repo
        .list('business_profiles', (p) =>
          [p.registered_name, p.trading_name ?? '', p.registration_number ?? ''].some((v) => v && v.toLowerCase().includes(q)),
        )
        .map((p) => ({ profile: p, customer: repo.require('customers', p.customer_id) }))
    },
  }),

  defineTool({
    name: 'business.get_profile',
    description: 'Get a business profile with its legal entities, locations, activities and assets.',
    allow: ['agent', ...STAFF],
    sideEffect: false,
    input: z.object({ profile_id: z.uuid() }),
    run: ({ repo }, { profile_id }) => profileSnapshot(repo, profile_id),
  }),

  defineTool({
    name: 'business.create_profile',
    description: 'Persist a structured business profile from discovery. Reuses the existing profile for the same customer.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: profileDraft,
    run: ({ repo, actor }, input) => {
      repo.require('customers', input.customer_id)
      const existing = repo.find('business_profiles', (p) => p.customer_id === input.customer_id)
      if (existing) return { profile: existing, created: false }
      const { legal_entities, locations, activities, assets, ...fields } = input
      const profile = repo.insert('business_profiles', {
        ...fields,
        assigned_broker_id: fields.assigned_broker_id ?? null,
        status: 'discovery',
        is_synthetic: true,
        created_by: actor.type === 'user' ? actor.id : null,
      })
      const entityIds = legal_entities.map((e) => repo.insert('business_legal_entities', { ...e, business_profile_id: profile.id }).id)
      const locIds = locations.map(
        (l) => repo.insert('business_locations', { ...l, business_profile_id: profile.id, legal_entity_id: entityIds[0] ?? null }).id,
      )
      const at = (i: number | null) => (i === null ? null : (locIds[i] ?? null))
      activities.forEach(({ location_index, ...a }) => repo.insert('business_activities', { ...a, business_profile_id: profile.id, location_id: at(location_index) }))
      assets.forEach(({ location_index, ...a }) =>
        repo.insert('commercial_assets', { ...a, business_profile_id: profile.id, location_id: at(location_index), valuation_date: null }),
      )
      return { profile, created: true }
    },
    auditEntity: (r) => ({ table: 'business_profiles', id: r.profile.id }),
  }),

  defineTool({
    name: 'business.update_profile',
    description: 'Change profile fields, recording the source of each value. Agents cannot overwrite verified values.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({
      profile_id: z.uuid(),
      changes: z.object(EDITABLE).partial(),
      source: z.enum(['verified', 'declared', 'inferred']),
    }),
    run: ({ repo, actor }, { profile_id, changes, source: src }) => {
      const profile = repo.require('business_profiles', profile_id)
      const keys = Object.keys(changes) as EditableProfileField[]
      if (!keys.length) throw new ToolError('validation', 'No changes supplied')
      if (actor.type === 'agent') {
        const locked = keys.filter((k) => profile.field_sources[k] === 'verified')
        if (locked.length) {
          throw new ToolError('approval_required', `Verified values can only be changed by a broker: ${locked.join(', ')}`)
        }
        if (src === 'verified') throw new ToolError('forbidden', 'Agents cannot mark a value as verified')
      }
      const field_sources: Record<string, FieldSource> = { ...profile.field_sources }
      keys.forEach((k) => (field_sources[k] = changes[k] === null ? 'missing' : src))
      const labels: Record<string, string> = {
        registration_number: 'Company registration number',
        vat_number: 'VAT number',
        years_trading: 'Years trading',
        annual_turnover: 'Annual turnover',
        employee_count: 'Employees',
      }
      const filled = keys.filter((k) => changes[k] !== null).map((k) => labels[k])
      return repo.update('business_profiles', profile_id, {
        ...(changes as Partial<BusinessProfile>),
        field_sources,
        missing_info: profile.missing_info.filter((m) => !filled.includes(m)),
      })
    },
    auditEntity: (r) => ({ table: 'business_profiles', id: r.id }),
  }),

  defineTool({
    name: 'business.set_status',
    description: 'Move a business profile through discovery, review and active.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({ profile_id: z.uuid(), status: z.enum(['discovery', 'in_review', 'active', 'archived']) }),
    run: ({ repo }, { profile_id, status }) => repo.update('business_profiles', profile_id, { status }),
    auditEntity: (r) => ({ table: 'business_profiles', id: r.id }),
  }),
] as unknown as ToolDef[]
