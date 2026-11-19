import { z } from 'zod'
import type { LeadStatus } from '../db/schema'
import { LEAD_PIPELINE_STAGES } from '../db/schema'
import { ToolError } from '../lib/errors'
import { defineTool, STAFF, type ToolDef } from './registry'

const LEAD_STATUSES = [
  'lead',
  'contacted',
  'quoting',
  'proposal_released',
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
      })
      return { customer, lead, created }
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
      return { lead, customer: repo.require('customers', lead.customer_id) }
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
      closed_at_stage: z.enum(['lead', 'contacted', 'quoting', 'proposal_released', 'accepted', 'live']).optional(),
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
] as unknown as ToolDef[]
