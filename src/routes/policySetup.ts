import { businessKeyOf, registerRoute, type RouteAction } from './definitions'
import { asJson, clientOf, formFieldsCheck, needClient, selectClientAction } from './helpers'

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
  apply: (s, input) => {
    const quoteId = typeof input.quote_id === 'string' ? input.quote_id : null
    const offerId =
      input.source_type === 'accepted_quote'
        ? (typeof input.offer_id === 'string' && input.offer_id ? input.offer_id : quoteId)
        : typeof input.offer_id === 'string'
          ? input.offer_id
          : null
    return {
      patch: {
        source_type: input.source_type,
        quote_id: quoteId,
        offer_id: offerId,
        schedule_note: input.schedule_note ?? null,
        policy_number: input.policy_number ?? null,
        ...(typeof input.insurer_name === 'string' && input.insurer_name ? { insurer_name: input.insurer_name } : {}),
        ...(typeof input.cover_type === 'string' && input.cover_type ? { cover_type: input.cover_type } : {}),
        ...(input.premium_amount != null && input.premium_amount !== '' ? { premium_amount: input.premium_amount } : {}),
        ...(typeof input.item_label === 'string' && input.item_label ? { item_label: input.item_label } : {}),
        ...(typeof input.item_type === 'string' && input.item_type ? { item_type: input.item_type } : {}),
      },
      summary: `Source: ${input.source_type}`,
      business_key: businessKeyOf('policy_setup', {
        person_id: clientOf(s)?.person_id,
        intent: 'setup',
        draft_id: (typeof input.draft_id === 'string' && input.draft_id) || offerId || undefined,
      }),
    }
  },
}

const details: RouteAction = {
  id: A.details,
  label: 'Capture cover details',
  kind: 'form',
  requires: [A.source],
  russ: 'person',
  handover: 'Capture insurer, cover type, premium, excess and the main insured item from the schedule or accepted quote.',
  check: (_s, input) => formFieldsCheck(input, ['insurer_name', 'cover_type', 'item_label']),
  apply: (_s, input) => ({
    patch: {
      insurer_name: input.insurer_name,
      cover_type: input.cover_type,
      premium_amount: input.premium_amount ?? null,
      excess: input.excess ?? null,
      item_label: input.item_label,
      item_type: input.item_type ?? null,
    },
    summary: `${input.insurer_name} · ${input.cover_type} · ${input.item_label}`,
  }),
}

const placement: RouteAction = {
  id: A.placement,
  label: 'Record insurer confirmation',
  kind: 'form',
  requires: [A.details],
  russ: 'person',
  handover: 'Attach evidence and record the insurer policy number and confirmed dates. Keep draft/pending until confirmation is recorded.',
  check: (_s, input) => formFieldsCheck(input, ['policy_number', 'confirmed_effective_at', 'confirmation_source']),
  apply: (s, input) => ({
    patch: {
      policy_number: input.policy_number,
      confirmed_effective_at: input.confirmed_effective_at,
      confirmation_source: input.confirmation_source,
      insurer_reference: input.insurer_reference ?? null,
      placement_pending: false,
    },
    summary: `Policy ${input.policy_number} confirmed`,
    waiting_on: null,
    business_key: businessKeyOf('policy_setup', {
      person_id: clientOf(s)?.person_id,
      intent: 'setup',
      draft_id: String(input.policy_number ?? s.policy_number ?? ''),
    }),
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
    if (!port.filePolicy) throw new Error('Policy filing is not available.')
    const c = clientOf(state)!
    const premiumRaw = state.premium_amount
    const excessRaw = state.excess
    const premium =
      typeof premiumRaw === 'number'
        ? premiumRaw
        : typeof premiumRaw === 'string' && premiumRaw.trim()
          ? Number(premiumRaw)
          : null
    const excess =
      typeof excessRaw === 'number'
        ? excessRaw
        : typeof excessRaw === 'string' && excessRaw.trim()
          ? Number(excessRaw)
          : null
    const offerId = state.offer_id ? String(state.offer_id) : state.quote_id ? String(state.quote_id) : null
    const filed = await port.filePolicy({
      person_id: c.person_id,
      policy_number: String(state.policy_number ?? ''),
      confirmed_effective_at: String(state.confirmed_effective_at ?? ''),
      confirmation_source: String(state.confirmation_source ?? 'insurer_email'),
      quote_id: state.quote_id ? String(state.quote_id) : offerId,
      source_type: state.source_type ? String(state.source_type) : null,
      schedule_note: state.schedule_note ? String(state.schedule_note) : null,
      insurer_reference: state.insurer_reference ? String(state.insurer_reference) : null,
      insurer_name: state.insurer_name ? String(state.insurer_name) : null,
      provider_id: state.provider_id ? String(state.provider_id) : null,
      cover_type: state.cover_type ? String(state.cover_type) : null,
      premium_amount: Number.isFinite(premium as number) ? (premium as number) : null,
      excess: Number.isFinite(excess as number) ? (excess as number) : null,
      item_label: state.item_label ? String(state.item_label) : null,
      item_type: state.item_type ? String(state.item_type) : null,
      key,
    })
    let syncSummary: string | null = null
    if (port.syncCoverConfirmation) {
      const sync = await port.syncCoverConfirmation({
        person_id: c.person_id,
        policy_id: filed.id,
        offer_id: offerId,
        insurer_reference: state.insurer_reference
          ? String(state.insurer_reference)
          : filed.policy_number
            ? String(filed.policy_number)
            : String(state.policy_number ?? ''),
        cover_start_date: state.confirmed_effective_at
          ? String(state.confirmed_effective_at).slice(0, 10)
          : null,
        key: `${key}:sync`,
      })
      syncSummary = sync.summary ?? null
    }
    const note = await port.logNote({
      person_id: c.person_id,
      body: `Policy setup saved: ${filed.policy_number ?? state.policy_number} effective ${state.confirmed_effective_at}. Schedule filed.${syncSummary ? ` ${syncSummary}` : ''}`,
      key: `${key}:note`,
    })
    return asJson({
      id: filed.id,
      reference: note.reference,
      policy_reference: filed.reference,
      policy_number: filed.policy_number ?? state.policy_number,
      policy_id: filed.id,
      sync_summary: syncSummary,
    })
  },
  apply: (_s, _i, receipt) => {
    const r = receipt as {
      id: string
      reference: string
      policy_id: string
      policy_reference?: string
      policy_number?: string
      sync_summary?: string | null
    }
    return {
      patch: {
        policy_saved: true,
        save_ref: r.reference,
        policy_id: r.policy_id,
        policy_reference: r.policy_reference ?? null,
        cover_confirmed: true,
      },
      summary: r.sync_summary
        ? `Cover confirmed · ${r.policy_number ?? r.policy_reference ?? r.reference}`
        : `Policy saved (${r.policy_number ?? r.policy_reference ?? r.reference})`,
      policy_id: r.policy_id,
    }
  },
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
