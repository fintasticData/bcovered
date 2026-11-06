import { z } from 'zod'
import type { LeadStatus } from '../db/schema'
import { defineTool, STAFF, type ToolDef } from './registry'

const LEAD_STATUSES = [
  'new',
  'qualifying',
  'qualified',
  'quoting',
  'proposal_pending',
  'proposal_released',
  'won',
  'lost',
] as const satisfies readonly LeadStatus[]

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
    description: 'Create a CRM lead for a customer enquiry.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({
      customer_id: z.uuid(),
      conversation_id: z.uuid().nullable().optional(),
      line: z.enum(['personal', 'commercial']),
      product_category: z.string().min(2),
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
        product_category: input.product_category,
        status: input.missing_info.length ? 'qualifying' : 'qualified',
        urgency: input.urgency,
        qualification: { vehicle: input.vehicle, summary: input.summary },
        missing_info: input.missing_info,
        source: input.source,
        created_by: actor.type === 'user' ? actor.id : null,
      })
    },
    auditEntity: (r) => ({ table: 'leads', id: r.id }),
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
    run: ({ repo }, { lead_id, status }) => repo.update('leads', lead_id, { status }),
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
      return repo.update('leads', lead_id, {
        qualification: { ...lead.qualification, risk: { ...risk, assessed_at: new Date().toISOString() } },
        status: lead.status === 'new' || lead.status === 'qualifying' ? 'qualified' : lead.status,
      })
    },
    auditEntity: (r) => ({ table: 'leads', id: r.id }),
  }),
] as unknown as ToolDef[]
