import { businessKeyOf, registerRoute, type RouteAction } from './definitions'
import { asJson, clientOf, confirmAction, formFieldsCheck, needClient, selectClientAction } from './helpers'
import type { Json } from '@/server/db/schema'

export const A = {
  select: 'policy_renew.client.select',
  review: 'policy_renew.review.cover',
  attach: 'policy_renew.compare.attach',
  compare: 'policy_renew.compare.terms',
  decision: 'policy_renew.decision.record',
  confirm: 'policy_renew.outcome.confirm',
  nonRenew: 'policy_renew.outcome.non_renew',
} as const

const select = selectClientAction({ id: A.select, invalidate: [A.review, A.attach, A.compare, A.decision, A.confirm, A.nonRenew] })

const review: RouteAction = {
  id: A.review,
  label: 'Review policy and changes',
  kind: 'form',
  requires: [A.select],
  russ: 'person',
  handover: 'Bring forward insured items, current terms, renewal date and relevant claims history.',
  check: (s, input) => needClient(s) ?? formFieldsCheck(input, ['policy_id', 'renewal_date']),
  async effect({ state, input, key, port }) {
    if (!port.createRenewal) throw new Error('Renewal create is not available.')
    const c = clientOf(state)!
    const r = await port.createRenewal({
      person_id: c.person_id,
      policy_id: input.policy_id as string,
      requested_effective_at: input.renewal_date as string,
      change: { notes: input.notes ?? null } as Json,
      notes: (input.notes as string) || null,
      key,
    })
    return asJson({ ...r, policy_id: input.policy_id, renewal_date: input.renewal_date })
  },
  apply: (s, input, receipt) => {
    const r = receipt as { id: string; reference: string; policy_id: string }
    return {
      patch: { request_id: r.id, request_reference: r.reference, policy_id: r.policy_id, renewal_date: input.renewal_date },
      summary: `Renewal ${r.reference}`,
      policy_id: r.policy_id,
      business_key: businessKeyOf('policy_renew', {
        person_id: clientOf(s)?.person_id,
        policy_id: r.policy_id,
        intent: `renewal:${input.renewal_date}`,
      }),
    }
  },
}

const attach: RouteAction = {
  id: A.attach,
  label: 'Attach renewal terms',
  kind: 'form',
  requires: [A.review],
  russ: 'person',
  handover: 'Attach the insurer renewal terms for comparison.',
  check: () => ({ status: 'ok' }),
  apply: (_s, input) => ({ patch: { terms_attached: true, terms_note: input.notes ?? null }, summary: 'Renewal terms attached' }),
}

const compare = confirmAction({
  id: A.compare,
  label: 'Compare terms',
  requires: [A.attach],
  handover: 'Highlight premium, limits, excesses, exclusions and date changes where the source supports them.',
})

const decision: RouteAction = {
  id: A.decision,
  label: 'Record decision and evidence',
  kind: 'form',
  requires: [A.compare],
  russ: 'person',
  handover: 'Record the client decision. Where a response is outstanding, set the follow-up owner and due date.',
  check: (_s, input) => formFieldsCheck(input, ['decision']),
  apply: (_s, input) => ({
    patch: { client_decision: input.decision, decision_evidence: input.evidence ?? null },
    summary: `Client decision: ${input.decision}`,
    waiting_on: input.decision === 'pending' ? 'client' : null,
    due_at: (input.due_at as string) || null,
  }),
}

const confirm: RouteAction = {
  id: A.confirm,
  label: 'Confirm renewal',
  kind: 'run',
  requires: [A.decision],
  confirm: true,
  russ: 'person',
  handover: 'Confirm renewal once insurer confirmation exists. Client acceptance alone does not confirm the insurer’s renewal.',
  check: (s, input) => {
    if (s.client_decision === 'pending') return { status: 'blocked', reason: 'Client decision is still outstanding.' }
    return formFieldsCheck(input, ['confirmation_source', 'confirmed_effective_at'])
  },
  async effect({ state, input, key, port }) {
    if (!port.transitionServiceRequest) throw new Error('Service request transition is not available.')
    await port.transitionServiceRequest({
      request_id: state.request_id as string,
      to_status: 'awaiting_confirmation',
      note: `Insurer confirmation via ${input.confirmation_source}`,
      key: `${key}:await`,
    })
    return asJson(
      await port.transitionServiceRequest({
        request_id: state.request_id as string,
        to_status: 'confirmed',
        note: `Renewal confirmed from ${input.confirmation_source} effective ${input.confirmed_effective_at}`,
        key: `${key}:confirm`,
      }),
    )
  },
  apply: (_s, input, receipt) => ({
    patch: { renewed: true, confirmed_effective_at: input.confirmed_effective_at },
    summary: (receipt as { summary: string }).summary,
    waiting_on: null,
  }),
}

const nonRenew: RouteAction = {
  id: A.nonRenew,
  label: 'Record non-renewal',
  kind: 'decision',
  requires: [A.decision],
  russ: 'person',
  handover: 'Record non-renewal with reason and evidence, then prepare or log the client update.',
  check: (_s, input) => formFieldsCheck(input, ['reason']),
  async effect({ state, input, key, port }) {
    if (!port.transitionServiceRequest) throw new Error('Service request transition is not available.')
    return asJson(
      await port.transitionServiceRequest({
        request_id: state.request_id as string,
        to_status: 'withdrawn',
        note: `Non-renewal: ${input.reason}`,
        key,
      }),
    )
  },
  apply: (_s, input) => ({
    patch: { non_renewed: true, non_renew_reason: input.reason },
    summary: 'Non-renewal recorded',
    waiting_on: null,
  }),
}

export const POLICY_RENEW = registerRoute({
  id: 'policy_renew',
  title: 'Renew a policy',
  outcome: 'Next term and schedule linked, or non-renewal outcome recorded.',
  subject: 'client',
  group: 'policies',
  eligible: ['client', 'policy'],
  category: 'both',
  intents: ['renew a policy', 'renew policy', 'policy renewal', 'renewal'],
  selectActionId: A.select,
  version: '1',
  phases: [
    { id: 'policy_renew.review', title: 'Review expiring cover', complete: 'all', actions: [select, review] },
    { id: 'policy_renew.compare', title: 'Compare terms', complete: 'all', actions: [attach, compare] },
    { id: 'policy_renew.decision', title: 'Record client decision', complete: 'all', actions: [decision] },
    { id: 'policy_renew.outcome', title: 'Record outcome', complete: 'any', actions: [confirm, nonRenew] },
  ],
})
