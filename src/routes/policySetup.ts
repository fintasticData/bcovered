import { businessKeyOf, registerRoute, type RouteAction } from './definitions'
import { asJson, clientOf, confirmAction, formFieldsCheck, needClient, selectClientAction } from './helpers'

export const A = {
  select: 'policy_setup.client.select',
  source: 'policy_setup.source.confirm',
  details: 'policy_setup.details.review',
  placement: 'policy_setup.placement.confirm',
  save: 'policy_setup.file.save',
  handover: 'policy_setup.file.handover',
} as const

const select = selectClientAction({ id: A.select, invalidate: [A.source, A.details, A.placement, A.save, A.handover] })

const source: RouteAction = {
  id: A.source,
  label: 'Link accepted quote or attach insurer schedule',
  kind: 'form',
  requires: [A.select],
  russ: 'person',
  handover: 'Select the client source: link an accepted quote or attach the insurer schedule, then create or resume the draft.',
  check: (s, input) => {
    const base = needClient(s) ?? formFieldsCheck(input, ['source_type'])
    if (base) return base
    if (input.source_type === 'accepted_quote' && !(typeof input.quote_id === 'string' && input.quote_id.trim())) {
      return { status: 'needs_input', reason: 'Enter or link the accepted quote reference.', fields: { quote_id: 'Quote reference is required.' } }
    }
    if (input.source_type === 'insurer_schedule' && !(typeof input.schedule_note === 'string' && input.schedule_note.trim())) {
      return { status: 'needs_input', reason: 'Add a schedule note or reference.', fields: { schedule_note: 'Schedule note is required.' } }
    }
    return { status: 'ok' }
  },
  apply: (s, input) => ({
    patch: { source_type: input.source_type, quote_id: input.quote_id ?? null, schedule_note: input.schedule_note ?? null, policy_number: input.policy_number ?? null },
    summary: `Source: ${input.source_type}`,
    business_key: businessKeyOf('policy_setup', { person_id: clientOf(s)?.person_id, intent: 'setup', draft_id: (input.draft_id as string) || undefined }),
  }),
}

const details = confirmAction({
  id: A.details,
  label: 'Review policy details',
  requires: [A.source],
  handover: 'Confirm insurer, product, term, premium, cover, insured items, excesses, limits and effective dates against the schedule.',
})

const placement: RouteAction = {
  id: A.placement,
  label: 'Record insurer confirmation',
  kind: 'form',
  requires: [A.details],
  russ: 'person',
  handover: 'Attach evidence and record the insurer policy number and confirmed dates. Keep draft/pending until confirmation is recorded.',
  check: (_s, input) => formFieldsCheck(input, ['policy_number', 'confirmed_effective_at', 'confirmation_source']),
  apply: (_s, input) => ({
    patch: {
      policy_number: input.policy_number,
      confirmed_effective_at: input.confirmed_effective_at,
      confirmation_source: input.confirmation_source,
      placement_pending: false,
    },
    summary: `Policy ${input.policy_number} confirmed`,
    waiting_on: null,
  }),
}

const save: RouteAction = {
  id: A.save,
  label: 'Save confirmed policy',
  kind: 'run',
  requires: [A.placement],
  confirm: true,
  russ: 'person',
  handover: 'Save the confirmed policy linked to the client and file the schedule.',
  check: () => ({ status: 'ok' }),
  async effect({ state, key, port }) {
    const c = clientOf(state)!
    return asJson(
      await port.logNote({
        person_id: c.person_id,
        body: `Policy setup saved: ${state.policy_number} effective ${state.confirmed_effective_at}. Schedule filed.`,
        key,
      }),
    )
  },
  apply: (_s, _i, receipt) => ({
    patch: { policy_saved: true, save_ref: (receipt as { reference: string }).reference },
    summary: `Policy saved (${(receipt as { reference: string }).reference})`,
  }),
}

const handover: RouteAction = {
  id: A.handover,
  label: 'Prepare client handover',
  kind: 'run',
  requires: [A.save],
  russ: 'person',
  handover: 'Send via the existing approved flow or record that handover was completed elsewhere.',
  check: (_s, input) => formFieldsCheck(input, ['channel']),
  async effect({ state, input, key, port }) {
    const c = clientOf(state)!
    return asJson(
      await port.logNote({
        person_id: c.person_id,
        body: `Client handover for policy ${state.policy_number} via ${input.channel}. ${input.note ?? ''}`.trim(),
        key,
      }),
    )
  },
  apply: (_s, input, receipt) => ({
    patch: { handover_done: true, handover_channel: input.channel, handover_ref: (receipt as { reference: string }).reference },
    summary: 'Handover recorded',
  }),
}

export const POLICY_SETUP = registerRoute({
  id: 'policy_setup',
  title: 'Set up a policy',
  outcome: 'Confirmed policy linked to the client, schedule filed, and handover recorded.',
  subject: 'client',
  group: 'policies',
  eligible: ['client', 'quote', 'policy'],
  category: 'both',
  intents: ['set up a policy', 'setup a policy', 'set up policy', 'new policy', 'place a policy', 'policy setup'],
  selectActionId: A.select,
  version: '1',
  phases: [
    { id: 'policy_setup.source', title: 'Confirm client and source', complete: 'all', actions: [select, source] },
    { id: 'policy_setup.details', title: 'Review policy details', complete: 'all', actions: [details] },
    { id: 'policy_setup.placement', title: 'Confirm placement', complete: 'all', actions: [placement] },
    { id: 'policy_setup.file', title: 'File and hand over', complete: 'all', actions: [save, handover] },
  ],
})
