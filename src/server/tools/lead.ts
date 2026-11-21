import { z } from 'zod'
import type { Customer, LeadStatus } from '../db/schema'
import { LEAD_PIPELINE_STAGES } from '../db/schema'
import type { Repo } from '../db/store'
import { detectIndustry, FALLBACK_TEMPLATE_KEY } from '../domain/commercial/industryTemplates'
import { ToolError } from '../lib/errors'
import { defineTool, STAFF, type ToolDef } from './registry'
import { selfOf } from './person'
import { templateFor } from './risk'

export type CustomerAreaLink = {
  person_id: string | null
  business_profile_id: string | null
  open_path: string
}

/** Resolve Customer Area path when person/profile already exists (read path). */
export function customerAreaLinkForCustomer(repo: Repo, customer: Customer): CustomerAreaLink | null {
  if (customer.customer_type === 'commercial') {
    const profile = repo.find('business_profiles', (p) => p.customer_id === customer.id && p.status !== 'archived')
    if (!profile) return null
    return {
      person_id: null,
      business_profile_id: profile.id,
      open_path: `/broker/customers/businesses/${profile.id}`,
    }
  }
  const person = selfOf(repo, customer.id)
  if (!person) return null
  return {
    person_id: person.id,
    business_profile_id: null,
    open_path: `/broker/customers/people/${person.id}`,
  }
}

/** Ensure the CRM customer also appears in Customer Area (persons or business_profiles). */
export function ensureCustomerAreaForCustomer(repo: Repo, customer: Customer, actorId: string | null): CustomerAreaLink {
  const existing = customerAreaLinkForCustomer(repo, customer)
  if (existing) return existing

  if (customer.customer_type === 'commercial') {
    let profile = repo.find('business_profiles', (p) => p.customer_id === customer.id && p.status !== 'archived')
    if (!profile) {
      const templates = repo.list('industry_risk_templates', (t) => t.is_active)
      const industry = detectIndustry(customer.full_name, templates) ?? FALLBACK_TEMPLATE_KEY
      const template = templateFor(repo, industry)
      profile = repo.insert('business_profiles', {
        customer_id: customer.id,
        registered_name: customer.full_name,
        trading_name: customer.full_name,
        registration_number: null,
        vat_number: null,
        industry_key: template.key,
        activities_summary: 'Commercial prospect captured as a lead.',
        years_trading: null,
        annual_turnover: null,
        employee_count: null,
        operating_regions: customer.region ? [customer.region] : [],
        primary_contact:
          customer.email || customer.phone
            ? { name: customer.full_name, email: customer.email, phone: customer.phone, role: 'Contact' }
            : null,
        existing_cover: null,
        loss_history: null,
        cover_interests: [],
        field_sources: {
          registered_name: 'declared',
          trading_name: 'declared',
          industry_key: 'inferred',
        },
        missing_info: ['Contact person', 'Company registration number', 'Assets and sums insured', 'Current insurance'],
        status: 'discovery',
        assigned_broker_id: actorId,
        is_synthetic: true,
        created_by: actorId,
      })
    }
    return {
      person_id: null,
      business_profile_id: profile.id,
      open_path: `/broker/customers/businesses/${profile.id}`,
    }
  }

  let person = selfOf(repo, customer.id)
  if (!person) {
    const parts = customer.full_name.trim().split(/\s+/).filter(Boolean)
    const first_names = parts.length <= 1 ? customer.full_name.trim() || 'Prospect' : parts.slice(0, -1).join(' ')
    const surname = parts.length <= 1 ? '—' : parts[parts.length - 1]!
    person = repo.insert('persons', {
      first_names,
      surname,
      preferred_name: null,
      date_of_birth: null,
      gender: null,
      id_type: null,
      id_lookup_hash: null,
      id_last4: null,
      date_of_death: null,
      is_synthetic: true,
    })
    repo.insert('customer_persons', {
      customer_id: customer.id,
      person_id: person.id,
      role: 'self',
      is_primary: true,
      effective_from: new Date().toISOString().slice(0, 10),
      effective_to: null,
    })
  }
  return {
    person_id: person.id,
    business_profile_id: null,
    open_path: `/broker/customers/people/${person.id}`,
  }
}

