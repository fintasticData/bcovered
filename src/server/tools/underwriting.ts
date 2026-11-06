import { z } from 'zod'
import type { CommercialSubmission } from '../db/commercialSchema'
import type { Repo } from '../db/store'
import { buildPack, proposeSections, validateSubmission } from '../domain/commercial/submission'
import { ToolError } from '../lib/errors'
import { hashPayload } from '../lib/hash'
import { profileSnapshot } from './business'
import { defineTool, STAFF, type ToolDef } from './registry'
import { templateFor } from './risk'
import { createTask } from './task'

const OPEN_STATUSES: CommercialSubmission['status'][] = ['draft', 'awaiting_approval']

export const openCustomerDocuments = (repo: Repo, profileId: string) =>
  repo.list('tasks', (t) => t.subject_id === profileId && t.audience === 'customer' && t.status === 'open')

/** Rebuilds the pack from current records. Any change alters its hash, so a pending approval goes stale. */
function rebuildPack(repo: Repo, submissionId: string, brokerSummary: string | null, preparedBy: string) {
  const submission = repo.require('commercial_submissions', submissionId)
  const s = profileSnapshot(repo, submission.business_profile_id)
  const sections = repo.list('submission_sections', (x) => x.submission_id === submissionId)
  const exposures = submission.risk_profile_id ? repo.list('risk_exposures', (e) => e.risk_profile_id === submission.risk_profile_id) : []
  const docs = openCustomerDocuments(repo, s.profile.id).filter((t) => t.kind === 'document_request').map((t) => t.title)
  const outstanding = [...s.profile.missing_info, ...docs]
  const pack = buildPack(s, { id: submissionId, outstanding_items: outstanding }, sections, exposures, templateFor(repo, s.profile.industry_key).name, brokerSummary, preparedBy)
  const { validation, completeness } = validateSubmission(s, sections, docs)
  return repo.update('commercial_submissions', submissionId, { pack, outstanding_items: outstanding, validation, completeness })
}

