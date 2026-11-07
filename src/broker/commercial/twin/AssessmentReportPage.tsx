import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import type { ReportFact } from '@/api/client'
import { useAssessmentReport } from '@/api/hooks'
import { AssessmentPriorityBadge, CoverageBadge, ProvenanceBadge } from '@/components/commercial/badges'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDate, formatDateTime } from '@/lib/utils'
import type { FieldSource } from '@/server/db/commercialSchema'
import { ErrorState, LoadingState } from '../../PageHeader'
import { FactBasisBadge } from './shared'

const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  #risk-report, #risk-report * { visibility: visible !important; }
  #risk-report { position: absolute; left: 0; top: 0; width: 100%; padding: 0 !important; }
  #risk-report .no-print { display: none !important; }
  #risk-report section { break-inside: avoid; }
}`

function Section({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="border-t border-navy-800/10 pt-5" aria-labelledby={`report-${n}`}>
      <h2 id={`report-${n}`} className="text-base font-semibold text-navy-900">
        {n}. {title}
      </h2>
      <div className="mt-2 text-sm text-navy-800">{children}</div>
    </section>
  )
}

function Facts({ facts }: { facts: ReportFact[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
      {facts.map((f) => (
        <div key={`${f.label}-${f.value}`}>
          <dt className="text-[11px] text-navy-500">{f.label}</dt>
          <dd className="flex flex-wrap items-center gap-2 font-medium text-navy-900">
            {f.value} {f.source && <ProvenanceBadge source={f.source as FieldSource} />}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** Business Risk Review report for discussion with the client. Print to PDF from the browser. */
export default function AssessmentReportPage() {
  const { assessmentId } = useParams()
  const { data: r, isLoading, error } = useAssessmentReport(assessmentId)
  if (isLoading) return <div className="p-6"><LoadingState /></div>
  if (error || !r) return <div className="p-6"><ErrorState message={error?.message ?? 'Report not found'} /></div>
  const top = r.findings.filter((f) => f.is_priority_area)
  const conclusion = r.conclusions_approved ? 'Broker-approved conclusion' : 'Preliminary finding'

  return (
    <div id="risk-report" className="mx-auto max-w-4xl space-y-5 bg-white p-4 sm:p-8">
      <style>{PRINT_CSS}</style>
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <Button size="sm" variant="ghost" asChild>
          <Link to={`/broker/commercial/risk-twins/${r.assessment.business_profile_id}`}>
            <ArrowLeft /> Back to the Twin workspace
          </Link>
        </Button>
        <Button size="sm" variant="accent" onClick={() => window.print()}>
          <Printer /> Print or save as PDF
        </Button>
      </div>

      <header>
        <p className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Business Risk Review · {r.type_label}</p>
        <h1 className="text-2xl font-semibold text-navy-900">{r.business.name}</h1>
        <p className="text-sm text-navy-600">
          {r.business.registered_name} · {r.business.industry} · Risk Twin v{r.business.twin_version ?? '?'} · prepared {formatDateTime(r.generated_at)}
          {r.business.broker ? ` · broker ${r.business.broker}` : ''}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge tone={r.conclusions_approved ? 'success' : 'warning'}>{r.conclusions_approved ? 'Signed off by the broker' : 'Draft: not yet signed off'}</Badge>
        </div>
        <div className="mt-3 rounded-xl border border-navy-800/10 bg-mist p-3 text-xs text-navy-700">
          <p className="font-semibold text-navy-900">How to read this report</p>
          <p className="mt-1 flex flex-wrap items-center gap-2">
            <ProvenanceBadge source="verified" /> checked against a document or record
            <ProvenanceBadge source="declared" /> stated by the client
            <ProvenanceBadge source="extracted" /> read from a document, not yet confirmed
            <ProvenanceBadge source="inferred" /> inferred by an agent
            <ProvenanceBadge source="missing" /> not provided
          </p>
          <p className="mt-1">
            Findings are marked “{conclusion}”. Potential exposures are areas to investigate, not confirmed cover. No loss or premium has been estimated.
          </p>
        </div>
      </header>

      <Section n={1} title="Business overview">
        <Facts facts={r.overview} />
      </Section>

      <Section n={2} title="Assessment scope">
        <ul className="list-disc space-y-0.5 pl-5">
          {r.assessment.scope.map((s) => (
            <li key={s}>{s}</li>
          ))}
          <li>
            Industry template: {r.assessment.template_key.replace(/_/g, ' ')} v{r.assessment.template_version}
          </li>
        </ul>
      </Section>

      <Section n={3} title="Business operations">
        <Facts facts={r.operations} />
      </Section>

      <Section n={4} title="Locations and assets">
        <div className="space-y-4">
          {r.locations.map((l) => (
            <div key={l.name}>
              <p className="font-semibold text-navy-900">{l.name}</p>
              <Facts facts={l.facts} />
              {l.assets.length > 0 && (
                <div className="mt-2">
                  <p className="text-[11px] text-navy-500">Assets</p>
                  <Facts facts={l.assets} />
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>

      <Section n={5} title="Operational dependencies">
        {r.dependencies.length ? (
          <ul className="space-y-1">
            {r.dependencies.map((d) => (
              <li key={d.text} className="flex flex-wrap items-center gap-2">
                {d.text} <ProvenanceBadge source={d.source as FieldSource} />
              </li>
            ))}
          </ul>
        ) : (
          <p>No operational dependencies recorded.</p>
        )}
      </Section>

      <Section n={6} title="Identified exposures">
        <p className="mb-2 text-xs text-navy-600">
          {r.findings.length} findings, ranked by explained qualitative factors. The {top.length} most important areas requiring review come first.
        </p>
        <ol className="space-y-3">
          {r.findings.map((f) => (
            <li key={f.id} className="rounded-xl border border-navy-800/10 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-navy-900">
                  {f.rank}. {f.title}
                  {f.is_priority_area ? ' (priority area)' : ''}
                </p>
                <span className="flex flex-wrap gap-1.5">
                  <AssessmentPriorityBadge priority={f.priority} />
                  <FactBasisBadge basis={f.fact_basis} />
                  <Badge tone={r.conclusions_approved && f.status !== 'rejected' ? 'success' : 'neutral'}>{f.status === 'rejected' ? 'Rejected by broker' : conclusion}</Badge>
                </span>
              </div>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-navy-700">
                {f.rationale.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
              {f.broker_note && <p className="mt-1 text-xs text-navy-700">Broker note: “{f.broker_note}”</p>}
            </li>
          ))}
        </ol>
      </Section>

      <Section n={7} title="Existing insurance evidence">
        {r.insurance.length ? (
          r.insurance.map((p) => (
            <div key={p.policy} className="mb-3">
              <p className="flex flex-wrap items-center gap-2 font-semibold text-navy-900">
                {p.policy} <ProvenanceBadge source={p.source as FieldSource} />
              </p>
              <Facts facts={p.sections} />
            </div>
          ))
        ) : (
          <p>No policy schedule has been analysed. Coverage cannot be assessed until the schedule and wording are provided.</p>
        )}
        <ul className="mt-2 space-y-1">
          {r.findings.map((f) => (
            <li key={f.id} className="flex items-start gap-2 text-xs">
              <CoverageBadge status={f.coverage.status} className="shrink-0" />
              <span>
                {f.title}: {f.coverage.note}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section n={8} title="Potential coverage gaps">
        {r.coverage_gaps.length ? (
          <ul className="list-disc space-y-1 pl-5">
            {r.coverage_gaps.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        ) : (
          <p>No potential gaps identified from the evidence on file.</p>
        )}
        <p className="mt-2 text-xs text-navy-600">These are preliminary and need the full policy wording before any conclusion about cover.</p>
      </Section>

      <Section n={9} title="Missing information">
        {r.missing.length ? (
          <ul className="space-y-2">
            {r.missing.map((m) => (
              <li key={m.label}>
                <p className="font-medium text-navy-900">{m.label}</p>
                <ul className="list-disc pl-5 text-xs text-navy-700">
                  {m.items.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        ) : (
          <p>Nothing outstanding.</p>
        )}
      </Section>

      <Section n={10} title="Recommended investigations">
        {r.investigations.length ? (
          <ul className="space-y-1">
            {r.investigations.map((i) => (
              <li key={i.title}>
                <strong>{i.title}</strong> ({i.status}){i.detail ? `: ${i.detail}` : ''}
              </li>
            ))}
          </ul>
        ) : (
          <p>No investigations recommended.</p>
        )}
      </Section>

      <Section n={11} title="Action plan">
        {r.actions.length ? (
          <ul className="space-y-1">
            {r.actions.map((a) => (
              <li key={a.title} className="flex flex-wrap justify-between gap-2">
                <span>{a.title}</span>
                <span className="text-xs text-navy-600">
                  {a.audience === 'customer' ? 'Client' : 'Broker'} · due {formatDate(a.due)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p>No open actions.</p>
        )}
      </Section>

      <Section n={12} title="Broker review and sign-off">
        {r.conclusions_approved ? (
          <p>
            Signed off by <strong>{r.signoff.decided_by ?? 'the broker'}</strong> on {formatDateTime(r.signoff.decided_at)}
            {r.signoff.note ? ` with the note “${r.signoff.note}”` : ''}. Next review by {formatDate(r.assessment.next_review_date)}.
          </p>
        ) : (
          <p>Not yet signed off. Status: {r.signoff.status.replace(/_/g, ' ')}. Everything in this report is preliminary until the broker signs off.</p>
        )}
        <ul className="mt-3 list-disc space-y-0.5 pl-5 text-xs text-navy-600">
          {r.assumptions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </Section>
    </div>
  )
}
