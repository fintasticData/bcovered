import type { ActionInput, Check, ClientSnapshot, RouteAction, RouteState } from './definitions'
import type { Json } from '@/server/db/schema'

export const asJson = (v: unknown) => v as Json

export const clientOf = (s: RouteState) => (s.client ?? null) as ClientSnapshot | null

export function selectClientAction(opts: {
  id: string
  label?: string
  invalidate?: string[]
  sampleOnly?: boolean
}): RouteAction {
  const invalidate = opts.invalidate ?? []
  return {
    id: opts.id,
    label: opts.label ?? 'Select client',
    kind: 'select',
    requires: [],
    russ: 'auto',
    handover: 'Choose the client this work is for, then continue.',
    invalidates: invalidate.length ? { actions: invalidate, reason: 'The client changed: review the details again' } : undefined,
    check: (_s, input) => (typeof input.person_id === 'string' && input.person_id ? { status: 'ok' } : { status: 'needs_input', reason: 'Choose a client.' }),
    async effect({ input, port }) {
      const c = await port.clientRecord(input.person_id as string)
      if (opts.sampleOnly && c.category !== 'sample') throw new Error('This Route runs on Sample clients only.')
      return asJson(c)
    },
    apply(s, _input, receipt) {
      const c = receipt as ClientSnapshot
      const prev = clientOf(s)
      const changed = prev?.person_id !== c.person_id
      return {
        patch: { client: asJson(c) },
        summary: `${c.name} (${c.client_number})`,
        subject: { id: c.person_id, label: `${c.name} (${c.client_number})` },
        changed,
      }
    },
  }
}

export function confirmAction(opts: {
  id: string
  label: string
  requires: string[]
  handover: string
  summary?: string
  waiting_on?: string | null
}): RouteAction {
  return {
    id: opts.id,
    label: opts.label,
    kind: 'review',
    requires: opts.requires,
    confirm: true,
    russ: 'person',
    handover: opts.handover,
    check: () => ({ status: 'ok' }),
    apply: () => ({
      patch: {},
      summary: opts.summary ?? opts.label,
      waiting_on: opts.waiting_on ?? null,
    }),
  }
}

export function formFieldsCheck(input: ActionInput, required: string[]): Check {
  const fields: Record<string, string> = {}
  for (const f of required) {
    const v = input[f]
    if (v == null || (typeof v === 'string' && !v.trim())) fields[f] = `${f.replace(/_/g, ' ')} is required.`
  }
  return Object.keys(fields).length ? { status: 'needs_input', reason: 'Complete the required fields.', fields } : { status: 'ok' }
}

export function needClient(s: RouteState): Check | null {
  return clientOf(s) ? null : { status: 'blocked', reason: 'Select a client first.' }
}
