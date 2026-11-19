import { businessKeyOf, registerRoute, type ActionInput, type RouteAction, type RouteState } from './definitions'
import { asJson, clientOf, confirmAction, formFieldsCheck, needClient, selectClientAction } from './helpers'
import type { Json } from '@/server/db/schema'

export const A = {
  select: 'policy_change.client.select',
  capture: 'policy_change.capture.request',
  review: 'policy_change.review.compare',
  requestEndorsement: 'policy_change.review.request_endorsement',
  insurerTerms: 'policy_change.confirm.insurer_terms',
  clientAccept: 'policy_change.confirm.client_acceptance',
  apply: 'policy_change.apply.change',
  decline: 'policy_change.apply.decline',
} as const

const select = selectClientAction({ id: A.select, invalidate: [A.capture, A.review, A.requestEndorsement, A.insurerTerms, A.clientAccept, A.apply] })

const capture: RouteAction = {
  id: A.capture,
  label: 'Record change request',
  kind: 'form',
  requires: [A.select],
  russ: 'person',
  handover: 'Capture the change request, requested effective date and what is affected.',
  check: (s, input) => needClient(s) ?? formFieldsCheck(input, ['policy_id', 'requested_effective_at', 'summary']),
  async effect({ state, input, key, port }) {
    if (!port.createEndorsement) throw new Error('Endorsement create is not available.')
    const c = clientOf(state)!
    const r = await port.createEndorsement({
      person_id: c.person_id,
      policy_id: input.policy_id as string,
      requested_effective_at: input.requested_effective_at as string,
      change: { summary: input.summary, items: input.items ?? null, terms: input.terms ?? null } as Json,
      item_id: (input.item_id as string) || null,
      notes: (input.notes as string) || null,
      key,
    })
    return asJson({ ...r, policy_id: input.policy_id, requested_effective_at: input.requested_effective_at, summary: input.summary })
  },
  apply(s, input, receipt) {
    const r = receipt as { id: string; reference: string; policy_id: string; summary: string }
    return {
      patch: {
        request_id: r.id,
        request_reference: r.reference,
        policy_id: r.policy_id,
        change_summary: r.summary,
        requested_effective_at: input.requested_effective_at,
      },
      summary: `Change request ${r.reference}`,
      policy_id: r.policy_id,
      business_key: businessKeyOf('policy_change', { person_id: clientOf(s)?.person_id, policy_id: r.policy_id, intent: 'change' }),
      waiting_on: null,
    }
  },
}

const review = confirmAction({
  id: A.review,
  label: 'Compare current and proposed cover',
  requires: [A.capture],
  handover: 'Review differences in items, premium, excess, limits and dates against the request.',
})

const requestEndorsement: RouteAction = {
  id: A.requestEndorsement,
  label: 'Request endorsement or record external request',
  kind: 'run',
  requires: [A.review],
  russ: 'person',
  handover: 'Send through the existing workflow or log that the request was made externally, with evidence.',
  check: (_s, input) => formFieldsCheck(input, ['channel']),
  async effect({ state, input, key, port }) {
    const requestId = state.request_id as string
    if (!port.transitionServiceRequest) throw new Error('Service request transition is not available.')
    const note = input.channel === 'external' ? `External request recorded: ${input.note ?? ''}` : `Requested via ${input.channel}`
    return asJson(await port.transitionServiceRequest({ request_id: requestId, to_status: 'awaiting_confirmation', note, key }))
  },
  apply: (_s, input, receipt) => ({
    patch: { endorsement_channel: input.channel },
    summary: (receipt as { summary: string }).summary,
    waiting_on: 'insurer',
  }),
}

const insurerTerms: RouteAction = {
  id: A.insurerTerms,
  label: 'Record insurer terms',
  kind: 'form',
  requires: [A.requestEndorsement],
  russ: 'person',
  handover: 'Record the insurer’s confirmed terms and effective date.',
  check: (_s, input) => formFieldsCheck(input, ['confirmed_effective_at', 'confirmation_source']),
  apply: (_s, input) => ({
    patch: {
      confirmed_effective_at: input.confirmed_effective_at,
      confirmation_source: input.confirmation_source,
      insurer_reference: input.insurer_reference ?? null,
    },
    summary: 'Insurer terms recorded',
    waiting_on: 'client',
  }),
}

