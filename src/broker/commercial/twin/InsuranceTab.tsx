import { useRef, useState } from 'react'
import { AlertTriangle, Check, FileUp, Loader2, Plus, ShieldQuestion, X } from 'lucide-react'
import type { ProposalView, TwinWorkspace } from '@/api/client'
import { useAddDocument, useCheckCoverage, useDecideProposal, useReviewCoverage } from '@/api/hooks'
import { COVERAGE_LABEL, CoverageBadge, ProvenanceBadge } from '@/components/commercial/badges'
import { SimulatedBadge } from '@/components/SimulatedBadge'
import { StatusBadge, humanise } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { formatDate, formatDateTime } from '@/lib/utils'
import type { CoverageFinding, CoverageStatus } from '@/server/db/commercialSchema'
import { coverLabel } from '@/server/domain/commercial/coverClasses'
import { Card, InlineError, money } from './shared'

const STATUSES: CoverageStatus[] = ['awaiting_broker_review', 'potentially_covered', 'confirmed_covered', 'confirmed_excluded', 'unknown']

export function InsuranceTab({ w }: { w: TwinWorkspace }) {
  const pending = w.proposals.filter((p) => p.status === 'pending')
  return (
    <div className="space-y-4">
      <Documents w={w} />
      {pending.length > 0 && (
        <Card title={`Proposed updates from documents (${pending.length})`} description="Nothing changes until you apply it. Values you have confirmed are never overwritten silently.">
          <ul className="space-y-3">
            {pending.map((p) => (
              <ProposalCard key={p.id} p={p} />
            ))}
          </ul>
        </Card>
      )}
      <Policies w={w} />
      <Coverage w={w} />
      <Valuations w={w} />
    </div>
  )
}

