import { z } from 'zod'
import { rand } from '@/lib/quote'
import { answerQuoteQuestion, buildProposalPayload, compareOptions } from '../domain/quotes'
import { DEMO_ADAPTER_SOURCE, getDemoOptions } from '../insurers/demoAdapter'
import { ToolError } from '../lib/errors'
import { hashPayload } from '../lib/hash'
import { defineTool, STAFF, type ToolDef } from './registry'

const QUOTE_VALIDITY_DAYS = 30

export const quoteTools = [
  defineTool({
    name: 'quote.create_request',
    description: 'Open a simulated quote request from a qualified lead.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({ lead_id: z.uuid() }),
    run: ({ repo, actor }, { lead_id }) => {
      const lead = repo.require('leads', lead_id)
      if (!lead.qualification.vehicle?.value) {
        throw new ToolError('validation', 'Lead has no vehicle value; gather it before requesting quotes')
      }
      return repo.insert('quotes', {
        lead_id,
        customer_id: lead.customer_id,
        product_category: lead.product_category,
        risk_summary: { vehicle: lead.qualification.vehicle, risk: lead.qualification.risk },
        status: 'comparing',
        proposal: null,
        released_at: null,
        is_simulated: true,
        created_by: actor.type === 'user' ? actor.id : null,
      })
    },
    auditEntity: (r) => ({ table: 'quotes', id: r.id }),
  }),

  defineTool({
    name: 'quote.get',
    description: 'Get a quote with its options.',
    allow: ['agent', ...STAFF],
    sideEffect: false,
    input: z.object({ quote_id: z.uuid() }),
    run: ({ repo }, { quote_id }) => ({
      quote: repo.require('quotes', quote_id),
      options: repo.list('quote_options', (o) => o.quote_id === quote_id),
    }),
  }),

  defineTool({
    name: 'quote.get_demo_options',
    description: 'Fetch three simulated insurer options from the demo adapter. Never a real insurer quotation.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({ quote_id: z.uuid() }),
    run: ({ repo }, { quote_id }) => {
      const quote = repo.require('quotes', quote_id)
      const existing = repo.list('quote_options', (o) => o.quote_id === quote_id)
      if (existing.length) return existing
      const enabled = new Set(repo.list('insurer_access', (a) => a.product_module === 'personal_lines' && a.status === 'enabled').map((a) => a.insurer_id))
      if (!enabled.size) {
        throw new ToolError('forbidden', 'No insurer is enabled for personal-lines quoting in this brokerage. Configure and enable insurer access first.')
      }
      const expires = new Date(Date.now() + QUOTE_VALIDITY_DAYS * 86_400_000).toISOString()
      return getDemoOptions(quote.risk_summary.vehicle ?? {}, repo.list('insurers', (i) => enabled.has(i.id))).map((spec) =>
        repo.insert('quote_options', {
          quote_id,
          ...spec,
          annual_premium: spec.monthly_premium * 12,
          expires_at: expires,
          source: DEMO_ADAPTER_SOURCE,
          is_simulated: true,
        }),
      )
    },
    auditEntity: () => null,
  }),

  defineTool({
    name: 'quote.compare',
    description: 'Normalise and compare the options on a quote.',
    allow: ['agent', ...STAFF, 'customer'],
    sideEffect: false,
    input: z.object({ quote_id: z.uuid() }),
    run: ({ repo }, { quote_id }) => compareOptions(repo.list('quote_options', (o) => o.quote_id === quote_id)),
  }),

  defineTool({
    name: 'quote.answer_question',
    description: 'Answer a comparison question using only structured quote fields.',
    allow: ['agent', ...STAFF, 'customer'],
    sideEffect: false,
    input: z.object({ quote_id: z.uuid(), question: z.string().min(2).max(500) }),
    run: ({ repo }, { quote_id, question }) =>
      answerQuoteQuestion(
        question,
        repo.list('quote_options', (o) => o.quote_id === quote_id),
        repo.list('insurers'),
      ),
  }),

  defineTool({
    name: 'quote.prepare_proposal',
    description: 'Assemble the proposal payload a broker will review.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({ quote_id: z.uuid(), broker_summary: z.string().min(10) }),
    run: ({ repo, actor }, { quote_id, broker_summary }) => {
      const quote = repo.require('quotes', quote_id)
      if (quote.status === 'released') throw new ToolError('conflict', 'Proposal already released')
      const options = repo.list('quote_options', (o) => o.quote_id === quote_id)
      if (!options.length) throw new ToolError('validation', 'Quote has no options yet')
      const proposal = buildProposalPayload(quote, options, broker_summary, actor.id)
      return repo.update('quotes', quote_id, { proposal, status: 'draft' })
    },
    auditEntity: (r) => ({ table: 'quotes', id: r.id }),
  }),

  defineTool({
    name: 'quote.release_proposal',
    description: 'Release an approved proposal to the customer portal. Requires an approved, unchanged proposal.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({ quote_id: z.uuid() }),
    run: ({ repo, jobId }, { quote_id }) => {
      const quote = repo.require('quotes', quote_id)
      if (quote.status === 'released') return { quote, already_released: true }
      const approval = repo
        .list(
          'approval_requests',
          (a) => a.subject_id === quote_id && a.approval_type === 'quote_proposal_release' && a.status === 'approved',
        )
        .sort((a, b) => (b.decided_at ?? '').localeCompare(a.decided_at ?? ''))[0]
      if (!approval) {
        throw new ToolError('approval_required', 'A broker must approve this proposal before it is released')
      }
      if (!quote.proposal || hashPayload(quote.proposal) !== approval.payload_hash) {
        throw new ToolError('approval_stale', 'The proposal changed after approval; it needs a fresh broker approval')
      }

      const released = repo.update('quotes', quote_id, { status: 'released', released_at: new Date().toISOString() })
      if (quote.lead_id) repo.update('leads', quote.lead_id, { status: 'proposal_released' })
      const cheapest = quote.proposal.options.find((o) => o.id === quote.proposal!.comparison.cheapest_option_id)
      const notification = repo.insert('communications', {
        customer_id: quote.customer_id,
        channel: 'in_app',
        template: 'quote_proposal',
        subject: 'Your insurance comparison is ready',
        body: `Your broker has reviewed ${quote.proposal.options.length} simulated options, from ${rand(cheapest?.monthly_premium ?? 0)} per month. Open your portal to compare them.`,
        status: 'sent',
        preview_only: false,
        related_quote_id: quote_id,
        job_id: jobId ?? null,
      })
      const email = repo.insert('communications', {
        customer_id: quote.customer_id,
        channel: 'email',
        template: 'quote_proposal',
        subject: 'Your BCovered comparison is ready to view',
        body: 'Hi, your broker has reviewed your motor comparison. Sign in to your portal to view the options. These are simulated demo figures, not insurer quotations.',
        status: 'draft',
        preview_only: true,
        related_quote_id: quote_id,
        job_id: jobId ?? null,
      })
      return { quote: released, approval_id: approval.id, notification_id: notification.id, email_draft_id: email.id, already_released: false }
    },
    auditEntity: (r) => ({ table: 'quotes', id: r.quote.id }),
  }),
] as unknown as ToolDef[]
