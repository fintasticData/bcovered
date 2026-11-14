import { Link, useNavigate, useParams } from 'react-router-dom'
import { useEmployer, useStartMovements } from '@/api/hooks'
import { Button } from '@/components/ui/button'
import type { EmployerDetail } from '@/api/client'
import { StatusBadge, humanise } from '@/components/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { formatDate, formatDateTime } from '@/lib/utils'
import { ErrorState, LoadingState, PageHeader } from '../PageHeader'
import { BasisBadge, Page, Section, SourceBadge, Stat, Table, Td, zar } from '../shared/ui'
import { MovementsPanel } from './MovementsPanel'

export default function EmployerPage() {
  const { customerId } = useParams()
  const { data, isLoading, error } = useEmployer(customerId)
  if (isLoading) return <LoadingState />
  if (error || !data) return <div className="p-6"><ErrorState message={error?.message ?? 'Not found'} /></div>
  return (
    <Page wide>
      <PageHeader title={data.customer.full_name} description={`Employer 360 · ${data.customer.region ?? ''} · ${data.members} active members, ${data.leavers} leavers on record`} />
      <EmployerBody data={data} staff />
    </Page>
  )
}

function ProcessMovements({ employerId }: { employerId: string }) {
  const start = useStartMovements()
  const navigate = useNavigate()
  return (
    <>
      <Button size="sm" variant="accent" disabled={start.isPending} onClick={() => start.mutate(employerId, { onSuccess: (r) => navigate(`/broker/jobs/${r.job_id}`) })}>
        Process movements and recalculate cover
      </Button>
      {start.error && <span className="text-xs text-red-600">{start.error.message}</span>}
    </>
  )
}

export function EmployerBody({ data, staff }: { data: EmployerDetail; staff: boolean }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Active members" value={data.members} />
        <Stat label="Annual salary roll" value={zar(data.salary_roll_annual)} basis="reported" />
        <Stat label="Arrangements" value={`${data.schemes.length} schemes · ${data.funds.length} funds`} />
        <Stat label="Open exceptions" value={data.exceptions.length} tone={data.exceptions.length ? 'danger' : undefined} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="Group risk schemes">
          {data.schemes.map((s) => (
            <div key={s.id} className="mb-3 rounded-xl border border-navy-800/10 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-navy-900">{s.name}</p>
                <StatusBadge status={s.status} />
              </div>
              <p className="text-xs text-navy-600">
                {s.provider} · {s.policy_number} · renews {formatDate(s.renewal_date)}
              </p>
              {s.rules && (
                <p className="mt-1 text-xs text-navy-700">
                  Rules v{s.rules.version} from {formatDate(s.rules.effective_from)}: {Object.entries(s.rules.rules.categories).map(([c, r]) => `${c} ${r.multiple}× salary`).join(', ')}; free cover limit {zar(s.rules.rules.free_cover_limit)}, maximum {zar(s.rules.rules.max_cover)}
                </p>
              )}
              <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-navy-700">
                {s.members} members · total cover {zar(s.covered)} <BasisBadge basis="calculated" /> · {s.above_fcl} above the free cover limit · premium about {zar(s.monthly_premium_estimate)} pm <BasisBadge basis="estimated" />
              </p>
            </div>
          ))}
          {!data.schemes.length && <p className="text-sm text-navy-500">No schemes.</p>}
        </Section>
        <Section title="Retirement funds">
          {data.funds.map((f) => (
            <div key={f.fund.id} className="mb-3 rounded-xl border border-navy-800/10 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                {staff ? (
                  <Link to={`/broker/funds/${f.fund.id}`} className="font-semibold text-brand-600">
                    {f.fund.name}
                  </Link>
                ) : (
                  <p className="font-semibold text-navy-900">{f.fund.name}</p>
                )}
                <Badge>{humanise(f.fund.fund_type)}</Badge>
              </div>
              <p className="text-xs text-navy-600">
                Administrator {f.administrator} · participation {f.participation_number ?? 'standalone'}
              </p>
              {f.rules && (
                <p className="mt-1 text-xs text-navy-700">
                  Contribution rules v{f.rules.version}: {Object.entries(f.rules.rules.categories).map(([c, r]) => `${c} ${r.employer_pct}% + ${r.employee_pct}%`).join(', ')}
                </p>
              )}
              <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-navy-700">
                {f.members} members · {zar(f.reported_value)} at {f.valuation_date ?? '–'} <BasisBadge basis="reported" />
              </p>
            </div>
          ))}
          {!data.funds.length && <p className="text-sm text-navy-500">No fund participations.</p>}
        </Section>
      </div>

      <MovementsPanel employerId={data.customer.id} movements={data.movements} staff={staff} actions={staff && data.schemes.length > 0 ? <ProcessMovements employerId={data.customer.id} /> : undefined} />

      {staff && data.reconciliations.length > 0 && (
        <Section title="Reconciliations">
          <Table head={['Period', 'Reconciliation', 'Difference', 'Open exceptions', 'Status']} minWidth={700}>
            {data.reconciliations.map((r) => (
              <tr key={r.run.id}>
                <Td>{r.run.reporting_period.slice(0, 7)}</Td>
                <Td>
                  <Link to={`/broker/controls/reconciliations/${r.run.id}`} className="font-medium text-brand-600">
                    {r.definition.name}
                  </Link>
                </Td>
                <Td>{zar(r.run.difference_total, true)}</Td>
                <Td>{r.open_exceptions}</Td>
                <Td>
                  <StatusBadge status={r.run.status} />
                </Td>
              </tr>
            ))}
          </Table>
        </Section>
      )}

      {data.benefit_events.length > 0 && (
        <Section title="Claims and benefit events">
          <Table head={['Member', 'Event', 'Arrangement', 'B-Covered status', 'Provider decision', 'Outstanding']} minWidth={900}>
            {data.benefit_events.map((e) => (
              <tr key={e.id}>
                <Td>
                  {staff ? (
                    <Link to={`/broker/people/${e.person_id}`} className="font-medium text-brand-600">
                      {e.person}
                    </Link>
                  ) : (
                    e.person
                  )}
                </Td>
                <Td>
                  {humanise(e.event_type)} · {formatDate(e.event_date)} {e.section_37c && <Badge tone="warning">Section 37C</Badge>}
                </Td>
                <Td className="text-xs">{humanise(e.arrangement)}</Td>
                <Td>
                  <span className="flex items-center gap-1.5 text-xs">
                    <SourceBadge source="broker" /> {humanise(e.broker_status)}
                  </span>
                </Td>
                <Td>
                  <span className="flex items-center gap-1.5 text-xs">
                    <SourceBadge source={e.arrangement === 'retirement_fund' ? 'administrator' : 'insurer'} /> {humanise(e.provider_decision ?? 'pending')}
                  </span>
                </Td>
                <Td className="text-xs">{e.outstanding_requirements.join('; ') || '–'}</Td>
              </tr>
            ))}
          </Table>
        </Section>
      )}

      {staff && data.imports.length > 0 && (
        <Section title="Recent imports">
          <ul className="space-y-1 text-sm">
            {data.imports.slice(0, 6).map((i) => (
              <li key={i.batch.id} className="flex justify-between gap-2">
                <Link to={`/broker/controls/imports/${i.batch.id}`} className="text-brand-600">
                  {i.batch.file_name}
                </Link>
                <span className="flex items-center gap-2 text-xs text-navy-600">
                  {formatDateTime(i.batch.created_at)} <StatusBadge status={i.batch.status} />
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  )
}
