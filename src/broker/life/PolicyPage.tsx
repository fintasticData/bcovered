import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'
import { useProposeBeneficiaries, usePolicy, useRecordDecision, useUpdateRequirement } from '@/api/hooks'
import { StatusBadge, humanise } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { formatDate, formatDateTime } from '@/lib/utils'
import { ErrorState, LoadingState, PageHeader } from '../PageHeader'
import { AskCopilotButton } from '../copilot/AskCopilotButton'
import { BasisBadge, Notice, Page, Section, SourceBadge, Stat, Table, Td, zar } from '../shared/ui'

export default function PolicyPage() {
  const { policyId } = useParams()
  const { data, isLoading, error } = usePolicy(policyId)
  const updateReq = useUpdateRequirement()
  if (isLoading) return <LoadingState />
  if (error || !data) return <div className="p-6"><ErrorState message={error?.message ?? 'Not found'} /></div>
  const { policy } = data
  const beneficiaries = data.parties.filter((p) => p.role === 'beneficiary')
  const others = data.parties.filter((p) => p.role !== 'beneficiary')
  const pendingBeneficiary = data.approvals.find((a) => a.approval_type === 'beneficiary_change' && a.status === 'pending')

  return (
    <Page>
      <PageHeader
        title={`${data.provider} ${policy.policy_number ?? '(application)'}`}
        description={
          <>
            {data.product ?? 'Product not recorded'} · {data.customer.full_name} · {policy.origin.replace(/_/g, ' ')}
            {data.roa && (
              <>
                {' · '}
                <Link to={`/broker/life/advice/${data.roa.id}`} className="font-semibold text-brand-600">
                  Record of Advice v{data.roa.version} ({data.roa.status.replace(/_/g, ' ')})
                </Link>
              </>
            )}
          </>
        }
        actions={
          <div className="flex items-center gap-2">
            <AskCopilotButton copilot="ava" kind="policy" id={policy.id} />
            <StatusBadge status={policy.status} />
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Premium" value={`${zar(policy.premium_amount)} pm`} basis={policy.source} />
        <Stat label="Underwriting" value={humanise(policy.underwriting_status ?? 'not started')} />
        <Stat label="Inception" value={policy.inception_date ? formatDate(policy.inception_date) : '–'} hint={policy.anniversary_month ? `Anniversary month ${policy.anniversary_month}` : undefined} />
        <Stat label="Beneficiaries" value={beneficiaries.length || 'None'} tone={beneficiaries.length ? undefined : 'warning'} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="Parties">
          <ul className="space-y-1 text-sm">
            {others.map((p) => (
              <li key={p.id} className="flex justify-between gap-2">
                <Link to={`/broker/people/${p.person_id}`} className="font-medium text-brand-600">
                  {p.name}
                </Link>
                <span className="text-navy-700">{humanise(p.role)}</span>
              </li>
            ))}
          </ul>
        </Section>
        <Section title="Benefits">
          <ul className="space-y-1 text-sm">
            {data.benefits.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {humanise(b.benefit_type_key)} ({b.kind}) · {zar(b.sum_assured ?? b.monthly_benefit)}
                  {b.monthly_benefit ? ' pm' : ''}
                  {b.loading_pct ? ` · loading ${b.loading_pct}%` : ''}
                  {b.exclusions.length ? ` · excl. ${b.exclusions.join(', ')}` : ''}
                </span>
                <span className="flex items-center gap-1.5">
                  <BasisBadge basis={b.source} /> <StatusBadge status={b.status} />
                </span>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <BeneficiarySection policyId={policy.id} household={data.household} current={beneficiaries} pending={Boolean(pendingBeneficiary)} />

      {data.requirements.length > 0 && (
        <Section title="Underwriting requirements">
          <p className="mb-2 text-[11px] text-navy-500">Requirement names and statuses only. Medical results are never stored here.</p>
          <ul className="divide-y divide-navy-800/5">
            {data.requirements.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>
                  {r.requirement} <span className="text-[11px] text-navy-500">· {r.source === 'product_rules' ? 'expected from product rules' : 'requested by insurer'}</span>
                </span>
                <span className="flex items-center gap-2">
                  <StatusBadge status={r.status} />
                  {r.status === 'outstanding' ? (
                    <>
                      <Button size="sm" variant="outline" onClick={() => updateReq.mutate({ requirement_id: r.id, status: 'received' })}>
                        Received
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => updateReq.mutate({ requirement_id: r.id, status: 'waived' })}>
                        Waived
                      </Button>
                    </>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {['underwriting', 'application_submitted'].includes(policy.status) && <DecisionForm policyId={policy.id} />}

      <Section title="Status history">
        <Table head={['When', 'Status', 'Reported by', 'Note', 'Document']} minWidth={720}>
          {data.events.map((e) => (
            <tr key={e.id}>
              <Td className="text-xs whitespace-nowrap">{formatDateTime(e.occurred_at)}</Td>
              <Td>{humanise(e.status)}</Td>
              <Td>
                <SourceBadge source={e.reported_by} />
              </Td>
              <Td className="text-xs">{e.note ?? '–'}</Td>
              <Td className="text-xs">{e.document_ref ?? '–'}</Td>
            </tr>
          ))}
        </Table>
      </Section>
    </Page>
  )
}

function BeneficiarySection({
  policyId,
  household,
  current,
  pending,
}: {
  policyId: string
  household: Array<{ person_id: string; name: string; role: string }>
  current: Array<{ id: string; person_id: string; name: string; share_pct: number | null }>
  pending: boolean
}) {
  const propose = useProposeBeneficiaries()
  const [rows, setRows] = useState<Array<{ person_id: string; share: string }>>([])
  const [editing, setEditing] = useState(false)
  const candidates = household.filter((h) => h.role !== 'self')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    propose.mutate(
      { policy_id: policyId, beneficiaries: rows.filter((r) => r.person_id).map((r) => ({ person_id: r.person_id, share_pct: Number(r.share) })) },
      { onSuccess: () => setEditing(false) },
    )
  }
  return (
    <Section
      title="Beneficiaries"
      actions={
        !pending && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setRows(current.length ? current.map((c) => ({ person_id: c.person_id, share: String(c.share_pct ?? '') })) : [{ person_id: candidates[0]?.person_id ?? '', share: '100' }])
              setEditing((x) => !x)
            }}
          >
            {editing ? 'Cancel' : 'Propose a change'}
          </Button>
        )
      }
    >
      {pending && <Notice tone="warning">A beneficiary change is waiting in Approvals. It applies only once a person approves it.</Notice>}
      {current.length ? (
        <ul className="mt-2 space-y-1 text-sm">
          {current.map((b) => (
            <li key={b.id} className="flex justify-between">
              <Link to={`/broker/people/${b.person_id}`} className="font-medium text-brand-600">
                {b.name}
              </Link>
              <span>{b.share_pct}%</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-amber-800">No beneficiary nominated. The benefit would be paid to the estate.</p>
      )}
      {editing && (
        <form onSubmit={submit} className="mt-3 space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <select value={r.person_id} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, person_id: e.target.value } : x)))} className="field flex-1" aria-label="Beneficiary">
                <option value="">Choose a person</option>
                {candidates.map((c) => (
                  <option key={c.person_id} value={c.person_id}>
                    {c.name} ({c.role})
                  </option>
                ))}
              </select>
              <input value={r.share} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, share: e.target.value } : x)))} className="field w-24" inputMode="decimal" aria-label="Share %" />
              <span className="text-xs text-navy-500">%</span>
              <Button type="button" size="icon" variant="ghost" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Remove">
                <Trash2 />
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setRows([...rows, { person_id: '', share: '' }])}>
              <Plus /> Add beneficiary
            </Button>
            <Button type="submit" size="sm" disabled={propose.isPending || !rows.length}>
              Send for approval
            </Button>
            {propose.error && <span className="text-xs text-red-600">{propose.error.message}</span>}
          </div>
        </form>
      )}
    </Section>
  )
}

