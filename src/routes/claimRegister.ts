import { businessKeyOf, registerRoute, type RouteAction, type RouteState } from './definitions'
import { asJson, clientOf, confirmAction, formFieldsCheck, needClient, selectClientAction } from './helpers'
import type { Json } from '@/server/db/schema'

export const A = {
  select: 'claim_register.client.select',
  incident: 'claim_register.capture.incident',
  identifyPolicy: 'claim_register.cover.identify_policy',
  reviewCover: 'claim_register.cover.review',
  attachEvidence: 'claim_register.evidence.attach',
  requestDocs: 'claim_register.evidence.request',
  reviewSubmission: 'claim_register.evidence.review',
  submit: 'claim_register.submit.approve',
  ack: 'claim_register.submit.ack',
} as const

const select = selectClientAction({
  id: A.select,
  invalidate: [A.incident, A.identifyPolicy, A.reviewCover, A.attachEvidence, A.requestDocs, A.reviewSubmission, A.submit, A.ack],
})

const incident: RouteAction = {
  id: A.incident,
  label: 'Record incident',
  kind: 'form',
  requires: [A.select],
  russ: 'person',
  handover: 'Record loss date, incident type, summary and contact details. Save a draft early.',
  check: (s, input) => needClient(s) ?? formFieldsCheck(input, ['incident_at', 'incident_type', 'description']),
  async effect({ state, input, key, port }) {
    if (!port.createClaim) throw new Error('Claim create is not available.')
    const c = clientOf(state)!
    const r = await port.createClaim({
      person_id: c.person_id,
      policy_id: (input.policy_id as string) || null,
      incident_at: input.incident_at as string,
      incident_time_unknown: Boolean(input.incident_time_unknown),
      incident_type: input.incident_type as string,
      description: input.description as string,
      item_ids: (Array.isArray(input.item_ids) ? input.item_ids : []) as string[],
      key,
    })
    return asJson({ ...r, policy_id: input.policy_id ?? null })
  },
  apply(s, input, receipt) {
    const r = receipt as { id: string; reference: string; policy_id?: string | null; version_review_needed?: boolean }
    const policyId = (r.policy_id as string) || (input.policy_id as string) || null
    return {
      patch: {
        claim_id: r.id,
        claim_reference: r.reference,
        policy_id: policyId,
        incident_at: input.incident_at,
        incident_type: input.incident_type,
        description: input.description,
        version_review_needed: r.version_review_needed ?? false,
      },
      summary: `Claim draft ${r.reference}`,
      claim_id: r.id,
      policy_id: policyId,
      business_key: businessKeyOf('claim_register', { person_id: clientOf(s)?.person_id, claim_id: r.id, intent: 'register' }),
      waiting_on: policyId ? null : 'broker',
    }
  },
}

const identifyPolicy: RouteAction = {
  id: A.identifyPolicy,
  label: 'Identify policy',
  kind: 'form',
  requires: [A.incident],
  russ: 'person',
  handover: 'If the policy was unknown at first notice, link the applicable policy now.',
  check: (s, input) => {
    if (s.policy_id) return { status: 'ok' }
    return formFieldsCheck(input, ['policy_id'])
  },
  apply: (s, input) => {
    const policyId = (s.policy_id as string) || (input.policy_id as string)
    return { patch: { policy_id: policyId }, summary: `Policy linked`, policy_id: policyId, waiting_on: null }
  },
}

const reviewCover = confirmAction({
  id: A.reviewCover,
  label: 'Review policy at date of loss',
  requires: [A.identifyPolicy],
  handover: 'Link the applicable item and policy version. Escalate ambiguous cover for broker review.',
})

const attachEvidence: RouteAction = {
  id: A.attachEvidence,
  label: 'Attach evidence',
  kind: 'form',
  requires: [A.reviewCover],
  russ: 'person',
  handover: 'Attach available evidence. Documents that can follow later stay on the checklist.',
  check: () => ({ status: 'ok' }),
  apply: (_s, input) => ({
    patch: { evidence_attached: true, evidence_notes: input.notes ?? null },
    summary: 'Evidence attached',
  }),
}

