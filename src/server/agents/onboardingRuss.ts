// Russ in the onboarding side panel. Deterministic: answers from the caller's own brokerage records only (through the
// principal's tenant repository), offers actions the caller's role permits, and never reads or repeats credentials.
import { principal, type Auth } from '../api'
import { can, MODULE_LABEL, ROLE_LABEL, SECTIONS } from '../onboarding/config'
import { currentApplication, EDITABLE, readiness, type ChecklistEntry } from '../onboarding/domain'
import { ToolError } from '../lib/errors'

export interface RussAction {
  key: 'continue' | 'upload' | 'invite' | 'import' | 'feedback' | 'submit'
  label: string
  to: string
  enabled: boolean
  reason: string | null
}

export interface RussTask {
  key: string
  label: string
  detail: string
  to: string
  tone: 'info' | 'warning' | 'success'
}

export interface RussReply {
  reply: string
  actions: RussAction[]
  suggestions: string[]
}

export const RUSS_SUGGESTIONS = [
  'What do I still need to provide?',
  'Which documents are required?',
  'What did the reviewer ask for?',
  'How do I import my client book?',
  'Am I ready to submit?',
]

function context(auth: Auth) {
  const p = principal(auth)
  if (!p.membership || !p.organisation) throw new ToolError('forbidden', 'Open a brokerage workspace first.')
  const app = currentApplication(p.repo)
  if (!app) throw new ToolError('not_found', 'There is no onboarding application for this brokerage.')
  return { p, repo: p.repo, role: p.membership.role, org: p.organisation, app, r: readiness(p.repo, app) }
}

const sectionPath = (c: ChecklistEntry) => `/onboarding/${c.section}`

export function russPanel(auth: Auth): { actions: RussAction[]; tasks: RussTask[] } {
  const { repo, role, org, app, r } = context(auth)
  const editable = EDITABLE.includes(app.status)
  const firstOpen = r.attention[0] ?? r.outstanding[0]
  const docsMissing = r.outstanding.filter((c) => c.kind === 'document')
  const reps = repo.list('organisation_memberships', (m) => m.status === 'active' && m.role === 'representative').length
  const active = org.lifecycle_status === 'active'
  const unresolved = repo.list('onboarding_feedback', (f) => f.application_id === app.id && !f.resolved_at).length
  const actions: RussAction[] = [
    { key: 'continue', label: 'Continue setup', to: firstOpen ? sectionPath(firstOpen) : `/onboarding/${app.current_section ?? 'organisation'}`, enabled: true, reason: null },
    {
      key: 'upload',
      label: 'Upload missing documents',
      to: '/onboarding/documents',
      enabled: editable && can(role, 'upload_documents') && docsMissing.length > 0,
      reason: !can(role, 'upload_documents') ? `${ROLE_LABEL[role]}s cannot upload` : !docsMissing.length ? 'No documents are missing' : !editable ? 'The application is with B-Covered' : null,
    },
    { key: 'invite', label: 'Invite my team', to: '/onboarding/team', enabled: can(role, 'manage_team'), reason: can(role, 'manage_team') ? null : `${ROLE_LABEL[role]}s cannot invite` },
    {
      key: 'import',
      label: 'Import my client book',
      to: active ? '/broker/imports/client-book' : '/onboarding/migration',
      enabled: can(role, 'import_clients'),
      reason: can(role, 'import_clients') ? (active ? null : 'Plan it under Migration now; records are imported after activation') : `${ROLE_LABEL[role]}s cannot import`,
    },
    { key: 'feedback', label: 'Resolve review feedback', to: '/onboarding/readiness', enabled: r.attention.length > 0 || unresolved > 0, reason: r.attention.length || unresolved ? null : 'No feedback to resolve' },
    {
      key: 'submit',
      label: app.status === 'information_required' ? 'Resubmit for approval' : 'Submit for approval',
      to: '/onboarding/readiness',
      enabled: can(role, 'submit') && r.can_submit,
      reason: !can(role, 'submit') ? `${ROLE_LABEL[role]}s cannot submit` : r.can_submit ? null : (r.blockers[0] ?? null),
    },
  ]
  const tasks: RussTask[] = [
    ...r.attention.map((c) => ({ key: c.item_id, label: c.label, detail: 'The reviewer asked for a correction', to: sectionPath(c), tone: 'warning' as const })),
    ...r.outstanding.map((c) => ({ key: c.item_id, label: c.label, detail: c.guidance ?? `Outstanding in ${SECTIONS.find((s) => s.key === c.section)?.label}`, to: sectionPath(c), tone: 'info' as const })),
  ]
  if (!reps && can(role, 'manage_team') && app.brokerage_type !== 'sole_proprietor') tasks.push({ key: 'team', label: 'Invite a representative', detail: 'At least one representative is needed', to: '/onboarding/team', tone: 'info' })
  if (!tasks.length) tasks.push({ key: 'done', label: editable ? 'Everything required is in place' : `Application ${app.status.replace(/_/g, ' ')}`, detail: editable ? 'Submit for approval from Readiness' : 'B-Covered will be in touch', to: '/onboarding/readiness', tone: 'success' })
  return { actions, tasks }
}

