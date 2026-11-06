import { z } from 'zod'
import type { Json } from '../db/schema'
import { ToolError } from '../lib/errors'
import { hashPayload } from '../lib/hash'
import { defineTool, STAFF, type ToolDef } from './registry'

const APPROVAL_TYPES = [
  'quote_proposal_release',
  'policy_change',
  'claim_submission',
  'external_communication',
  'sensitive_record_update',
  'bulk_campaign',
  'renewal_recommendation',
  'underwriting_submission',
] as const

export const approvalTools = [
  defineTool({
    name: 'approval.request',
    description: 'Ask a licensed person to approve a consequential action. Pins the exact payload by hash.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({
      approval_type: z.enum(APPROVAL_TYPES),
      subject_table: z.string(),
      subject_id: z.uuid(),
      summary: z.string().min(5),
      proposed_changes: z.unknown(),
      risk_flags: z.array(z.string()).default([]),
      evidence: z.array(z.object({ label: z.string(), ref: z.string() })).default([]),
    }),
    run: ({ repo, actor, jobId }, input) => {
      const payload_hash = hashPayload(input.proposed_changes)
      const open = repo.find(
        'approval_requests',
        (a) => a.subject_id === input.subject_id && a.approval_type === input.approval_type && a.status === 'pending',
      )
      if (open && open.payload_hash === payload_hash) return open
      if (open) repo.update('approval_requests', open.id, { status: 'cancelled', decision_note: 'Superseded by a newer request' })

      if (input.subject_table === 'quotes') repo.update('quotes', input.subject_id, { status: 'awaiting_approval' })
      if (input.subject_table === 'commercial_submissions') {
        repo.update('commercial_submissions', input.subject_id, { status: 'awaiting_approval' })
      }
      return repo.insert('approval_requests', {
        job_id: jobId ?? null,
        approval_type: input.approval_type,
        subject_table: input.subject_table,
        subject_id: input.subject_id,
        requested_by_agent: actor.id,
        summary: input.summary,
        proposed_changes: structuredClone(input.proposed_changes ?? null) as Json,
        payload_hash,
        risk_flags: input.risk_flags,
        evidence: input.evidence,
        status: 'pending',
        decided_by: null,
        decided_at: null,
        decision_note: null,
      })
    },
    auditEntity: (r) => ({ table: 'approval_requests', id: r.id }),
  }),

  defineTool({
    name: 'approval.resolve',
    description: 'Record a human decision. Agents cannot call this tool.',
    allow: STAFF,
    sideEffect: true,
    input: z.object({
      approval_id: z.uuid(),
      decision: z.enum(['approved', 'rejected', 'changes_requested']),
      note: z.string().max(1000).optional(),
      payload_hash: z.string().min(8),
    }),
    run: ({ repo, actor }, { approval_id, decision, note, payload_hash }) => {
      if (actor.type !== 'user') throw new ToolError('forbidden', 'Only a person can resolve an approval')
      const approval = repo.require('approval_requests', approval_id)
      if (approval.status !== 'pending') throw new ToolError('conflict', `Approval is already ${approval.status}`)
      if (payload_hash !== approval.payload_hash) {
        throw new ToolError('approval_stale', 'You reviewed a different version of this request; reload and review again')
      }
      if (approval.subject_table === 'quotes') {
        const quote = repo.require('quotes', approval.subject_id)
        if (hashPayload(quote.proposal) !== approval.payload_hash) {
          throw new ToolError('approval_stale', 'The proposal changed after this request was raised')
        }
      }
      if (approval.subject_table === 'commercial_submissions') {
        const submission = repo.require('commercial_submissions', approval.subject_id)
        if (hashPayload(submission.pack) !== approval.payload_hash) {
          throw new ToolError('approval_stale', 'The submission pack changed after this request was raised; request approval again')
        }
      }
      if (decision !== 'approved' && !note?.trim()) {
        throw new ToolError('validation', 'Add a note explaining the rejection or the changes needed')
      }

      const updated = repo.update('approval_requests', approval_id, {
        status: decision,
        decided_by: actor.id,
        decided_at: new Date().toISOString(),
        decision_note: note?.trim() || null,
      })
      if (approval.subject_table === 'quotes') {
        const status = decision === 'approved' ? 'approved' : decision === 'rejected' ? 'rejected' : 'draft'
        const quote = repo.update('quotes', approval.subject_id, { status })
        if (quote.lead_id && decision === 'rejected') repo.update('leads', quote.lead_id, { status: 'qualified' })
      }
      if (approval.subject_table === 'commercial_submissions') {
        const status = decision === 'approved' ? 'approved' : decision === 'rejected' ? 'rejected' : 'draft'
        repo.update('commercial_submissions', approval.subject_id, { status })
      }
      return updated
    },
    auditEntity: (r) => ({ table: 'approval_requests', id: r.id }),
  }),

  defineTool({
    name: 'approval.search',
    description: 'List approval requests by status.',
    allow: ['agent', ...STAFF],
    sideEffect: false,
    input: z.object({ status: z.array(z.enum(['pending', 'approved', 'rejected', 'changes_requested', 'cancelled'])).optional() }),
    run: ({ repo }, { status }) => repo.list('approval_requests', (a) => !status || status.includes(a.status)),
  }),
] as unknown as ToolDef[]