const clientAccept = confirmAction({
  id: A.clientAccept,
  label: 'Record client acceptance',
  requires: [A.insurerTerms],
  handover: 'Confirm the client accepted the insurer terms when required.',
  waiting_on: null,
})

const applyChange: RouteAction = {
  id: A.apply,
  label: 'Apply confirmed change and notify',
  kind: 'run',
  requires: [A.clientAccept],
  confirm: true,
  russ: 'person',
  handover: 'Apply the confirmed change, then notify the client or log that they were notified elsewhere. Confirm refreshed details if another job changed this policy.',
  check: (s, input) => {
    if (!(s.request_id as string)) return { status: 'blocked', reason: 'Capture the change request first.' }
    return formFieldsCheck(input, ['channel'])
  },
  async effect({ state, input, key, port }) {
    if (!port.confirmEndorsement) throw new Error('Endorsement confirm is not available.')
    const confirmed = await port.confirmEndorsement({
      request_id: state.request_id as string,
      confirmed_effective_at: state.confirmed_effective_at as string,
      confirmation_source: (state.confirmation_source as string) || 'insurer',
      insurer_reference: (state.insurer_reference as string) || null,
      key: `${key}:confirm`,
    })
    const c = clientOf(state)!
    const note = await port.logNote({
      person_id: c.person_id,
      body: `Policy change ${state.request_reference}: applied and client notified via ${input.channel}. ${input.note ?? ''}`.trim(),
      key: `${key}:notify`,
    })
    return asJson({ ...confirmed, notify_ref: note.reference, channel: input.channel })
  },
  apply: (_s, input, receipt) => ({
    patch: {
      applied: true,
      notified: true,
      notify_channel: input.channel,
      version_id: (receipt as { version_id?: string }).version_id ?? null,
      notify_ref: (receipt as { notify_ref?: string }).notify_ref ?? null,
    },
    summary: (receipt as { summary: string }).summary,
    waiting_on: null,
  }),
}

const decline: RouteAction = {
  id: A.decline,
  label: 'Record declined or withdrawn',
  kind: 'decision',
  requires: [A.capture],
  russ: 'person',
  handover: 'If the request is declined or withdrawn, record the reason and finish without applying.',
  check: (_s, input) => formFieldsCheck(input, ['outcome', 'reason']),
  async effect({ state, input, key, port }) {
    if (!port.transitionServiceRequest) throw new Error('Service request transition is not available.')
    const to = input.outcome === 'withdrawn' ? 'withdrawn' : 'declined'
    return asJson(await port.transitionServiceRequest({ request_id: state.request_id as string, to_status: to, note: input.reason as string, key }))
  },
  apply: (_s, input) => ({
    patch: { closed_without_apply: true, outcome: input.outcome, outcome_reason: input.reason },
    summary: `Change ${input.outcome}`,
    waiting_on: null,
  }),
}

export const POLICY_CHANGE = registerRoute({
  id: 'policy_change',
  title: 'Change a policy',
  outcome: 'Confirmed endorsement saved with effective date, or declined/withdrawn with reason.',
  subject: 'client',
  group: 'policies',
  eligible: ['client', 'policy'],
  category: 'both',
  intents: ['change a policy', 'change policy', 'policy change', 'endorsement', 'policy endorsement'],
  selectActionId: A.select,
  version: '1',
  phases: [
    { id: 'policy_change.capture', title: 'Capture the request', complete: 'all', actions: [select, capture] },
    { id: 'policy_change.review', title: 'Review the change', complete: 'all', actions: [review, requestEndorsement] },
    { id: 'policy_change.confirm', title: 'Collect confirmation', complete: 'all', actions: [insurerTerms, clientAccept] },
    { id: 'policy_change.apply', title: 'Apply and notify', complete: 'any', actions: [applyChange, decline] },
  ],
})

export const policyIdOf = (s: RouteState) => (s.policy_id as string | null) ?? null
export const requestIdOf = (s: RouteState) => (s.request_id as string | null) ?? null

export function prefillChangeInput(input: ActionInput, ctx: { policy_id?: string | null; person_id?: string | null }) {
  return {
    ...input,
    ...(ctx.policy_id && !input.policy_id ? { policy_id: ctx.policy_id } : {}),
    ...(ctx.person_id && !input.person_id ? { person_id: ctx.person_id } : {}),
  }
}