export const underwritingTools = [
  defineTool({
    name: 'underwriting.prepare_submission',
    description: 'Draft or refresh the underwriting submission pack. Keeps sections a broker has edited. Never sends anything to an insurer.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({ profile_id: z.uuid(), risk_profile_id: z.uuid(), lead_id: z.uuid().nullable().optional() }),
    run: ({ repo, actor, jobId }, { profile_id, risk_profile_id, lead_id }) => {
      const s = profileSnapshot(repo, profile_id)
      const exposures = repo.list('risk_exposures', (e) => e.risk_profile_id === risk_profile_id)
      if (!exposures.length) throw new ToolError('validation', 'Assess exposures before preparing a submission')
      const existing = repo
        .list('commercial_submissions', (x) => x.business_profile_id === profile_id && !['ready_for_market', 'rejected'].includes(x.status))
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
      if (existing?.status === 'approved') throw new ToolError('conflict', 'This submission is approved; finalise it before preparing another')

      const submission = existing
        ? repo.update('commercial_submissions', existing.id, { risk_profile_id, job_id: jobId ?? existing.job_id, status: 'draft' })
        : repo.insert('commercial_submissions', {
            business_profile_id: profile_id,
            customer_id: s.profile.customer_id,
            lead_id: lead_id ?? null,
            risk_profile_id,
            job_id: jobId ?? null,
            status: 'draft',
            pack: null,
            completeness: 0,
            outstanding_items: [],
            validation: null,
            is_simulated: true,
            approved_at: null,
            created_by: actor.type === 'user' ? actor.id : null,
          })

      const current = repo.list('submission_sections', (x) => x.submission_id === submission.id)
      proposeSections(s, exposures).forEach((p) => {
        const row = current.find((x) => x.cover_class === p.cover_class)
        if (!row) {
          repo.insert('submission_sections', { ...p, submission_id: submission.id, status: 'proposed', notes: null, broker_edited: false })
        } else if (row.broker_edited) {
          repo.update('submission_sections', row.id, { asset_ids: p.asset_ids, exposure_ids: p.exposure_ids })
        } else {
          repo.update('submission_sections', row.id, p)
        }
      })
      const updated = rebuildPack(repo, submission.id, null, actor.id)
      return { submission: updated, sections: repo.list('submission_sections', (x) => x.submission_id === submission.id) }
    },
    auditEntity: (r) => ({ table: 'commercial_submissions', id: r.submission.id }),
  }),

  defineTool({
    name: 'underwriting.validate_submission',
    description: 'Check the submission for blocking errors and warnings, and score its completeness.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({ submission_id: z.uuid() }),
    run: ({ repo }, { submission_id }) => {
      const submission = repo.require('commercial_submissions', submission_id)
      const s = profileSnapshot(repo, submission.business_profile_id)
      const sections = repo.list('submission_sections', (x) => x.submission_id === submission_id)
      const docs = openCustomerDocuments(repo, s.profile.id).filter((t) => t.kind === 'document_request').map((t) => t.title)
      const { validation, completeness } = validateSubmission(s, sections, docs)
      repo.update('commercial_submissions', submission_id, { validation, completeness })
      return { validation, completeness }
    },
    auditEntity: () => null,
  }),

  defineTool({
    name: 'underwriting.set_broker_summary',
    description: 'Attach the broker review summary to the draft pack.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({ submission_id: z.uuid(), broker_summary: z.string().min(20) }),
    run: ({ repo, actor }, { submission_id, broker_summary }) => {
      const submission = repo.require('commercial_submissions', submission_id)
      if (!OPEN_STATUSES.includes(submission.status)) throw new ToolError('conflict', `Submission is ${submission.status.replace(/_/g, ' ')}`)
      return rebuildPack(repo, submission_id, broker_summary, submission.pack?.prepared_by_agent ?? actor.id)
    },
    auditEntity: (r) => ({ table: 'commercial_submissions', id: r.id }),
  }),

  defineTool({
    name: 'underwriting.update_section',
    description: 'A broker includes, excludes or corrects a section. Changes the pack, so any pending approval must be re-requested.',
    allow: STAFF,
    sideEffect: true,
    input: z.object({
      section_id: z.uuid(),
      status: z.enum(['proposed', 'included', 'excluded']).optional(),
      sum_insured: z.number().nonnegative().max(10_000_000_000).nullable().optional(),
      limit_of_indemnity: z.number().nonnegative().max(10_000_000_000).nullable().optional(),
      notes: z.string().max(1000).nullable().optional(),
    }),
    run: ({ repo }, { section_id, ...patch }) => {
      const section = repo.require('submission_sections', section_id)
      const submission = repo.require('commercial_submissions', section.submission_id)
      if (!OPEN_STATUSES.includes(submission.status)) {
        throw new ToolError('conflict', `This submission is ${submission.status.replace(/_/g, ' ')}; start a new review to change it`)
      }
      const updated = repo.update('submission_sections', section_id, { ...patch, broker_edited: true })
      const after = rebuildPack(repo, submission.id, submission.pack?.broker_summary ?? null, submission.pack?.prepared_by_agent ?? 'commercial_underwriting')
      return { section: updated, submission: after }
    },
    auditEntity: (r) => ({ table: 'submission_sections', id: r.section.id }),
  }),

  defineTool({
    name: 'underwriting.refresh_pack',
    description: 'Rebuild an open pack after profile corrections, keeping the broker summary.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({ submission_id: z.uuid() }),
    run: ({ repo }, { submission_id }) => {
      const submission = repo.require('commercial_submissions', submission_id)
      if (!OPEN_STATUSES.includes(submission.status)) throw new ToolError('conflict', `Submission is ${submission.status.replace(/_/g, ' ')}`)
      return rebuildPack(repo, submission_id, submission.pack?.broker_summary ?? null, submission.pack?.prepared_by_agent ?? 'commercial_underwriting')
    },
    auditEntity: (r) => ({ table: 'commercial_submissions', id: r.id }),
  }),

  defineTool({
    name: 'underwriting.finalise_submission',
    description: 'Mark an approved pack as ready for market. Requires an approved, unchanged pack. Does not contact any insurer.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({ submission_id: z.uuid() }),
    run: ({ repo, jobId }, { submission_id }) => {
      const submission = repo.require('commercial_submissions', submission_id)
      if (submission.status === 'ready_for_market') return { submission, already_final: true, notification_id: null }
      const approval = repo
        .list('approval_requests', (a) => a.subject_id === submission_id && a.approval_type === 'underwriting_submission' && a.status === 'approved')
        .sort((a, b) => (b.decided_at ?? '').localeCompare(a.decided_at ?? ''))[0]
      if (!approval) throw new ToolError('approval_required', 'A broker must approve this submission pack first')
      if (!submission.pack || hashPayload(submission.pack) !== approval.payload_hash) {
        throw new ToolError('approval_stale', 'The pack changed after approval; it needs a fresh broker approval')
      }
      const final = repo.update('commercial_submissions', submission_id, { status: 'ready_for_market', approved_at: new Date().toISOString() })
      const profile = repo.require('business_profiles', submission.business_profile_id)
      const name = profile.trading_name ?? profile.registered_name
      createTask(repo, 'commercial_underwriting', jobId ?? null, {
        customer_id: submission.customer_id,
        subject_table: 'commercial_submissions',
        subject_id: submission_id,
        kind: 'broker_review',
        audience: 'broker',
        title: `Choose insurers to approach for ${name}`,
        detail: 'The pack is approved as ready for market. No insurer has been contacted by the system.',
        assigned_to: profile.assigned_broker_id,
        due_in_days: 5,
        dedupe_key: `${submission_id}:market`,
      })
      const portalUser = repo.find('app_users', (u) => u.customer_id === submission.customer_id)
      const notification = portalUser
        ? repo.insert('communications', {
            customer_id: submission.customer_id,
            channel: 'in_app',
            template: 'business_risk_review',
            subject: 'Your broker has reviewed your business risk profile',
            body: `Your broker reviewed the risk profile for ${name} and approved a draft submission pack. It has not been sent to any insurer yet. Please send the documents still requested so your broker can approach insurers.`,
            status: 'sent',
            preview_only: false,
            related_quote_id: null,
            job_id: jobId ?? null,
          })
        : null
      return { submission: final, already_final: false, notification_id: notification?.id ?? null }
    },
    auditEntity: (r) => ({ table: 'commercial_submissions', id: r.submission.id }),
  }),
] as unknown as ToolDef[]