function Documents({ w }: { w: TwinWorkspace }) {
  const add = useAddDocument()
  const file = useRef<HTMLInputElement>(null)
  const id = w.business.profile.id
  return (
    <Card
      title="Documents"
      description="Policy schedules, wordings, asset registers, vehicle schedules, leases and contracts. The agents identify the type, extract fields with page references and propose Twin updates."
      action={
        <>
          <input
            ref={file}
            type="file"
            className="sr-only"
            aria-label="Upload a document"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) add.mutate({ profile_id: id, file_name: f.name, file_size: f.size })
              e.target.value = ''
            }}
          />
          <Button size="sm" variant="outline" onClick={() => file.current?.click()} disabled={add.isPending}>
            <FileUp /> Upload a file
          </Button>
        </>
      }
    >
      <InlineError error={add.error} />
      {add.data && !add.data.extracted && (
        <p className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          The file name and size were recorded. Automatic extraction needs the server-side document model, which is not connected in this demo; review the file manually or use a sample document.
        </p>
      )}
      {w.samples.length > 0 && (
        <div className="mb-3 rounded-xl border border-dashed border-brand-500/30 bg-brand-50/40 p-3">
          <p className="text-xs font-semibold text-navy-800">Sample documents for this business (simulated extraction)</p>
          <ul className="mt-2 space-y-2">
            {w.samples.map((s) => (
              <li key={s.key} className="flex items-center justify-between gap-3 text-xs">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-navy-900">{s.file_name}</span>
                  <span className="text-navy-600">{s.summary}</span>
                </span>
                <Button size="sm" variant="outline" className="shrink-0" onClick={() => add.mutate({ profile_id: id, fixture_key: s.key })} disabled={s.added || add.isPending}>
                  {s.added ? <Check /> : <Plus />} {s.added ? 'Added' : 'Add'}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {w.documents.length ? (
        <ul className="divide-y divide-navy-800/5">
          {w.documents.map((d) => (
            <li key={d.id} className="py-2.5 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-navy-900">{d.file_name}</span>
                <span className="flex items-center gap-2">
                  {d.is_simulated && <SimulatedBadge label="Simulated extraction" />}
                  <StatusBadge status={d.status} />
                </span>
              </div>
              <p className="text-xs text-navy-600">
                {humanise(d.doc_type)}
                {d.page_count ? ` · ${d.page_count} pages` : ''} · added {formatDateTime(d.created_at)}
              </p>
              {d.extraction_note && <p className="mt-0.5 text-xs text-navy-600">{d.extraction_note}</p>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-navy-600">No documents yet.</p>
      )}
    </Card>
  )
}

function ProposalCard({ p }: { p: ProposalView }) {
  const decide = useDecideProposal()
  const [checked, setChecked] = useState(false)
  return (
    <li className="rounded-xl border border-navy-800/10 bg-white p-3">
      <p className="text-sm font-semibold text-navy-900">{p.label}</p>
      <p className="text-[11px] text-navy-500">
        From {p.document_name}
        {p.page_ref ? `, ${p.page_ref}` : ''}
      </p>
      <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
        <div className="rounded-lg border border-navy-800/10 bg-mist p-2.5">
          <p className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Current</p>
          <p className="mt-0.5 text-xs text-navy-800">{p.current_text}</p>
        </div>
        <div className="rounded-lg border border-brand-500/30 bg-brand-50/60 p-2.5">
          <p className="text-[11px] font-semibold tracking-wide text-brand-700 uppercase">Suggested</p>
          <p className="mt-0.5 text-xs text-navy-800">{p.suggested_text}</p>
        </div>
      </div>
      {p.conflict && (
        <div className="mt-2 space-y-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <p className="flex items-start gap-1.5">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {p.conflict}
          </p>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} /> I checked this against the document
          </label>
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" variant="accent" onClick={() => decide.mutate({ proposal_id: p.id, decision: 'apply', confirm_conflict: checked })} disabled={decide.isPending || (Boolean(p.conflict) && !checked)}>
          <Check /> Apply to records
        </Button>
        <Button size="sm" variant="ghost" onClick={() => decide.mutate({ proposal_id: p.id, decision: 'reject' })} disabled={decide.isPending}>
          <X /> Reject
        </Button>
      </div>
      <InlineError error={decide.error} />
    </li>
  )
}

function Policies({ w }: { w: TwinWorkspace }) {
  if (!w.policies.length) {
    return (
      <Card title="Insurance policies" description="Policy evidence comes only from documents on file.">
        <p className="text-xs text-navy-600">
          No policy schedule on file{w.business.profile.existing_cover?.insurer ? `. The client declared cover with ${w.business.profile.existing_cover.insurer}` : ''}. Add the schedule above so the agents can check coverage evidence.
        </p>
      </Card>
    )
  }
  return (
    <Card title="Insurance policies" description="Sections read from documents stay “From document” until you verify them.">
      {w.policies.map((pol) => (
        <div key={pol.id} className="mb-4 last:mb-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-navy-900">
            {pol.insurer} {pol.policy_number} <ProvenanceBadge source={pol.source} />
          </p>
          <p className="text-xs text-navy-600">
            {pol.inception_date ? `From ${formatDate(pol.inception_date)}` : ''}
            {pol.renewal_date ? ` · renews ${formatDate(pol.renewal_date)}` : ''}
          </p>
          <div className="scroll-x -mx-5 mt-2 px-5">
            <table className="w-full min-w-[720px] text-xs">
              <thead className="text-left text-[11px] font-semibold tracking-wide text-navy-500 uppercase">
                <tr>
                  <th className="py-1.5">Section</th>
                  <th className="py-1.5">Class</th>
                  <th className="py-1.5">Sum insured or limit</th>
                  <th className="py-1.5">Excess</th>
                  <th className="py-1.5">Conditions and exclusions</th>
                  <th className="py-1.5">Page</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-800/5">
                {w.sections
                  .filter((s) => s.policy_id === pol.id)
                  .map((s) => (
                    <tr key={s.id} className="align-top">
                      <td className="py-1.5 font-medium text-navy-900">{s.section_name}</td>
                      <td className="py-1.5 text-navy-700">{coverLabel(s.cover_class)}</td>
                      <td className="py-1.5 text-navy-700">
                        {money(s.sum_insured ?? s.limit_of_indemnity)}
                        {s.basis ? ` · ${s.basis}` : ''}
                      </td>
                      <td className="py-1.5 text-navy-700">{s.excess ?? '–'}</td>
                      <td className="py-1.5 text-navy-700">{[...s.conditions, ...s.exclusions.map((x) => `Excludes: ${x}`)].join('; ') || '–'}</td>
                      <td className="py-1.5 text-navy-700">{s.page_ref ?? '–'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </Card>
  )
}

function Coverage({ w }: { w: TwinWorkspace }) {
  const check = useCheckCoverage()
  const latest = (exposureId: string) => w.coverage.filter((f) => f.exposure_id === exposureId).sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0]
  return (
    <Card
      title="Coverage evidence by exposure"
      description="The agents can only propose “potentially covered” or flag wording for review. Confirming cover or an exclusion is your decision, with the clause cited."
      action={
        <Button size="sm" variant="outline" onClick={() => check.mutate(w.business.profile.id)} disabled={check.isPending || !w.business.risk_profile}>
          {check.isPending ? <Loader2 className="animate-spin" /> : <ShieldQuestion />} Check coverage evidence
        </Button>
      }
    >
      <InlineError error={check.error} />
      <ul className="space-y-2">
        {w.business.exposures.map((e) => (
          <CoverageRow key={e.id} title={e.title} status={e.coverage_status} finding={latest(e.id)} />
        ))}
      </ul>
    </Card>
  )
}

function CoverageRow({ title, status, finding }: { title: string; status: CoverageStatus; finding: CoverageFinding | undefined }) {
  const review = useReviewCoverage()
  const [open, setOpen] = useState(false)
  const [next, setNext] = useState<CoverageStatus>(finding?.status ?? 'awaiting_broker_review')
  const [note, setNote] = useState(finding?.review_note ?? '')
  return (
    <li className="rounded-xl border border-navy-800/10 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="min-w-0 text-sm font-medium text-navy-900">{title}</span>
        <span className="flex items-center gap-2">
          <CoverageBadge status={status} />
          {finding?.reviewed_by && <span className="text-[11px] text-emerald-700">Broker reviewed</span>}
        </span>
      </div>
      <p className="mt-1 text-xs text-navy-700">{finding ? finding.rationale : 'Not checked against policy evidence yet.'}</p>
      {finding?.clause_ref && <p className="mt-0.5 text-xs text-navy-600">Clause: “{finding.clause_ref}”</p>}
      {(finding?.insurer || finding?.page_ref) && (
        <p className="mt-0.5 text-[11px] text-navy-500">
          {[finding.insurer, finding.section_name, finding.page_ref].filter(Boolean).join(' · ')}
        </p>
      )}
      {finding?.review_note && <p className="mt-0.5 text-xs text-navy-700">Broker note: “{finding.review_note}”</p>}
      {finding && (
        <div className="mt-2">
          {!open ? (
            <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
              Record your conclusion
            </Button>
          ) : (
            <div className="space-y-2 rounded-lg bg-mist/60 p-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor={`cov-${finding.id}`}>
                  Coverage conclusion
                </label>
                <select id={`cov-${finding.id}`} className="field h-8 py-0 text-xs" value={next} onChange={(e) => setNext(e.target.value as CoverageStatus)}>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {COVERAGE_LABEL[s]}
                    </option>
                  ))}
                </select>
                <input className="field h-8 min-w-48 flex-1 py-0 text-xs" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Cite the clause, e.g. p. 4 excludes scheduled outages" aria-label="Clause or wording" />
                <Button size="sm" variant="accent" onClick={() => review.mutate({ finding_id: finding.id, status: next, note }, { onSuccess: () => setOpen(false) })} disabled={review.isPending}>
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
              </div>
              <InlineError error={review.error} />
            </div>
          )}
        </div>
      )}
    </li>
  )
}

function Valuations({ w }: { w: TwinWorkspace }) {
  if (!w.valuations.length) return null
  return (
    <Card title="Declared values against sums insured" description="Recorded values only, with their basis. Differences are not loss or premium estimates.">
      <ul className="space-y-2">
        {w.valuations.map((v) => (
          <li key={v.key} className="rounded-xl border border-navy-800/10 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-navy-900">{v.label}</span>
              <StatusBadge status={v.status} />
            </div>
            <p className="mt-1 text-xs text-navy-700">{v.finding}</p>
            {v.assumptions.length > 0 && <p className="mt-0.5 text-[11px] text-navy-500">{v.assumptions.join(' ')}</p>}
          </li>
        ))}
      </ul>
    </Card>
  )
}