const requestDocs: RouteAction = {
  id: A.requestDocs,
  label: 'Request missing documents',
  kind: 'run',
  requires: [A.attachEvidence],
  russ: 'person',
  handover: 'Request photos or documents still needed and set a follow-up.',
  check: () => ({ status: 'ok' }),
  async effect({ state, input, key, port }) {
    if (!port.transitionClaim) throw new Error('Claim transition is not available.')
    const note = (input.note as string) || 'Waiting for photos/documents from client'
    return asJson(await port.transitionClaim({ claim_id: state.claim_id as string, to_status: 'awaiting_evidence', note, key }))
  },
  apply: (_s, input) => ({
    patch: { awaiting_evidence: true },
    summary: 'Awaiting evidence',
    waiting_on: 'client',
    due_at: (input.due_at as string) || null,
  }),
}

const reviewSubmission = confirmAction({
  id: A.reviewSubmission,
  label: 'Review submission',
  requires: [A.requestDocs],
  handover: 'Confirm the checklist is ready to submit, or that permitted documents will follow separately.',
  waiting_on: null,
})

const submit: RouteAction = {
  id: A.submit,
  label: 'Approve and submit or record external submission',
  kind: 'run',
  requires: [A.reviewSubmission],
  confirm: true,
  russ: 'person',
  handover: 'Approve and submit, or record an external submission with evidence. Use channel “external” when done outside the system.',
  check: (_s, input) => formFieldsCheck(input, ['channel']),
  async effect({ state, input, key, port }) {
    if (!port.recordClaimSubmission) throw new Error('Claim submission is not available.')
    const channel = String(input.channel)
    return asJson(
      await port.recordClaimSubmission({
        claim_id: state.claim_id as string,
        channel: channel.startsWith('external') ? channel : channel,
        insurer_reference: (input.insurer_reference as string) || null,
        key,
      }),
    )
  },
  apply: (_s, input, receipt) => ({
    patch: { submitted: true, submit_channel: input.channel, external: String(input.channel).startsWith('external') },
    summary: (receipt as { summary: string }).summary,
    waiting_on: input.insurer_reference ? null : 'insurer',
  }),
}

const ack: RouteAction = {
  id: A.ack,
  label: 'Record acknowledgement',
  kind: 'form',
  requires: [A.submit],
  russ: 'person',
  handover: 'Record the insurer claim reference when acknowledgement arrives. If still outstanding, keep a visible follow-up.',
  check: (_s, input) => {
    if (input.insurer_reference || input.follow_up_due) return { status: 'ok' }
    return { status: 'needs_input', reason: 'Enter the insurer reference or a follow-up date.', fields: { insurer_reference: 'Required unless you set a follow-up.' } }
  },
  apply: (_s, input) => ({
    patch: { insurer_reference: input.insurer_reference ?? null, ack_recorded: true },
    summary: input.insurer_reference ? `Ack ${input.insurer_reference}` : 'Follow-up for acknowledgement',
    waiting_on: input.insurer_reference ? null : 'insurer',
    due_at: (input.follow_up_due as string) || null,
  }),
}

export const CLAIM_REGISTER = registerRoute({
  id: 'claim_register',
  title: 'Register a claim',
  outcome: 'Submission evidenced, with acknowledgement or an owned next action for outstanding items.',
  subject: 'client',
  group: 'claims',
  eligible: ['client', 'policy', 'claim'],
  category: 'both',
  intents: ['register a claim', 'register claim', 'report a claim', 'report an incident', 'new claim', 'first notice'],
  selectActionId: A.select,
  version: '1',
  phases: [
    { id: 'claim_register.capture', title: 'Capture first notice', complete: 'all', actions: [select, incident] },
    { id: 'claim_register.cover', title: 'Find relevant cover', complete: 'all', actions: [identifyPolicy, reviewCover] },
    { id: 'claim_register.evidence', title: 'Prepare evidence', complete: 'all', actions: [attachEvidence, requestDocs, reviewSubmission] },
    { id: 'claim_register.submit', title: 'Submit and track', complete: 'all', actions: [submit, ack] },
  ],
})

export const claimIdOf = (s: RouteState) => (s.claim_id as string | null) ?? null
