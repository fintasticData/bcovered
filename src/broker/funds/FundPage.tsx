import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useFund, useReconcileBalance, useRecordProviderDecision, useUpdateBenefitStatus } from '@/api/hooks'
import type { FundDetail } from '@/api/client'
import { StatusBadge, humanise } from '@/components/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/utils'
import { ErrorState, LoadingState, PageHeader } from '../PageHeader'
import { BasisBadge, Notice, Page, Section, SourceBadge, Stat, Table, Td, zar } from '../shared/ui'

export default function FundPage() {
  const { fundId } = useParams()
  const { data, isLoading, error } = useFund(fundId)
  const roll = useReconcileBalance()
  const [query, setQuery] = useState('')
  if (isLoading) return <LoadingState />
  if (error || !data) return <div className="p-6"><ErrorState message={error?.message ?? 'Not found'} /></div>
  const members = data.members_view.filter((m) => !query || `${m.name} ${m.member_number}`.toLowerCase().includes(query.toLowerCase()))

  return (
    <Page wide>
      <PageHeader title={data.fund.name} description={`${humanise(data.fund.fund_type)} · administrator ${data.administrator} · registration ${data.fund.registration_number ?? '–'}`} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Active members" value={data.members} />
        <Stat label="Member values" value={zar(data.reported_value)} hint={`at ${data.valuation_date ?? '–'}`} basis="reported" />
        <Stat label="Vested component" value={zar(data.two_pot.vested)} basis="reported" />
        <Stat label="Savings component" value={zar(data.two_pot.savings)} hint={`${data.two_pot.may_qualify} members at or above the configured minimum`} basis="reported" />
        <Stat label="Retirement component" value={zar(data.two_pot.retirement)} basis="reported" />
      </div>
      {data.two_pot.rules && <Notice>Two-pot parameters come from dated configuration (effective {data.two_pot.rules.effective_from}). {data.two_pot.rules.source_note} B-Covered never authorises a withdrawal or determines tax.</Notice>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="Participating employers">
          <ul className="space-y-1 text-sm">
            {data.participations.map((p) => (
              <li key={p.id} className="flex justify-between gap-2">
                <Link to={`/broker/benefits/employers/${p.employer_id}`} className="font-medium text-brand-600">
                  {p.employer}
                </Link>
                <span className="text-xs text-navy-600">
                  {p.participation_number ?? 'standalone'} · {p.members} members
                </span>
              </li>
            ))}
          </ul>
          {data.portfolios.length > 0 && (
            <p className="mt-3 text-xs">
              Portfolios:{' '}
              {data.portfolios.map((p) => (
                <Link key={p.id} to={`/broker/investments/${p.id}`} className="font-semibold text-brand-600">
                  {p.name}
                </Link>
              ))}
            </p>
          )}
          {data.transfers.length > 0 && (
            <p className="mt-1 text-xs">
              Transfers:{' '}
              {data.transfers.map((t) => (
                <Link key={t.id} to={`/broker/transfers/${t.id}`} className="mr-2 font-semibold text-brand-600">
                  {t.transfer_type === 'section_14' ? 'Section 14' : 'Transfer'} ({humanise(t.stage)})
                </Link>
              ))}
            </p>
          )}
        </Section>
        <Section title="Balance statements and roll-forward">
          {data.statements.map((s) => (
            <div key={s.id} className="mb-3 rounded-xl border border-navy-800/10 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-navy-900">
                  {s.period_start} to {s.period_end}
                </p>
                <BasisBadge basis="reported" />
              </div>
              <dl className="mt-1 grid grid-cols-2 gap-x-4 text-xs text-navy-700">
                {(
                  [
                    ['Opening', s.opening_balance],
                    ['Contributions', s.contributions],
                    ['Transfers in', s.transfers_in],
                    ['Transfers out', -s.transfers_out],
                    ['Withdrawals', -s.withdrawals],
                    ['Benefit payments', -s.benefit_payments],
                    ['Investment returns', s.investment_returns],
                    ['Fees', -s.fees],
                    ['Closing (reported)', s.closing_balance],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <dt>{k}</dt>
                    <dd>{zar(v, true)}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" disabled={roll.isPending} onClick={() => roll.mutate(s.id)}>
                  Reconcile roll-forward
                </Button>
                {s.run && (
                  <Link to={`/broker/controls/reconciliations/${s.run.id}`} className={s.run.difference_total ? 'text-xs font-semibold text-red-700' : 'text-xs font-semibold text-emerald-700'}>
                    {s.run.difference_total ? `Difference ${zar(s.run.difference_total, true)}` : 'Reconciles'}
                  </Link>
                )}
              </div>
            </div>
          ))}
          {!data.statements.length && <p className="text-sm text-navy-500">No statements received.</p>}
        </Section>
      </div>

      <BenefitEvents data={data} />

      <Section title={`Members (${members.length})`} actions={<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or member number" className="field py-1.5 text-xs" />}>
        <Table head={['Member', 'Number', 'Employer', 'Vested', 'Savings', 'Retirement', 'Total', 'Valuation date', 'Savings withdrawal']} minWidth={1100}>
          {members.slice(0, 150).map((m) => (
            <tr key={m.membership_id}>
              <Td>
                <Link to={`/broker/people/${m.person_id}`} className="font-medium text-brand-600">
                  {m.name}
                </Link>
              </Td>
              <Td className="text-xs">{m.member_number}</Td>
              <Td className="text-xs">{m.employer}</Td>
              <Td>{zar(m.vested)}</Td>
              <Td>{zar(m.savings)}</Td>
              <Td>{zar(m.retirement)}</Td>
              <Td className="font-medium">{zar(m.total)}</Td>
              <Td className="text-xs">{m.valuation_date ?? '–'}</Td>
              <Td className="text-xs">{m.indicator === 'may_qualify' ? 'May qualify (administrator decides)' : m.indicator === 'below_minimum' ? 'Below configured minimum' : '–'}</Td>
            </tr>
          ))}
        </Table>
      </Section>
    </Page>
  )
}

function BenefitEvents({ data }: { data: FundDetail }) {
  const status = useUpdateBenefitStatus()
  const decide = useRecordProviderDecision()
  const [ref, setRef] = useState<Record<string, string>>({})
  return (
    <Section title="Benefit events">
      {data.events.length ? (
        <Table head={['Member', 'Event', 'B-Covered status', 'Administrator decision', 'Tax directive', 'Outstanding']} minWidth={1100}>
          {data.events.map((e) => (
            <tr key={e.id} className="align-top">
              <Td>
                <Link to={`/broker/people/${e.person_id}`} className="font-medium text-brand-600">
                  {e.person}
                </Link>
                {e.notes && <p className="text-[11px] text-navy-500">{e.notes}</p>}
              </Td>
              <Td>
                {humanise(e.event_type)} · {formatDate(e.event_date)} {e.section_37c && <Badge tone="warning">Section 37C</Badge>}
              </Td>
              <Td>
                <span className="flex items-center gap-1.5">
                  <SourceBadge source="broker" />
                  <select value={e.broker_status} onChange={(ev) => status.mutate({ event_id: e.id, broker_status: ev.target.value as typeof e.broker_status })} className="field py-1 text-xs" aria-label="B-Covered status">
                    {['notified', 'documents_outstanding', 'submitted', 'with_provider', 'closed'].map((s) => (
                      <option key={s} value={s}>
                        {humanise(s)}
                      </option>
                    ))}
                  </select>
                </span>
              </Td>
              <Td>
                <span className="flex items-center gap-1.5">
                  <SourceBadge source="administrator" /> <StatusBadge status={e.provider_decision ?? 'pending'} />
                </span>
                {e.provider_reference && <p className="text-[11px] text-navy-500">Ref {e.provider_reference}</p>}
                {e.amount_paid !== null && <p className="text-[11px] text-navy-500">Paid {zar(e.amount_paid, true)}</p>}
                {e.provider_decision === 'pending' && (
                  <div className="mt-1 flex gap-1">
                    <input value={ref[e.id] ?? ''} onChange={(ev) => setRef({ ...ref, [e.id]: ev.target.value })} placeholder="Administrator reference" className="field py-1 text-xs" />
                    <Button size="sm" variant="outline" disabled={(ref[e.id] ?? '').length < 3} onClick={() => decide.mutate({ event_id: e.id, decision: 'admitted', decision_date: new Date().toISOString().slice(0, 10), provider_reference: ref[e.id] })}>
                      Record admitted
                    </Button>
                  </div>
                )}
              </Td>
              <Td className="text-xs">{humanise(e.tax_directive_status ?? 'not_required')}</Td>
              <Td className="text-xs">{e.outstanding_requirements.join('; ') || '–'}</Td>
            </tr>
          ))}
        </Table>
      ) : (
        <p className="text-sm text-navy-500">No benefit events.</p>
      )}
      {(status.error || decide.error) && <p className="mt-2 text-xs text-red-600">{(status.error ?? decide.error)!.message}</p>}
    </Section>
  )
}
