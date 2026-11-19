import { businessKeyOf, registerRoute, type RouteAction } from './definitions'
import { asJson, clientOf, formFieldsCheck, needClient, selectClientAction } from './helpers'

export const A = {
  select: 'policy_cancel.client.select',
  instruction: 'policy_cancel.capture.instruction',
  review: 'policy_cancel.review.submit',
  confirm: 'policy_cancel.confirm.insurer',
  close: 'policy_cancel.confirm.close',
} as const

const select = selectClientAction({ id: A.select, invalidate: [A.instruction, A.review, A.confirm, A.close] })

const instruction: RouteAction = {
  id: A.instruction,
  label: 'Capture cancellation request',
  kind: 'form',
  requires: [A.select],
  russ: 'person',
  handover: 'Capture source, reason, requested date and supporting evidence.',
  check: (s, input) => needClient(s) ?? formFieldsCheck(input, ['policy_id', 'requested_effective_at', 'reason', 'source']),
  async effect({ state, input, key, port }) {
    if (!port.createCancellation) throw new Error('Cancellation create is not available.')
    const c = clientOf(state)!
    return asJson(
      await port.createCancellation({
        person_id: c.person_id,
        policy_id: input.policy_id as string,
        requested_effective_at: input.requested_effective_at as string,
        reason: input.reason as string,
        source: (input.source as string) || 'client',
        notes: (input.notes as string) || null,
        key,
      }),
    )
  },
  apply: (s, input, receipt) => {
    const r = receipt as { id: string; reference: string }
    return {
      patch: {
        request_id: r.id,
        request_reference: r.reference,
        policy_id: input.policy_id,
        reason: input.reason,
        requested_effective_at: input.requested_effective_at,
      },
      summary: `Cancellation ${r.reference}`,
      policy_id: input.policy_id as string,
      business_key: businessKeyOf('policy_cancel', { person_id: clientOf(s)?.person_id, policy_id: input.policy_id as string, intent: 'cancel' }),
    }
  },
}

const review: RouteAction = {
  id: A.review,
  label: 'Review and submit cancellation',
  kind: 'run',
  requires: [A.instruction],
  confirm: true,
  russ: 'person',
  handover: 'Review affected cover and flag open claims or pending endorsements. Send or log the external cancellation request.',
  check: (_s, input) => formFieldsCheck(input, ['channel']),
  async effect({ state, input, key, port }) {
    if (!port.transitionServiceRequest) throw new Error('Service request transition is not available.')
    return asJson(
      await port.transitionServiceRequest({
        request_id: state.request_id as string,
        to_status: 'awaiting_confirmation',
        note: `Cancellation submitted via ${input.channel}`,
        key,
      }),
    )
  },
  apply: (_s, input, receipt) => ({
    patch: { submitted: true, submit_channel: input.channel },
    summary: (receipt as { summary: string }).summary,
    waiting_on: 'insurer',
  }),
}

const confirm: RouteAction = {
  id: A.confirm,
  label: 'Record insurer confirmation and notify',
  kind: 'form',
  requires: [A.review],
  russ: 'person',
  handover: 'Record confirmed effective date and notify the client or log notification.',
  check: (_s, input) => formFieldsCheck(input, ['confirmed_effective_at', 'confirmation_source', 'channel']),
  async effect({ state, input, key, port }) {
    if (!port.transitionServiceRequest) throw new Error('Service request transition is not available.')
    await port.transitionServiceRequest({
      request_id: state.request_id as string,
      to_status: 'confirmed',
      note: `Confirmed from ${input.confirmation_source} effective ${input.confirmed_effective_at}`,
      key: `${key}:confirm`,
    })
    const c = clientOf(state)!
    const note = await port.logNote({
      person_id: c.person_id,
      body: `Cancellation ${state.request_reference} notified via ${input.channel}. ${input.note ?? ''}`.trim(),
      key: `${key}:notify`,
    })
    return asJson({ summary: 'Cancellation confirmed and client notified', notify_ref: note.reference })
  },
  apply: (_s, input, receipt) => ({
    patch: {
      confirmed_effective_at: input.confirmed_effective_at,
      confirmation_source: input.confirmation_source,
      notified: true,
      notify_ref: (receipt as { notify_ref?: string }).notify_ref ?? null,
    },
    summary: (receipt as { summary: string }).summary,
    waiting_on: null,
  }),
}

const close: RouteAction = {
  id: A.close,
  label: 'Record withdrawn or declined outcome',
  kind: 'decision',
  requires: [A.instruction],
  russ: 'person',
  handover: 'If cancellation is withdrawn or declined, record the evidenced outcome without applying.',
  check: (_s, input) => formFieldsCheck(input, ['outcome', 'reason']),
  async effect({ state, input, key, port }) {
    if (!port.transitionServiceRequest) throw new Error('Service request transition is not available.')
    const to = input.outcome === 'withdrawn' ? 'withdrawn' : 'declined'
    return asJson(await port.transitionServiceRequest({ request_id: state.request_id as string, to_status: to, note: input.reason as string, key }))
  },
  apply: (_s, input) => ({
    patch: { closed_without_apply: true, outcome: input.outcome, outcome_reason: input.reason },
    summary: `Cancellation ${input.outcome}`,
    waiting_on: null,
  }),
}

export const POLICY_CANCEL = registerRoute({
  id: 'policy_cancel',
  title: 'Cancel a policy',
  outcome: 'Cancellation or withdrawn/declined outcome evidenced and recorded. Existing claims stay linked.',
  subject: 'client',
  group: 'policies',
  eligible: ['client', 'policy'],
  category: 'both',
  intents: ['cancel a policy', 'cancel policy', 'policy cancellation', 'cancellation'],
  selectActionId: A.select,
  version: '1',
  phases: [
    { id: 'policy_cancel.capture', title: 'Record instruction', complete: 'all', actions: [select, instruction] },
    { id: 'policy_cancel.review', title: 'Review and submit', complete: 'all', actions: [review] },
    { id: 'policy_cancel.confirm', title: 'Confirm and notify', complete: 'any', actions: [confirm, close] },
  ],
})