const LEAD_STATUSES = [
  'lead',
  'contacted',
  'qualified',
  'quoting',
  'offer_sent',
  'accepted',
  'live',
  'closed',
] as const satisfies readonly LeadStatus[]

const OPEN_STAGES = LEAD_PIPELINE_STAGES

const SA_PHONE = /^(\+27|0)\d{9}$/

const motorDetails = z.object({
  make: z.string().optional(),
  model: z.string().optional(),
  year: z.number().int().min(1980).max(2030).optional(),
  value: z.number().positive().max(50_000_000).optional(),
  condition: z.enum(['new', 'used']).optional(),
  usage: z.enum(['private', 'business']).optional(),
  parking: z.enum(['garage', 'carport', 'secure_complex', 'driveway', 'street']).optional(),
  tracker: z.boolean().optional(),
  driver_age: z.number().int().min(16).max(110).optional(),
  licence_years: z.number().int().min(0).max(90).optional(),
  claims_last_3_years: z.number().int().min(0).max(20).optional(),
  cover_type: z.enum(['comprehensive', 'third_party_fire_theft', 'third_party']).optional(),
})

export const leadTools = [
  defineTool({
    name: 'lead.create',
    description: 'Create a CRM lead for a customer enquiry. Cover is optional so brokers can capture people first.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({
      customer_id: z.uuid(),
      conversation_id: z.uuid().nullable().optional(),
      line: z.enum(['personal', 'commercial']),
      product_category: z.string().min(2).nullable().optional(),
      urgency: z.enum(['low', 'medium', 'high']).default('medium'),
      vehicle: motorDetails.optional(),
      summary: z.string().optional(),
      missing_info: z.array(z.string()).default([]),
      source: z.string().default('ava'),
    }),
    run: ({ repo, actor }, input) => {
      repo.require('customers', input.customer_id)
      return repo.insert('leads', {
        customer_id: input.customer_id,
        conversation_id: input.conversation_id ?? null,
        line: input.line,
        product_category: input.product_category ?? null,
        status: 'lead',
        urgency: input.urgency,
        qualification: { vehicle: input.vehicle, summary: input.summary },
        missing_info: input.missing_info,
        source: input.source,
        created_by: actor.type === 'user' ? actor.id : null,
        closed_reason: null,
        closed_at_stage: null,
        closed_at: null,
        policy_id: null,
      })
    },
    auditEntity: (r) => ({ table: 'leads', id: r.id }),
  }),

  defineTool({
    name: 'lead.capture',
    description: 'Capture a person or business as a lead, with optional cover, phone, email, area and notes.',
    allow: [...STAFF],
    sideEffect: true,
    input: z.object({
      kind: z.enum(['person', 'business']),
      full_name: z.string().trim().min(2),
      phone: z
        .string()
        .trim()
        .transform((s) => s.replace(/\s/g, ''))
        .refine((s) => !s || SA_PHONE.test(s), 'Use a South African mobile number')
        .optional(),
      email: z
        .string()
        .trim()
        .toLowerCase()
        .refine((s) => !s || z.email().safeParse(s).success, 'Enter a valid email')
        .optional(),
      region: z.string().trim().optional(),
      notes: z.string().trim().optional(),
      product_category: z.string().trim().min(2).optional(),
    }),
    run: ({ repo, actor }, input) => {
      const customerType = input.kind === 'business' ? 'commercial' : 'personal'
      const email = input.email || null
      const phone = input.phone || null
      const region = input.region || null
      const cover = input.product_category || null
      let customer =
        (email ? repo.find('customers', (c) => c.email?.toLowerCase() === email && c.customer_type === customerType) : undefined) ??
        (phone ? repo.find('customers', (c) => c.phone === phone && c.customer_type === customerType) : undefined)

      let created = false
      if (!customer) {
        customer = repo.insert('customers', {
          customer_type: customerType,
          full_name: input.full_name,
          email,
          phone,
          region,
          status: 'prospect',
          is_synthetic: true,
          created_by: actor.type === 'user' ? actor.id : null,
        })
        created = true
      } else {
        const patch: Partial<{ full_name: string; phone: string | null; email: string | null; region: string | null }> = {}
        if (input.full_name && input.full_name !== customer.full_name) patch.full_name = input.full_name
        if (phone && !customer.phone) patch.phone = phone
        if (email && !customer.email) patch.email = email
        if (region && !customer.region) patch.region = region
        if (Object.keys(patch).length) customer = repo.update('customers', customer.id, patch)
      }

      const lead = repo.insert('leads', {
        customer_id: customer.id,
        conversation_id: null,
        line: customerType === 'commercial' ? 'commercial' : 'personal',
        product_category: cover,
        status: 'lead',
        urgency: 'medium',
        qualification: { summary: input.notes || undefined },
        missing_info: [],
        source: 'broker',
        created_by: actor.type === 'user' ? actor.id : null,
        closed_reason: null,
        closed_at_stage: null,
        closed_at: null,
        policy_id: null,
        next_action: null,
        next_action_due_at: null,
        last_activity_at: null,
        qualification_confirmed: {},
        activity: [],
      })
      const area = ensureCustomerAreaForCustomer(repo, customer, actor.type === 'user' ? actor.id : null)
      return { customer, lead, created, ...area }
    },
    auditEntity: (r) => ({ table: 'leads', id: r.lead.id }),
  }),

  defineTool({
    name: 'lead.get',
    description: 'Get a lead with its customer.',
    allow: ['agent', ...STAFF],
    sideEffect: false,
    input: z.object({ lead_id: z.uuid() }),
    run: ({ repo }, { lead_id }) => {
      const lead = repo.require('leads', lead_id)
      const customer = repo.require('customers', lead.customer_id)
      const area = customerAreaLinkForCustomer(repo, customer)
      return {
        lead,
        customer,
        person_id: area?.person_id ?? null,
        business_profile_id: area?.business_profile_id ?? null,
        open_path: area?.open_path ?? '/broker/customers',
      }
    },
  }),

  defineTool({
    name: 'lead.search',
    description: 'List leads, optionally filtered by status or product.',
    allow: ['agent', ...STAFF],
    sideEffect: false,
    input: z.object({
      status: z.array(z.enum(LEAD_STATUSES)).optional(),
      product_category: z.string().optional(),
    }),
    run: ({ repo }, { status, product_category }) =>
      repo.list(
        'leads',
        (l) => (!status || status.includes(l.status)) && (!product_category || l.product_category === product_category),
      ),
  }),

  defineTool({
    name: 'lead.update_status',
    description: 'Move a lead to a new pipeline status.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({ lead_id: z.uuid(), status: z.enum(LEAD_STATUSES) }),
    run: ({ repo }, { lead_id, status }) => {
      if (status === 'closed') {
        throw new ToolError('validation', 'Use lead.close to close an opportunity with a reason.')
      }
      return repo.update('leads', lead_id, {
        status,
        closed_reason: null,
        closed_at_stage: null,
        closed_at: null,
      })
    },
    auditEntity: (r) => ({ table: 'leads', id: r.id }),
  }),

  defineTool({
    name: 'lead.close',
    description: 'Close an opportunity at any stage, saving the reason and the stage where it stopped.',
    allow: [...STAFF],
    sideEffect: true,
    input: z.object({
      lead_id: z.uuid(),
      reason: z.string().trim().min(2),
      closed_at_stage: z.enum(['lead', 'contacted', 'qualified', 'quoting', 'offer_sent', 'accepted', 'live']).optional(),
    }),
    run: ({ repo }, { lead_id, reason, closed_at_stage }) => {
      const lead = repo.require('leads', lead_id)
      const fromLead =
        lead.status === 'closed'
          ? (lead.closed_at_stage ?? 'lead')
          : OPEN_STAGES.includes(lead.status as (typeof OPEN_STAGES)[number])
            ? (lead.status as (typeof OPEN_STAGES)[number])
            : 'lead'
      const stage = closed_at_stage ?? fromLead
      return repo.update('leads', lead_id, {
        status: 'closed',
        closed_reason: reason,
        closed_at_stage: stage,
        closed_at: new Date().toISOString(),
      })
    },
    auditEntity: (r) => ({ table: 'leads', id: r.id }),
  }),

  defineTool({
    name: 'lead.mark_live',
    description: 'Mark an opportunity Live when its linked policy is confirmed in force.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({ lead_id: z.uuid(), policy_id: z.uuid() }),
    run: ({ repo }, { lead_id, policy_id }) => {
      const lead = repo.require('leads', lead_id)
      const policy = repo.require('policies', policy_id)
      if (policy.customer_id !== lead.customer_id) {
        throw new ToolError('validation', 'That policy belongs to a different customer.')
      }
      if (policy.status !== 'in_force') {
        throw new ToolError('validation', 'The policy must be in force before the opportunity can be Live.')
      }
      return repo.update('leads', lead_id, {
        status: 'live',
        policy_id,
        closed_reason: null,
        closed_at_stage: null,
        closed_at: null,
      })
    },
    auditEntity: (r) => ({ table: 'leads', id: r.id }),
  }),

  defineTool({
    name: 'lead.record_risk_assessment',
    description: 'Attach risk review notes for the broker. Never an underwriting decision.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({
      lead_id: z.uuid(),
      notes: z.array(z.string()),
      referral_triggers: z.array(z.string()),
      coverage_gaps: z.array(z.string()),
      clarification_questions: z.array(z.string()),
    }),
    run: ({ repo }, { lead_id, ...risk }) => {
      const lead = repo.require('leads', lead_id)
      const nextStatus = lead.status === 'lead' || lead.status === 'contacted' ? 'contacted' : lead.status
      return repo.update('leads', lead_id, {
        qualification: { ...lead.qualification, risk: { ...risk, assessed_at: new Date().toISOString() } },
        status: nextStatus,
      })
    },
    auditEntity: (r) => ({ table: 'leads', id: r.id }),
  }),

  defineTool({
    name: 'lead.save_qualification',
    description: 'Save partial qualification details and optional next action. Advances to Qualified when cover need and next step are set.',
    allow: [...STAFF],
    sideEffect: true,
    input: z.object({
      lead_id: z.uuid(),
      contact_person: z.string().optional(),
      confirmed_cover_need: z.string().optional(),
      assets: z.string().optional(),
      estimated_values: z.string().optional(),
      existing_cover: z.string().optional(),
      renewal_date: z.string().optional(),
      next_action: z.string().optional(),
      next_action_due_at: z.string().datetime().nullable().optional(),
      mark_qualified: z.boolean().optional(),
    }),
    run: ({ repo, actor }, input) => {
      const lead = repo.require('leads', input.lead_id)
      if (lead.status === 'closed' || lead.status === 'live') {
        throw new ToolError('validation', 'This opportunity is already closed or live.')
      }
      const q = {
        ...lead.qualification,
        ...(input.contact_person !== undefined ? { contact_person: input.contact_person } : {}),
        ...(input.confirmed_cover_need !== undefined ? { confirmed_cover_need: input.confirmed_cover_need } : {}),
        ...(input.assets !== undefined ? { assets: input.assets } : {}),
        ...(input.estimated_values !== undefined ? { estimated_values: input.estimated_values } : {}),
        ...(input.existing_cover !== undefined ? { existing_cover: input.existing_cover } : {}),
        ...(input.renewal_date !== undefined ? { renewal_date: input.renewal_date } : {}),
      }
      const confirmed = { ...(lead.qualification_confirmed ?? {}) }
      for (const key of ['contact_person', 'confirmed_cover_need', 'assets', 'estimated_values', 'existing_cover', 'renewal_date'] as const) {
        if (input[key] !== undefined && String(input[key] ?? '').trim()) confirmed[key] = 'broker'
      }
      const now = new Date().toISOString()
      const activity = [
        ...(lead.activity ?? []),
        {
          id: crypto.randomUUID(),
          kind: 'qualification' as const,
          outcome: 'Saved',
          note: 'Qualification details updated',
          at: now,
          by: actor.type === 'user' ? actor.id : 'broker',
        },
      ]
      const hasNeed = Boolean((q.confirmed_cover_need ?? '').trim())
      const nextAction = input.next_action !== undefined ? input.next_action : lead.next_action
      const advance =
        input.mark_qualified ||
        (hasNeed && Boolean((nextAction ?? '').trim()) && (lead.status === 'lead' || lead.status === 'contacted'))
      const status = advance && LEAD_PIPELINE_STAGES.indexOf(lead.status as (typeof LEAD_PIPELINE_STAGES)[number]) < LEAD_PIPELINE_STAGES.indexOf('qualified')
        ? 'qualified'
        : lead.status
      const missing = [...lead.missing_info]
      const drop = (label: string, ok: boolean) => {
        const i = missing.indexOf(label)
        if (ok && i >= 0) missing.splice(i, 1)
        if (!ok && i < 0) missing.push(label)
      }
      drop('Contact person', Boolean((q.contact_person ?? '').trim()))
      drop('Assets and sums insured', Boolean((q.assets ?? '').trim()) || Boolean((q.estimated_values ?? '').trim()))
      drop('Current insurance', Boolean((q.existing_cover ?? '').trim()) || Boolean((q.renewal_date ?? '').trim()))
      return repo.update('leads', lead.id, {
        qualification: q,
        qualification_confirmed: confirmed,
        next_action: nextAction ?? null,
        next_action_due_at: input.next_action_due_at !== undefined ? input.next_action_due_at : lead.next_action_due_at,
        last_activity_at: now,
        activity,
        status,
        missing_info: missing,
      })
    },
    auditEntity: (r) => ({ table: 'leads', id: r.id }),
  }),

  defineTool({
    name: 'lead.log_activity',
    description: 'Log contact, a note, or a follow-up on an opportunity. Successful contact advances Lead → Contacted.',
    allow: [...STAFF],
    sideEffect: true,
    input: z.object({
      lead_id: z.uuid(),
      kind: z.enum(['contact', 'note', 'follow_up']),
      outcome: z.string().optional(),
      note: z.string().optional(),
      next_action: z.string().optional(),
      next_action_due_at: z.string().datetime().nullable().optional(),
      successful_contact: z.boolean().optional(),
    }),
    run: ({ repo, actor }, input) => {
      const lead = repo.require('leads', input.lead_id)
      if (lead.status === 'closed') throw new ToolError('validation', 'This opportunity is closed.')
      const now = new Date().toISOString()
      const activity = [
        ...(lead.activity ?? []),
        {
          id: crypto.randomUUID(),
          kind: input.kind,
          outcome: input.outcome ?? null,
          note: input.note ?? null,
          at: now,
          by: actor.type === 'user' ? actor.id : 'broker',
        },
      ]
      let status = lead.status
      if (input.kind === 'contact' && input.successful_contact && status === 'lead') status = 'contacted'
      return repo.update('leads', lead.id, {
        activity,
        last_activity_at: now,
        status,
        next_action: input.next_action !== undefined ? input.next_action : lead.next_action,
        next_action_due_at: input.next_action_due_at !== undefined ? input.next_action_due_at : lead.next_action_due_at,
      })
    },
    auditEntity: (r) => ({ table: 'leads', id: r.id }),
  }),
] as unknown as ToolDef[]
