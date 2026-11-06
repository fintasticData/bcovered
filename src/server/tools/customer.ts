import { z } from 'zod'
import { ToolError } from '../lib/errors'
import { defineTool, STAFF, type ToolDef } from './registry'

const SA_PHONE = /^(\+27|0)\d{9}$/

export const customerTools = [
  defineTool({
    name: 'customer.search',
    description: 'Find customers by name, email or phone.',
    allow: ['agent', ...STAFF],
    sideEffect: false,
    input: z.object({ query: z.string().min(1) }),
    run: ({ repo }, { query }) => {
      const q = query.toLowerCase()
      return repo
        .list('customers', (c) =>
          [c.full_name, c.email ?? '', c.phone ?? ''].some((v) => v.toLowerCase().includes(q)),
        )
        .slice(0, 20)
    },
  }),

  defineTool({
    name: 'customer.get',
    description: 'Get one customer by id.',
    allow: ['agent', ...STAFF],
    sideEffect: false,
    input: z.object({ customer_id: z.uuid() }),
    run: ({ repo }, { customer_id }) => repo.require('customers', customer_id),
  }),

  defineTool({
    name: 'customer.create',
    description: 'Create a prospect, reusing an existing record with the same email.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({
      full_name: z.string().trim().min(2),
      email: z.email(),
      phone: z.string().transform((s) => s.replace(/\s/g, '')).pipe(z.string().regex(SA_PHONE)),
      region: z.string().optional(),
      customer_type: z.enum(['personal', 'commercial']).default('personal'),
    }),
    run: ({ repo, actor }, input) => {
      const existing = repo.find('customers', (c) => c.email?.toLowerCase() === input.email.toLowerCase())
      if (existing) return { customer: existing, created: false }
      const customer = repo.insert('customers', {
        customer_type: input.customer_type,
        full_name: input.full_name,
        email: input.email.toLowerCase(),
        phone: input.phone,
        region: input.region ?? null,
        status: 'prospect',
        is_synthetic: true,
        created_by: actor.type === 'user' ? actor.id : null,
      })
      return { customer, created: true }
    },
    auditEntity: (r) => ({ table: 'customers', id: r.customer.id }),
  }),

  defineTool({
    name: 'customer.update',
    description: 'Update contact details on a customer record.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({
      customer_id: z.uuid(),
      phone: z.string().regex(SA_PHONE).optional(),
      region: z.string().optional(),
    }),
    run: ({ repo }, { customer_id, ...patch }) => repo.update('customers', customer_id, patch),
    auditEntity: (r) => ({ table: 'customers', id: r.id }),
  }),

  defineTool({
    name: 'customer.record_consent',
    description: 'Record a POPIA consent decision for a customer.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({
      customer_id: z.uuid(),
      purpose: z.enum(['processing', 'marketing', 'email', 'whatsapp']),
      granted: z.boolean(),
      source: z.string(),
      notice_version: z.string(),
    }),
    run: ({ repo }, input) => {
      repo.require('customers', input.customer_id)
      return repo.insert('customer_consents', { ...input, captured_at: new Date().toISOString(), revoked_at: null })
    },
    auditEntity: (r) => ({ table: 'customer_consents', id: r.id }),
  }),

  defineTool({
    name: 'customer.link_conversation',
    description: 'Attach an assistant conversation to the customer it belongs to.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({ customer_id: z.uuid(), conversation_id: z.uuid() }),
    run: ({ repo }, { customer_id, conversation_id }) => {
      repo.require('customers', customer_id)
      return repo.update('conversations', conversation_id, { customer_id })
    },
    auditEntity: (r) => ({ table: 'conversations', id: r.id }),
  }),

  defineTool({
    name: 'customer.create_portal_user',
    description: 'Give a customer a portal identity so they can see released proposals.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({ customer_id: z.uuid(), full_name: z.string().trim().min(2).optional() }),
    run: ({ repo }, { customer_id, full_name }) => {
      const customer = repo.require('customers', customer_id)
      const existing = repo.find('app_users', (u) => u.customer_id === customer_id)
      if (existing) return existing
      if (!customer.email) throw new ToolError('validation', 'Customer has no email address')
      return repo.insert('app_users', {
        email: customer.email,
        full_name: full_name ?? customer.full_name,
        role: 'customer',
        customer_id,
      })
    },
    auditEntity: (r) => ({ table: 'app_users', id: r.id }),
  }),
] as unknown as ToolDef[]
