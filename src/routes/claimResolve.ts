import { businessKeyOf, registerRoute, type RouteAction } from './definitions'
import { asJson, clientOf, confirmAction, formFieldsCheck, needClient, selectClientAction } from './helpers'

export const A = {
  select: 'claim_resolve.client.select',
  outcome: 'claim_resolve.capture.outcome',
  settlement: 'claim_resolve.settlement.record',
  communicate: 'claim_resolve.settlement.communicate',
  close: 'claim_resolve.close.claim',
  keepOpen: 'claim_resolve.close.keep_open',
} as const

const select = selectClientAction({ id: A.select, invalidate: [A.outcome, A.settlement, A.communicate, A.close, A.keepOpen] })

const outcome: RouteAction = {
  id: A.outcome,
  label: 'Record decision',
  kind: 'form',
  requires: [A.select],
  russ: 'person',
  handover: 'Record settlement, partial settlement, rejection or withdrawal with decision date, reason and source.',
  check: (s, input) => needClient(s) ?? formFieldsCheck(input, ['claim_id', 'decision', 'decision_source', 'decision_date']),
  async effect({ input, key, port }) {
    if (!port.recordClaimDecision) throw new Error('Claim decision is not available.')
    return asJson(
      await port.recordClaimDecision({
        claim_id: input.claim_id as string,
        decision: input.decision as string,
        decision_source: input.decision_source as string,
        settlement_amount: typeof input.settlement_amount === 'number' ? input.settlement_amount : null,
        key,
      }),
    )
  },
  apply: (s, input, receipt) => ({
    patch: {
      claim_id: input.claim_id,
      claim_reference: input.claim_reference ?? null,
      decision: input.decision,
      decision_source: input.decision_source,
      decision_date: input.decision_date,
      settlement_amount: input.settlement_amount ?? null,
    },
    summary: (receipt as { summary: string }).summary,
    claim_id: input.claim_id as string,
    business_key: businessKeyOf('claim_resolve', { person_id: clientOf(s)?.person_id, claim_id: input.claim_id as string, intent: 'resolve' }),
  }),
}

const settlement: RouteAction = {
  id: A.settlement,
  label: 'Record settlement details',
  kind: 'form',
  requires: [A.outcome],
  russ: 'person',
  handover: 'Record amounts and payment or repair status supported by evidence where applicable.',
  check: (s) => {
    const d = s.decision as string
    if (d === 'rejection' || d === 'withdrawal') return { status: 'ok' }
    return { status: 'ok' }
  },
  apply: (_s, input) => ({
    patch: {
      settlement_status: input.settlement_status ?? null,
      payment_status: input.payment_status ?? null,
      repair_status: input.repair_status ?? null,
    },
    summary: 'Settlement details recorded',
  }),
}

const communicate: RouteAction = {
  id: A.communicate,
  label: 'Prepare client update',
  kind: 'run',
  requires: [A.settlement],
  russ: 'person',
  handover: 'Prepare the client update and record delivery or external communication.',
  check: (_s, input) => formFieldsCheck(input, ['channel']),
  async effect({ state, input, key, port }) {
    const c = clientOf(state)!
    return asJson(
      await port.logNote({
        person_id: c.person_id,
        body: `Claim ${state.claim_reference ?? state.claim_id} decision ${state.decision}: client update via ${input.channel}. ${input.note ?? ''}`.trim(),
        key,
      }),
    )
  },
  apply: (_s, input, receipt) => ({
    patch: { client_updated: true, update_channel: input.channel, update_ref: (receipt as { reference: string }).reference },
    summary: 'Client update recorded',
  }),
}

const close: RouteAction = {
  id: A.close,
  label: 'Close claim',
  kind: 'run',
  requires: [A.communicate],
  confirm: true,
  russ: 'person',
  handover: 'Close only when existing closure criteria are satisfied (outcome, evidence, client update; no blocking settlement work).',
  check: (s, input) => {
    if (s.payment_status === 'outstanding' || s.repair_status === 'outstanding') {
      return { status: 'blocked', reason: 'Unresolved settlement or repair work blocks closure. Keep the claim open.' }
    }
    if (input.confirmed !== true) return { status: 'needs_input', reason: 'Confirm closure criteria are met.' }
    return { status: 'ok' }
  },
  async effect({ state, key, port }) {
    if (!port.transitionClaim) throw new Error('Claim transition is not available.')
    return asJson(await port.transitionClaim({ claim_id: state.claim_id as string, to_status: 'closed', note: 'Closed after resolution route', key }))
  },
  apply: (_s, _i, receipt) => ({
    patch: { closed: true },
    summary: (receipt as { summary: string }).summary,
    waiting_on: null,
  }),
}

const keepOpen = confirmAction({
  id: A.keepOpen,
  label: 'Leave claim open',
  requires: [A.communicate],
  handover: 'Leave open where payment, repair, a review or another required action remains outstanding.',
  waiting_on: 'broker',
})

export const CLAIM_RESOLVE = registerRoute({
  id: 'claim_resolve',
  title: 'Resolve a claim',
  outcome: 'Outcome, evidence and client update recorded; claim closed when eligible, otherwise kept open.',
  subject: 'client',
  group: 'claims',
  eligible: ['client', 'claim'],
  category: 'both',
  intents: ['resolve a claim', 'resolve claim', 'close a claim', 'claim decision', 'claim settlement'],
  selectActionId: A.select,
  version: '1',
  phases: [
    { id: 'claim_resolve.capture', title: 'Capture the outcome', complete: 'all', actions: [select, outcome] },
    { id: 'claim_resolve.settlement', title: 'Record settlement and communicate', complete: 'all', actions: [settlement, communicate] },
    { id: 'claim_resolve.close', title: 'Close or keep open', complete: 'any', actions: [close, keepOpen] },
  ],
})
