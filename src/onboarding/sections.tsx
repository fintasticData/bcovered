import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Copy, Download, ExternalLink, FileUp, FlaskConical, Mail, Send, Trash2 } from 'lucide-react'
import type { CreatedInvitation, OnboardingView } from '@/api/client'
import { api } from '@/api/client'
import {
  useAgreeTerms,
  useDeclareInsurer,
  useInsurerAccess,
  useInviteMember,
  useRemoveMember,
  useRevokeInvitation,
  useSampleDocument,
  useSaveSection,
  useSubmitApplication,
  useUploadDocument,
} from '@/api/hooks'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn, formatDateTime } from '@/lib/utils'
import type { MemberRole, OnboardingSection, ProductModule, SectionValues } from '@/server/db/onboardingSchema'
import { MODULE_LABEL, PACKAGES, PRODUCT_MODULES, ROLE_LABEL, SECTION_FIELDS, SECTIONS } from '@/server/onboarding/config'
import { FieldInput, NotAuthorisation, downloadText, fileToBase64, openBase64, textInput } from './ui'

export type SaveState = { status: 'idle' | 'saving' | 'saved' | 'error'; at?: string; message?: string }

const editableStatus = (v: OnboardingView) => ['draft', 'information_required'].includes(v.application.status)

function useAutosave(section: OnboardingSection, onState: (s: SaveState) => void) {
  const save = useSaveSection()
  const timer = useRef<number | undefined>(undefined)
  const pending = useRef<SectionValues>({})
  const flush = () => {
    const values = pending.current
    pending.current = {}
    if (!Object.keys(values).length) return
    onState({ status: 'saving' })
    save.mutate(
      { section, values },
      {
        onSuccess: (r) => onState({ status: 'saved', at: r.saved_at }),
        onError: (e) => onState({ status: 'error', message: e.message }),
      },
    )
  }
  // Leaving a section flushes pending typing instead of dropping it.
  useEffect(
    () => () => {
      window.clearTimeout(timer.current)
      flush()
    },
    [section],
  )
  return (key: string, value: SectionValues[string]) => {
    pending.current = { ...pending.current, [key]: value }
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(flush, 700)
  }
}