const list = (items: string[]) => items.map((i) => `• ${i}`).join('\n')

export function russOnboardingTurn(auth: Auth, body: { message: string }): RussReply {
  const text = body.message.trim().toLowerCase()
  if (!text) throw new ToolError('validation', 'Ask Russ something.')
  const { repo, role, org, app, r } = context(auth)
  const { actions } = russPanel(auth)
  const pick = (...keys: RussAction['key'][]) => actions.filter((a) => keys.includes(a.key))
  const readOnly = role === 'read_only' || role === 'compliance_reviewer'
  const note = readOnly ? '\n\nYou have read-only access, so I can explain but not change anything for you.' : ''

  if (/credential|password|api key|secret|token/.test(text)) {
    return {
      reply: 'I never see or repeat insurer credentials. They are stored server-side and shown only as a masked hint. Add or rotate them on the Insurer access screen.',
      actions: [],
      suggestions: RUSS_SUGGESTIONS,
    }
  }

  if (/feedback|review|correct|reject|asked/.test(text)) {
    const feedback = repo.list('onboarding_feedback', (f) => f.application_id === app.id && !f.resolved_at)
    if (!feedback.length && !r.attention.length) return { reply: `There is no open reviewer feedback. The application is ${app.status.replace(/_/g, ' ')}.${note}`, actions: pick('continue'), suggestions: RUSS_SUGGESTIONS }
    return {
      reply: `The reviewer asked for:\n${list([...r.attention.map((c) => `${c.label} (${c.status.replace(/_/g, ' ')})`), ...feedback.map((f) => f.body)])}\n\nFix each item, then resubmit from Readiness.${note}`,
      actions: pick('feedback', 'submit'),
      suggestions: RUSS_SUGGESTIONS,
    }
  }

  if (/document|upload|certificate|licence|license/.test(text)) {
    const docs = r.checklist.filter((c) => c.kind === 'document')
    return {
      reply: `Documents for a ${app.brokerage_type?.replace(/_/g, ' ') ?? 'brokerage'}${app.declared_modules.length ? ` using ${app.declared_modules.map((m) => MODULE_LABEL[m]).join(', ')}` : ''}:\n${list(docs.map((d) => `${d.label}${d.required ? '' : ' (optional)'}: ${d.status.replace(/_/g, ' ')}`))}\n\nWhen you upload a text document I read labelled lines such as “Registration number:” and suggest values. You confirm each one before it changes your draft. B-Covered reviews every document; platform approval is not regulatory authorisation.${note}`,
      actions: pick('upload'),
      suggestions: RUSS_SUGGESTIONS,
    }
  }

  if (/import|client book|migrat|clients|spreadsheet|csv|excel/.test(text)) {
    const active = org.lifecycle_status === 'active'
    return {
      reply: `Client-book import runs in six steps: upload a CSV or XLSX, map columns, validate, review possible duplicates inside your brokerage, confirm you may transfer the data, then import. Failed rows can be corrected and retried without duplicating the ones already in. ${active ? 'Download the templates from the import screen.' : ' Your brokerage is not active yet: choose “Import my existing client book” under Migration and download the templates there. The import itself opens in your workspace after activation.'}${note}`,
      actions: pick('import'),
      suggestions: RUSS_SUGGESTIONS,
    }
  }

  if (/team|invite|representative|colleague|staff/.test(text)) {
    const members = repo.list('organisation_memberships', (m) => m.status === 'active')
    const pending = repo.list('brokerage_invitations', (i) => !i.accepted_at && !i.revoked_at && i.expires_at > new Date().toISOString())
    return {
      reply: `Your team has ${members.length} active member(s)${pending.length ? ` and ${pending.length} pending invitation(s)` : ''}:\n${list(members.map((m) => ROLE_LABEL[m.role]))}\n\nInvitations expire after 7 days and work once.${note}`,
      actions: pick('invite'),
      suggestions: RUSS_SUGGESTIONS,
    }
  }

  if (/insurer|quote|quotation|intermediary/.test(text)) {
    const access = repo.list('insurer_access')
    const names = new Map(repo.list('insurers').map((i) => [i.id, i.name]))
    return {
      reply: access.length
        ? `Insurer access is set up per insurer and product, separately from joining the platform:\n${list(access.map((a) => `${names.get(a.insurer_id)} · ${MODULE_LABEL[a.product_module]}: ${a.status.replace(/_/g, ' ')}`))}\n\nQuoting with an insurer only works once its access is enabled after activation.${note}`
        : `You have not recorded any insurer relationships yet. Add them under Insurer access; each insurer is enabled separately after activation.${note}`,
      actions: pick('continue'),
      suggestions: RUSS_SUGGESTIONS,
    }
  }

  if (/submit|ready|approval|approve|activate/.test(text)) {
    return {
      reply: r.can_submit
        ? `Everything required is in place (${r.required_done} of ${r.required_total}). Submit for approval from Readiness. Approval and activation are separate B-Covered decisions, and approval is not regulatory authorisation.${note}`
        : `Not yet. Before you can submit:\n${list(r.blockers.slice(0, 8))}${r.blockers.length > 8 ? `\n…and ${r.blockers.length - 8} more` : ''}${note}`,
      actions: pick('submit', 'continue'),
      suggestions: RUSS_SUGGESTIONS,
    }
  }

  if (/need|missing|outstanding|left|remaining|requirement|checklist|what/.test(text)) {
    const open = [...r.attention, ...r.outstanding]
    return {
      reply: open.length
        ? `${r.required_done} of ${r.required_total} required items are done. Still to do:\n${list(open.slice(0, 10).map((c) => `${c.label}${c.guidance ? `: ${c.guidance}` : ''}`))}${open.length > 10 ? `\n…and ${open.length - 10} more` : ''}${note}`
        : `All required items are done. ${EDITABLE.includes(app.status) ? 'You can submit for approval.' : `The application is ${app.status.replace(/_/g, ' ')}.`}${note}`,
      actions: pick('continue', 'upload', 'submit'),
      suggestions: RUSS_SUGGESTIONS,
    }
  }

  return {
    reply: `I’m Russ. I can explain what ${org.name} still needs, which documents apply to you, what the reviewer asked for, how to invite your team or import your client book, and whether you are ready to submit. I only see this brokerage’s onboarding records.${note}`,
    actions: pick('continue'),
    suggestions: RUSS_SUGGESTIONS,
  }
}
