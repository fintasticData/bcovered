import { Link } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import type { CoverClassSummary } from '@/api/client'
import { useCommercialCover } from '@/api/hooks'
import { AdviceNotice, COVERAGE_LABEL } from '@/components/commercial/badges'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { BUSINESS_COVER_AREAS } from '@/data/business'
import { cn } from '@/lib/utils'
import type { CoverageStatus } from '@/server/db/commercialSchema'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../PageHeader'
import { lensPath } from '../russ/lenses'
import { Page, Section, Stat, Table, Td } from '../shared/ui'
import { ShortTermPolicyTable } from '../shortterm/PolicyTable'

const BAR: Record<CoverageStatus, string> = {
  awaiting_broker_review: 'bg-amber-400',
  unknown: 'bg-navy-300',
  potentially_covered: 'bg-sky-400',
  confirmed_covered: 'bg-emerald-500',
  confirmed_excluded: 'bg-red-500',
}
const ORDER = Object.keys(BAR) as CoverageStatus[]
const AREA = new Map(BUSINESS_COVER_AREAS.map((a) => [a.group, a]))

function CoverageBar({ coverage, total }: { coverage: Record<CoverageStatus, number>; total: number }) {
  if (!total) return <span className="text-xs text-navy-500">–</span>
  return (
    <div className="w-40">
      <div className="flex h-2 overflow-hidden rounded-full bg-navy-50" role="img" aria-label={ORDER.filter((k) => coverage[k]).map((k) => `${coverage[k]} ${COVERAGE_LABEL[k]}`).join(', ')}>
        {ORDER.map((k) => (coverage[k] ? <span key={k} className={BAR[k]} style={{ width: `${(coverage[k] / total) * 100}%` }} title={`${COVERAGE_LABEL[k]}: ${coverage[k]}`} /> : null))}
      </div>
      <p className="mt-0.5 text-[11px] text-navy-500">
        {total} exposure{total === 1 ? '' : 's'}
        {coverage.awaiting_broker_review + coverage.unknown > 0 && ` · ${coverage.awaiting_broker_review + coverage.unknown} unconfirmed`}
      </p>
    </div>
  )
}

function Clients({ list }: { list: CoverClassSummary['exposed_clients'] }) {
  if (!list.length) return <span className="text-xs text-navy-500">None identified</span>
  return (
    <span className="text-xs">
      {list.slice(0, 3).map((c, i) => (
        <span key={c.profile_id}>
          {i > 0 && ', '}
          <Link to={`/broker/commercial/risk-twins/${c.profile_id}`} className="font-medium text-brand-600 underline-offset-2 hover:underline">
            {c.name}
          </Link>
        </span>
      ))}
      {list.length > 3 && <span className="text-navy-500"> +{list.length - 3} more</span>}
    </span>
  )
}

export default function CoverPage() {
  const { data, isLoading, error } = useCommercialCover()
  if (isLoading) return <div className="p-6"><LoadingState /></div>
  if (error || !data) return <div className="p-6"><ErrorState message={error?.message ?? 'Could not load commercial cover'} /></div>
  const unconfirmed = data.areas.reduce((s, a) => s + a.unconfirmed, 0)

  return (
    <Page>
      <PageHeader
        title="Commercial cover"
        description="Potential exposures across your business clients, grouped into the six cover areas on the public site. Agents identify exposures from each Risk Twin; a broker confirms whether they are covered."
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link to={lensPath('commercial', 'Which Risk Twins need attention?')}>
              <Sparkles /> Ask Russ · Commercial
            </Link>
          </Button>
        }
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Business clients" value={data.clients} />
        <Stat label="With a Risk Twin" value={data.clients_with_twin} hint={data.clients > data.clients_with_twin ? `${data.clients - data.clients_with_twin} still to build` : undefined} />
        <Stat label="Unconfirmed exposures" value={unconfirmed} tone={unconfirmed ? 'warning' : undefined} hint="Unknown or awaiting broker review" />
        <Stat label="Commercial policies on record" value={data.policies.length} />
      </div>
      <AdviceNotice />
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-navy-600" aria-label="Coverage status colours">
        {ORDER.map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className={cn('h-2 w-2 rounded-full', BAR[k])} aria-hidden /> {COVERAGE_LABEL[k]}
          </span>
        ))}
      </div>

      {data.clients_with_twin === 0 && (
        <EmptyState title="No Risk Twins yet">
          Build a Risk Twin from{' '}
          <Link to="/broker/commercial/risk-twins" className="font-semibold text-brand-600">
            Risk Twins
          </Link>{' '}
          to see exposures by cover area.
        </EmptyState>
      )}

      {data.areas.map((area) => {
        const meta = AREA.get(area.group)
        const active = area.classes.filter((c) => c.exposures > 0 || c.sections_on_record > 0)
        const quiet = area.classes.filter((c) => !active.includes(c))
        return (
          <Section
            key={area.group}
            title={
              <span className="flex items-center gap-2">
                {meta && (
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-business-50 text-business-600">
                    <meta.icon className="h-3.5 w-3.5" />
                  </span>
                )}
                {meta?.title ?? area.group}
                <span className="text-xs font-normal text-navy-500">{meta?.short}</span>
              </span>
            }
            actions={
              <>
                <Badge tone="neutral">{area.exposed_clients} client{area.exposed_clients === 1 ? '' : 's'} exposed</Badge>
                {area.unconfirmed > 0 && <Badge tone="warning">{area.unconfirmed} unconfirmed</Badge>}
              </>
            }
          >
            {active.length > 0 ? (
              <Table head={['Cover class', 'Clients with this exposure', 'Coverage status', 'Sections on record']} minWidth={820}>
                {active.map((c) => (
                  <tr key={c.key}>
                    <Td className="w-[38%]">
                      <span className="font-medium text-navy-900">{c.label}</span>
                      <p className="text-[11px] text-navy-500">{c.description}</p>
                    </Td>
                    <Td className="w-[26%]">
                      <Clients list={c.exposed_clients} />
                    </Td>
                    <Td className="w-[22%]">
                      <CoverageBar coverage={c.coverage} total={c.exposures} />
                    </Td>
                    <Td className={cn('w-[14%] text-xs', !c.sections_on_record && 'text-navy-500')}>{c.sections_on_record ? `${c.sections_on_record} client${c.sections_on_record === 1 ? '' : 's'}` : 'None'}</Td>
                  </tr>
                ))}
              </Table>
            ) : (
              <p className="text-xs text-navy-600">No exposures or policy sections recorded in this area yet.</p>
            )}
            {quiet.length > 0 && active.length > 0 && <p className="mt-2 text-[11px] text-navy-500">Also in this area: {quiet.map((c) => c.label).join(', ')}.</p>}
          </Section>
        )
      })}

      <ShortTermPolicyTable rows={data.policies} title="Commercial policies" />
    </Page>
  )
}
