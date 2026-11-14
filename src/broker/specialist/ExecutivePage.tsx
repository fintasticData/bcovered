import { Link } from 'react-router-dom'
import { useExecutive, useOpportunities } from '@/api/hooks'
import { humanise } from '@/components/StatusBadge'
import { ErrorState, LoadingState, PageHeader } from '../PageHeader'
import { Notice, Page, Section, Stat, zar } from '../shared/ui'

export default function ExecutivePage() {
  const { data, isLoading, error } = useExecutive()
  const { data: opportunities = [] } = useOpportunities()
  if (isLoading) return <LoadingState />
  if (error || !data) return <div className="p-6"><ErrorState message={error?.message ?? 'Managers only'} /></div>
  const maxRevenue = Math.max(...data.revenue.by_period.map((p) => p.amount), 1)
  return (
    <Page wide>
      <PageHeader title="Executive dashboard" description="Consolidated across short-term, life, group risk and retirement. Premiums, fund contributions, assets and broker revenue are different measures and are never added together." />
      <Notice>Each tile states its basis. Reported figures come from insurers, administrators and managers; estimated and calculated figures are B-Covered’s own and are labelled so.</Notice>

      <Section title="Premiums (insurer income, not B-Covered revenue)">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Stat label="Individual life, annualised" value={zar(data.premiums.individual_life_annual)} hint={`${data.book.policies_in_force} policies in force`} basis="declared" />
          <Stat label="Group risk, annualised" value={zar(data.premiums.group_risk_annual_estimate)} hint="Scheme premium rate × covered salary roll" basis="estimated" />
          <Stat label="Short-term" value="Not shown" hint={data.premiums.short_term_note} />
        </div>
      </Section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="Fund contributions (member money, not revenue)">
          <div className="grid grid-cols-2 gap-3">
            <Stat label={`Expected ${data.contributions.period?.slice(0, 7) ?? ''}`} value={zar(data.contributions.expected, true)} basis="calculated" />
            <Stat label="Reported by administrators" value={zar(data.contributions.reported, true)} basis="reported" />
          </div>
        </Section>
        <Section title="Assets (held by funds, not B-Covered)">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Member values" value={zar(data.assets.member_values_reported)} hint={`at ${data.assets.member_values_date ?? '–'}`} basis="reported" />
            <Stat label="Portfolio market value" value={zar(data.assets.portfolio_value_reported)} hint={`at ${data.assets.portfolio_date ?? '–'}`} basis="reported" />
          </div>
        </Section>
      </div>

      <Section title="Broker revenue (commission and fees actually earned)">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_2fr]">
          <div className="space-y-2">
            <Stat label="Total recorded" value={zar(data.revenue.total, true)} basis="reported" />
            {data.revenue.by_type.map((t) => (
              <p key={t.type} className="flex justify-between text-xs text-navy-700">
                <span>{humanise(t.type)}</span>
                <span>{zar(t.amount, true)}</span>
              </p>
            ))}
          </div>
          <div className="space-y-1" role="img" aria-label="Revenue by month">
            {data.revenue.by_period.map((p) => (
              <div key={p.period} className="grid grid-cols-[5rem_1fr_6rem] items-center gap-2 text-xs">
                <span className="text-navy-600">{p.period.slice(0, 7)}</span>
                <div className="h-3 rounded bg-mist">
                  <div className="h-3 rounded bg-brand-500" style={{ width: `${(p.amount / maxRevenue) * 100}%` }} />
                </div>
                <span className="text-right text-navy-900">{zar(p.amount, true)}</span>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Section title="Processing and capacity">
          <ul className="space-y-1 text-sm text-navy-800">
            <li>{data.processing.imports} imports · {data.processing.reconciliations} reconciliations</li>
            <li>
              {data.processing.exceptions_open} open exceptions · {data.processing.exceptions_closed} closed
            </li>
            <li>{data.processing.approvals_pending} approvals pending</li>
            <li>{data.processing.jobs_completed} agent jobs completed</li>
            <li>Median approval turnaround: {data.processing.median_approval_hours === null ? '–' : `${data.processing.median_approval_hours} h`}</li>
          </ul>
        </Section>
        <Section title="Compliance">
          <ul className="space-y-1 text-sm text-navy-800">
            <li className={data.compliance.placed_without_roa ? 'text-red-700' : ''}>{data.compliance.placed_without_roa} placed policies without a signed-off Record of Advice</li>
            <li>{data.compliance.compliance_tasks_open} open compliance findings</li>
            <li>{data.compliance.advisers_long_term} advisers authorised for long-term insurance</li>
            <li>
              <Link to="/broker/compliance" className="font-semibold text-brand-600">
                {data.compliance.questions_open} regulatory questions open
              </Link>
            </li>
          </ul>
        </Section>
        <Section title="Book">
          <ul className="space-y-1 text-sm text-navy-800">
            <li>{data.book.people} people (one record each, across all roles)</li>
            <li>{data.book.employers} employer clients</li>
            <li>
              {data.book.schemes} group schemes · {data.book.funds} funds
            </li>
          </ul>
        </Section>
      </div>

      <Section title={`Growth opportunities (${opportunities.length})`}>
        <ul className="divide-y divide-navy-800/5 text-sm">
          {opportunities.slice(0, 10).map((o, i) => (
            <li key={i} className="flex flex-wrap justify-between gap-2 py-1.5">
              <Link to={o.to} className="font-medium text-brand-600">
                {o.label}
              </Link>
              <span className="text-xs text-navy-600">{o.detail}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] text-navy-500">Prompts for a broker to review, found by the Growth Agent from records already held. Not advice.</p>
      </Section>
    </Page>
  )
}
