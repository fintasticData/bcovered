import { businessKeyOf, registerRoute, type RouteAction } from './definitions'
import { asJson, clientOf, confirmAction, formFieldsCheck, needClient, selectClientAction } from './helpers'

export const A = {
  select: 'claim_progress.client.select',
  review: 'claim_progress.review.file',
  next: 'claim_progress.action.next',
  log: 'claim_progress.next.log',
  resolveOffer: 'claim_progress.next.resolve',
} as const

const select = selectClientAction({ id: A.select, invalidate: [A.review, A.next, A.log, A.resolveOffer] })

const review: RouteAction = {
  id: A.review,
  label: 'Review the file',
  kind: 'form',
  requires: [A.select],
  russ: 'person',
  handover: 'Review last activity, insurer reference, claim stage, outstanding evidence and next due date.',
  check: (s, input) => needClient(s) ?? formFieldsCheck(input, ['claim_id']),
  apply: (s, input) => ({
    patch: {
      claim_id: input.claim_id,
      claim_reference: input.claim_reference ?? null,
      insurer_reference: input.insurer_reference ?? null,
      claim_stage: input.claim_stage ?? null,
    },
    summary: `Reviewing claim ${input.claim_reference ?? input.claim_id}`,
    claim_id: input.claim_id as string,
    business_key: businessKeyOf('claim_progress', {
      person_id: clientOf(s)?.person_id,
      claim_id: input.claim_id as string,
      intent: `follow_up:${input.cycle_id ?? Date.now()}`,
    }),
  }),
}

const next: RouteAction = {
  id: A.next,
  label: 'Take the next action',
  kind: 'form',
  requires: [A.review],
  russ: 'person',
  handover: 'Request documents, follow up with the insurer, or record an update.',
  check: (_s, input) => formFieldsCheck(input, ['action_type', 'note']),
  async effect({ state, input, key, port }) {
    const c = clientOf(state)!
    if (input.action_type === 'request_documents' && port.transitionClaim) {
      return asJson(
        await port.transitionClaim({
          claim_id: state.claim_id as string,
          to_status: 'awaiting_evidence',
          note: input.note as string,
          key,
        }),
      )
    }
    return asJson(
      await port.logNote({
        person_id: c.person_id,
        body: `Claim ${state.claim_reference ?? state.claim_id}: ${input.action_type} — ${input.note}`,
        key,
      }),
    )
  },
  apply: (_s, input, receipt) => ({
    patch: { last_action: input.action_type, last_action_note: input.note },
    summary: (receipt as { summary?: string; reference?: string }).summary ?? `Action: ${input.action_type}`,
    waiting_on: input.action_type === 'request_documents' ? 'client' : input.action_type === 'follow_up_insurer' ? 'insurer' : null,
  }),
}

const log: RouteAction = {
  id: A.log,
  label: 'Log response and assign next action',
  kind: 'form',
  requires: [A.next],
  russ: 'person',
  handover: 'Store the response, owner and due date when open work remains.',
  check: (_s, input) => formFieldsCheck(input, ['response']),
  apply: (_s, input) => ({
    patch: { response: input.response, next_action: input.next_action ?? null },
    summary: 'Next step logged',
    waiting_on: (input.waiting_on as string) || null,
    due_at: (input.due_at as string) || null,
  }),
}

const resolveOffer = confirmAction({
  id: A.resolveOffer,
  label: 'Offer resolve claim',
  requires: [A.log],
  handover: 'If a final decision has arrived, continue with Resolve a claim for this claim.',
})

export const CLAIM_PROGRESS = registerRoute({
  id: 'claim_progress',
  title: 'Progress a claim',
  outcome: 'Follow-up result and next action recorded. The claim stays open unless later resolved.',
  subject: 'client',
  group: 'claims',
  eligible: ['client', 'claim'],
  category: 'both',
  intents: ['progress a claim', 'progress claim', 'claim follow up', 'follow up claim', 'claim update'],
  selectActionId: A.select,
  version: '1',
  phases: [
    { id: 'claim_progress.review', title: 'Review the file', complete: 'all', actions: [select, review] },
    { id: 'claim_progress.action', title: 'Take the next action', complete: 'all', actions: [next] },
    { id: 'claim_progress.next', title: 'Set the next step', complete: 'all', actions: [log, resolveOffer] },
  ],
})