function DecisionForm({ policyId }: { policyId: string }) {
  const record = useRecordDecision()
  const [form, setForm] = useState({ decision: 'accepted' as 'accepted' | 'accepted_with_terms' | 'declined', document_ref: '', policy_number: '', inception_date: '', loading_pct: '', exclusions: '' })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    record.mutate({
      policy_id: policyId,
      decision: form.decision,
      document_ref: form.document_ref,
      policy_number: form.policy_number || undefined,
      inception_date: form.inception_date || undefined,
      loading_pct: form.loading_pct ? Number(form.loading_pct) : undefined,
      exclusions: form.exclusions ? form.exclusions.split(';').map((s) => s.trim()).filter(Boolean) : undefined,
    })
  }
  return (
    <Section title="Record the insurer’s decision">
      <Notice>Record only what the insurer has decided, from its letter or portal. The entry is labelled as insurer-reported and needs the document reference.</Notice>
      <form onSubmit={submit} className="mt-3 grid grid-cols-1 gap-2 text-sm md:grid-cols-3">
        <label>
          <span className="field-label text-xs">Decision</span>
          <select value={form.decision} onChange={(e) => setForm({ ...form, decision: e.target.value as typeof form.decision })} className="field">
            <option value="accepted">Accepted at standard terms</option>
            <option value="accepted_with_terms">Accepted with loading or exclusions</option>
            <option value="declined">Declined</option>
          </select>
        </label>
        <label>
          <span className="field-label text-xs">Insurer document reference</span>
          <input value={form.document_ref} onChange={(e) => setForm({ ...form, document_ref: e.target.value })} className="field" required placeholder="e.g. Acceptance letter UW-2026-1182" />
        </label>
        <label>
          <span className="field-label text-xs">Policy number</span>
          <input value={form.policy_number} onChange={(e) => setForm({ ...form, policy_number: e.target.value })} className="field" />
        </label>
        <label>
          <span className="field-label text-xs">Inception date</span>
          <input type="date" value={form.inception_date} onChange={(e) => setForm({ ...form, inception_date: e.target.value })} className="field" />
        </label>
        <label>
          <span className="field-label text-xs">Loading %</span>
          <input value={form.loading_pct} onChange={(e) => setForm({ ...form, loading_pct: e.target.value })} className="field" inputMode="decimal" />
        </label>
        <label>
          <span className="field-label text-xs">Exclusions (separate with ;)</span>
          <input value={form.exclusions} onChange={(e) => setForm({ ...form, exclusions: e.target.value })} className="field" />
        </label>
        <div className="flex items-center gap-2 md:col-span-3">
          <Button type="submit" size="sm" disabled={record.isPending || form.document_ref.length < 3}>
            Record insurer decision
          </Button>
          {record.error && <span className="text-xs text-red-600">{record.error.message}</span>}
        </div>
      </form>
    </Section>
  )
}