export function FieldsSection({ view, section, highlight, onSave }: { view: OnboardingView; section: OnboardingSection; highlight: string | null; onSave: (s: SaveState) => void }) {
  const defs = SECTION_FIELDS[section] ?? []
  const saved = view.application.sections[section] ?? {}
  const [values, setValues] = useState<SectionValues>(saved)
  const queue = useAutosave(section, onSave)
  const capability = section === 'migration' ? 'import_clients' : 'edit_setup'
  const disabled = !editableStatus(view) || !view.capabilities.includes(capability)
  const errors = view.field_errors[section] ?? {}

  useEffect(() => setValues(view.application.sections[section] ?? {}), [section, view.application.id])
  // A value applied from a Russ suggestion arrives from the server; show it in the highlighted field.
  const highlighted = highlight?.startsWith(`${section}.`) ? highlight.split('.')[1] : null
  const serverValue = highlighted ? view.application.sections[section]?.[highlighted] : undefined
  useEffect(() => {
    if (!highlighted) return
    setValues((v) => ({ ...v, [highlighted]: serverValue ?? null }))
    const el = document.getElementById(`f-${section}-${highlighted}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el?.focus()
  }, [highlighted, serverValue, section])

  const change = (key: string, value: SectionValues[string]) => {
    setValues((v) => ({ ...v, [key]: value }))
    queue(key, value)
  }

  return (
    <div className="space-y-1">
      {section === 'products' && (
        <ul className="mb-3 grid gap-2 sm:grid-cols-2">
          {PRODUCT_MODULES.map((m) => (
            <li key={m.value} className="rounded-xl border border-navy-800/10 bg-mist/60 p-3 text-xs">
              <span className="font-semibold text-navy-900">{m.label}</span>
              <span className="block text-navy-600">{m.description}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-1 md:grid-cols-2">
        {defs.map((def) => (
          <div key={def.key} className={cn((def.type === 'textarea' || def.type === 'multi' || def.type === 'checkbox') && 'md:col-span-2')}>
            <FieldInput
              def={def}
              idPrefix={`f-${section}`}
              value={values[def.key] as never}
              onChange={(v) => change(def.key, v)}
              disabled={disabled}
              error={errors[def.key] && (values[def.key] !== undefined || view.application.submitted_at) ? errors[def.key] : undefined}
              highlight={highlight === `${section}.${def.key}`}
            />
          </div>
        ))}
      </div>
      {section === 'profile' && <NotAuthorisation className="mt-3" />}
      {section === 'migration' && <MigrationHelp view={view} />}
    </div>
  )
}

function MigrationHelp({ view }: { view: OnboardingView }) {
  const download = async (dataset: 'client_book_clients' | 'client_book_policies') => {
    const t = await api.clientBook.template(dataset)
    downloadText(t.file_name, t.csv)
  }
  const active = view.organisation.lifecycle_status === 'active'
  return (
    <div className="mt-4 rounded-xl border border-navy-800/10 bg-mist/60 p-4 text-sm text-navy-800">
      <p className="font-semibold">Client-book import</p>
      <p className="mt-1 text-xs text-navy-600">
        Upload CSV or XLSX, map columns, validate, review possible duplicates inside your brokerage, confirm you may transfer the information, then import. Failed rows can be corrected and retried without duplicating
        successful ones. Records from other brokerages are never matched or merged.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => void download('client_book_clients')}>
          <Download /> Clients template
        </Button>
        <Button size="sm" variant="outline" onClick={() => void download('client_book_policies')}>
          <Download /> Policies template
        </Button>
        {active && (
          <Button size="sm" variant="accent" asChild>
            <Link to="/broker/imports/client-book">Open client-book import</Link>
          </Button>
        )}
      </div>
      {!active && <p className="mt-2 text-[11px] text-navy-500">Imports open in your workspace after activation.</p>}
    </div>
  )
}

export function TeamSection({ view }: { view: OnboardingView }) {
  const invite = useInviteMember()
  const revoke = useRevokeInvitation()
  const remove = useRemoveMember()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<MemberRole>('representative')
  const [created, setCreated] = useState<CreatedInvitation | null>(null)
  const canManage = view.capabilities.includes('manage_team')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    invite.mutate({ email, role }, { onSuccess: (c) => { setCreated(c); setEmail('') } })
  }
  return (
    <div className="space-y-5">
      <ul className="divide-y divide-navy-800/5 rounded-xl border border-navy-800/10">
        {view.team.members.map((m) => (
          <li key={m.membership_id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
            <span className="min-w-0">
              <span className="block text-sm font-medium text-navy-900">
                {m.full_name} {m.is_you && <span className="text-xs text-navy-500">(you)</span>}
              </span>
              <span className="block text-xs text-navy-600">{m.email}</span>
            </span>
            <span className="flex items-center gap-2">
              <Badge tone="accent">{m.role_label}</Badge>
              {canManage && !m.is_you && m.role !== 'brokerage_owner' && (
                <Button size="icon" variant="ghost" aria-label={`Remove ${m.full_name}`} onClick={() => remove.mutate(m.membership_id)}>
                  <Trash2 />
                </Button>
              )}
            </span>
          </li>
        ))}
      </ul>
      {canManage ? (
        <form onSubmit={submit} className="grid gap-2 rounded-xl border border-navy-800/10 bg-mist/60 p-3 sm:grid-cols-[1fr_auto_auto]">
          <label className="sr-only" htmlFor="invite-email">Email</label>
          <input id="invite-email" type="email" className={textInput} placeholder="colleague@yourbrokerage.co.za" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <label className="sr-only" htmlFor="invite-role">Role</label>
          <select id="invite-role" className={textInput} value={role} onChange={(e) => setRole(e.target.value as MemberRole)}>
            {(Object.keys(ROLE_LABEL) as MemberRole[])
              .filter((r) => r !== 'brokerage_owner' || view.member_role === 'brokerage_owner')
              .map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
          </select>
          <Button type="submit" variant="accent" disabled={invite.isPending}>
            <Mail /> Invite
          </Button>
          {invite.error && <p className="text-xs text-red-600 sm:col-span-3">{invite.error.message}</p>}
        </form>
      ) : (
        <p className="text-xs text-navy-600">Only owners and administrators can invite or remove people.</p>
      )}
      {created && <InvitationCreated created={created} />}
      {view.team.invitations.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-navy-500 uppercase">Invitations</h3>
          <ul className="space-y-1.5">
            {view.team.invitations.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 text-xs text-navy-700">
                <span>
                  {i.email} · {i.role_label} · expires {formatDateTime(i.expires_at)}
                </span>
                <span className="flex items-center gap-2">
                  <StatusBadge status={i.state} />
                  {canManage && i.state === 'valid' && i.kind === 'team' && (
                    <button type="button" className="cursor-pointer text-xs font-semibold text-red-600 underline" onClick={() => revoke.mutate(i.id)}>
                      Revoke
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export function InvitationCreated({ created }: { created: CreatedInvitation }) {
  const url = `${window.location.origin}${created.link}`
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900" role="status">
      <p className="font-semibold">Invitation created for {created.email_preview.to}</p>
      <p className="mt-1">Demo mode sends no email. Share this single-use link; it is shown only once:</p>
      <div className="mt-2 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded bg-white px-2 py-1 text-[11px]">{url}</code>
        <Button size="sm" variant="outline" onClick={() => void navigator.clipboard?.writeText(url)}>
          <Copy /> Copy
        </Button>
      </div>
      <p className="mt-2 text-emerald-800">
        <strong>Email preview:</strong> {created.email_preview.subject}. {created.email_preview.body}
      </p>
    </div>
  )
}

export function InsurerSection({ view }: { view: OnboardingView }) {
  const { data } = useInsurerAccess()
  const declare = useDeclareInsurer()
  const [insurerId, setInsurerId] = useState('')
  const [module, setModule] = useState<ProductModule | ''>('')
  const [code, setCode] = useState('')
  const [note, setNote] = useState('')
  const canManage = view.capabilities.includes('manage_insurers')
  const modules = view.application.declared_modules
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!module) return
    declare.mutate({ insurer_id: insurerId, product_module: module, intermediary_code: code, mandate_note: note }, { onSuccess: () => { setCode(''); setNote('') } })
  }
  return (
    <div className="space-y-4">
      <p className="text-xs text-navy-600">
        Record each insurer you place business with. Insurer access is separate from joining the platform: after activation each one is configured, tested and enabled on its own, and quoting only uses enabled insurers.
      </p>
      <ul className="divide-y divide-navy-800/5 rounded-xl border border-navy-800/10">
        {view.insurers.length === 0 && <li className="px-3 py-3 text-xs text-navy-600">No insurer relationships recorded yet.</li>}
        {view.insurers.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
            <span>
              <span className="font-medium text-navy-900">{a.insurer_name}</span> · {MODULE_LABEL[a.product_module]}
              <span className="block text-xs text-navy-600">Intermediary code {a.intermediary_code ?? '–'}</span>
            </span>
            <span className="flex items-center gap-2">
              {!a.supported && <Badge tone="neutral" title={a.status_reason ?? undefined}>No integration</Badge>}
              <StatusBadge status={a.status} />
            </span>
          </li>
        ))}
      </ul>
      {canManage && editableStatus(view) && (
        <form onSubmit={submit} className="grid gap-2 rounded-xl border border-navy-800/10 bg-mist/60 p-3 sm:grid-cols-2">
          <select aria-label="Insurer" className={textInput} value={insurerId} onChange={(e) => setInsurerId(e.target.value)} required>
            <option value="">Insurer…</option>
            {data?.insurers.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
                {i.supported_modules.length ? '' : ' (no integration yet)'}
              </option>
            ))}
          </select>
          <select aria-label="Product module" className={textInput} value={module} onChange={(e) => setModule(e.target.value as ProductModule)} required>
            <option value="">Product module…</option>
            {(modules.length ? modules : PRODUCT_MODULES.map((m) => m.value)).map((m) => (
              <option key={m} value={m}>
                {MODULE_LABEL[m]}
              </option>
            ))}
          </select>
          <input aria-label="Intermediary code" className={textInput} placeholder="Intermediary code" value={code} onChange={(e) => setCode(e.target.value)} required />
          <input aria-label="Mandate notes" className={textInput} placeholder="Mandate or binder notes (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <Button type="submit" variant="accent" className="sm:col-span-2" disabled={declare.isPending}>
            Record insurer relationship
          </Button>
          {declare.error && <p className="text-xs text-red-600 sm:col-span-2">{declare.error.message}</p>}
        </form>
      )}
    </div>
  )
}

export function DocumentsSection({ view, onUploaded }: { view: OnboardingView; onUploaded: () => void }) {
  const upload = useUploadDocument()
  const sample = useSampleDocument()
  const [error, setError] = useState<string | null>(null)
  const canUpload = view.capabilities.includes('upload_documents') && editableStatus(view)
  const docs = view.readiness.checklist.filter((c) => c.kind === 'document')
  const feedbackFor = (itemId: string) => view.feedback.filter((f) => f.item_id === itemId && !f.resolved_at)

  const onFile = async (requirementKey: string, file: File | undefined) => {
    if (!file) return
    setError(null)
    try {
      const content = await fileToBase64(file)
      upload.mutate({ requirement_key: requirementKey, file_name: file.name, mime_type: file.type || null, size: file.size, content_base64: content }, { onSuccess: onUploaded, onError: (e) => setError(e.message) })
    } catch {
      setError('Could not read that file.')
    }
  }
  const open = async (documentId: string) => {
    const link = await api.onboarding.documentLink(documentId)
    const file = await api.onboarding.openDocument(link.token)
    if (file.content_base64) openBase64(file.file_name, file.mime_type, file.content_base64)
    else setError('This file was too large to keep in browser storage; only its details were recorded.')
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-navy-600">
        The checklist depends on your brokerage type and product modules. Files go to your brokerage’s private storage and open through short-lived links. Russ reads labelled details from text documents and suggests them in the Suggestions tab.
      </p>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">{error}</p>}
      <ul className="space-y-2">
        {docs.map((d) => {
          const doc = view.documents.find((x) => x.id === d.document_id)
          const fb = feedbackFor(d.item_id)
          return (
            <li key={d.item_id} className={cn('rounded-xl border p-3', d.status === 'correction_requested' || d.status === 'rejected' ? 'border-amber-300 bg-amber-50/50' : 'border-navy-800/10 bg-white')}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-navy-900">
                  {d.label}
                  {!d.required && <span className="text-xs font-normal text-navy-500"> (optional)</span>}
                </span>
                <StatusBadge status={d.status} />
              </div>
              {doc && (
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-navy-600">
                  {doc.file_name} · {formatDateTime(doc.created_at)}
                  {doc.data_origin === 'demo' && <Badge tone="warning">Sample</Badge>}
                  <button type="button" className="inline-flex cursor-pointer items-center gap-1 font-semibold text-brand-600 underline" onClick={() => void open(doc.id)}>
                    <ExternalLink className="h-3 w-3" /> Open
                  </button>
                </p>
              )}
              {fb.map((f) => (
                <p key={f.id} className="mt-2 rounded-lg bg-white px-2 py-1 text-xs text-amber-900">
                  <strong>Reviewer:</strong> {f.body}
                </p>
              ))}
              {canUpload && d.status !== 'accepted' && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-navy-800/15 bg-white px-3 py-1.5 text-xs font-semibold text-navy-800 hover:border-navy-800/40">
                    <FileUp className="h-3.5 w-3.5" /> {doc ? 'Replace' : 'Upload'}
                    <input type="file" className="sr-only" accept=".pdf,.txt,.png,.jpg,.jpeg,.csv" onChange={(e) => void onFile(d.requirement_key, e.target.files?.[0])} />
                  </label>
                  <button type="button" className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-navy-600 hover:bg-navy-50" onClick={() => sample.mutate(d.requirement_key, { onSuccess: onUploaded, onError: (e) => setError(e.message) })}>
                    <FlaskConical className="h-3.5 w-3.5" /> Use a sample
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function CommercialSection({ view }: { view: OnboardingView }) {
  const agree = useAgreeTerms()
  const [pkg, setPkg] = useState(view.terms?.package_key ?? '')
  const [accept, setAccept] = useState(false)
  const canAgree = view.capabilities.includes('agree_terms') && editableStatus(view)
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        {PACKAGES.map((p) => (
          <button
            key={p.key}
            type="button"
            disabled={!canAgree}
            onClick={() => setPkg(p.key)}
            aria-pressed={pkg === p.key}
            className={cn('cursor-pointer rounded-xl border p-3 text-left transition disabled:cursor-default', pkg === p.key ? 'border-brand-500 ring-2 ring-brand-500/20' : 'border-navy-800/10 hover:border-navy-800/30')}
          >
            <span className="block text-sm font-semibold text-navy-900">{p.label}</span>
            <span className="block text-xs text-navy-600">{p.summary}</span>
            <span className="mt-2 block text-xs text-navy-700">{p.users}</span>
            <span className="mt-1 block text-sm font-semibold text-navy-900">{p.monthly_fee ? `R${p.monthly_fee.toLocaleString('en-ZA')} / month` : 'Priced on request'}</span>
          </button>
        ))}
      </div>
      <p className="text-[11px] text-navy-500">Packages and fees are indicative placeholders until B-Covered confirms its commercial model.</p>
      {view.terms && (
        <p className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          <CheckCircle2 className="h-4 w-4" /> Agreed: {PACKAGES.find((p) => p.key === view.terms!.package_key)?.label} · {formatDateTime(view.terms.agreed_at ?? view.terms.created_at)} · terms {String(view.terms.terms.version ?? '')}
        </p>
      )}
      {canAgree ? (
        <div className="space-y-2 rounded-xl border border-navy-800/10 bg-mist/60 p-3">
          <label className="flex items-start gap-2 text-sm text-navy-800">
            <input type="checkbox" className="mt-1" checked={accept} onChange={(e) => setAccept(e.target.checked)} />
            I accept the B-Covered platform terms for the selected package on behalf of the brokerage.
          </label>
          <Button variant="accent" disabled={!pkg || !accept || agree.isPending} onClick={() => agree.mutate({ package_key: pkg, accept })}>
            Agree terms
          </Button>
          {agree.error && <p className="text-xs text-red-600">{agree.error.message}</p>}
        </div>
      ) : (
        !view.terms && <p className="text-xs text-navy-600">The brokerage owner agrees the commercial terms.</p>
      )}
    </div>
  )
}

export function ReadinessSection({ view }: { view: OnboardingView }) {
  const submit = useSubmitApplication()
  const r = view.readiness
  const pct = r.required_total ? Math.round((r.required_done / r.required_total) * 100) : 0
  const canSubmit = view.capabilities.includes('submit') && r.can_submit
  const bySection = useMemo(() => SECTIONS.filter((s) => s.key !== 'readiness').map((s) => ({ ...s, items: r.checklist.filter((c) => c.section === s.key) })), [r.checklist])
  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-semibold text-navy-900">
            {r.required_done} of {r.required_total} required items done
          </span>
          <span className="text-navy-600">{pct}%</span>
        </div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-navy-50">
          <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
      {r.attention.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm font-semibold text-amber-900">Review feedback to resolve</p>
          <ul className="mt-1 list-disc pl-5 text-xs text-amber-900">
            {r.attention.map((c) => (
              <li key={c.item_id}>
                <Link to={`/onboarding/${c.section}`} className="underline">
                  {c.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="space-y-3">
        {bySection
          .filter((s) => s.items.length)
          .map((s) => (
            <div key={s.key}>
              <Link to={`/onboarding/${s.key}`} className="text-xs font-semibold tracking-wide text-navy-500 uppercase hover:text-brand-600">
                {s.label}
              </Link>
              <ul className="mt-1 space-y-1">
                {s.items.map((c) => (
                  <li key={c.item_id} className="flex items-center justify-between gap-2 text-sm text-navy-800">
                    <span>
                      {c.label}
                      {!c.required && <span className="text-xs text-navy-500"> (optional)</span>}
                    </span>
                    <StatusBadge status={c.status} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
      </div>
      <div className="rounded-xl border border-navy-800/10 bg-mist/60 p-3 text-xs text-navy-700">
        <p className="font-semibold text-navy-900">What happens next</p>
        <ol className="mt-1 list-decimal space-y-0.5 pl-5">
          <li>A B-Covered reviewer checks each item and may ask for corrections.</li>
          <li>Approval and activation are separate decisions. Nothing is live until activation.</li>
          <li>After activation, each insurer is configured and enabled separately before you can quote with it.</li>
        </ol>
      </div>
      <NotAuthorisation />
      {view.capabilities.includes('submit') && editableStatus(view) && (
        <div className="space-y-2">
          {!r.can_submit && (
            <ul className="list-disc pl-5 text-xs text-navy-600">
              {r.blockers.slice(0, 6).map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          )}
          <Button variant="accent" disabled={!canSubmit || submit.isPending} onClick={() => submit.mutate(undefined)}>
            <Send /> {view.application.status === 'information_required' ? 'Resubmit for approval' : 'Submit for approval'}
          </Button>
          {submit.error && <p className="text-xs text-red-600">{submit.error.message}</p>}
        </div>
      )}
    </div>
  )
}
