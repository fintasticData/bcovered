import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { MemberMovement } from '@/server/db/benefitsSchema'
import { StatusBadge, humanise } from '@/components/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils'
import { BasisBadge, Section, Table, Td, zar } from '../shared/ui'

const show = (v: unknown) =>
  v && typeof v === 'object'
    ? Object.entries(v as Record<string, unknown>)
        .map(([k, x]) => `${humanise(k)}: ${typeof x === 'number' ? x.toLocaleString('en-ZA') : String(x ?? '–')}`)
        .join(' · ')
    : '–'

export function MovementsPanel({ movements, staff, actions }: { employerId: string; movements: MemberMovement[]; staff: boolean; actions?: ReactNode }) {
  return (
    <Section title={`Member movements (${movements.length})`} actions={actions}>
      {movements.length ? (
        <Table head={['Movement', 'Effective', 'Before', 'After', 'Group life cover', 'Status']} minWidth={900}>
          {movements.slice(0, 60).map((m) => (
            <tr key={m.id}>
              <Td>
                <Badge tone={m.movement_type === 'leaver' ? 'warning' : m.movement_type === 'joiner' ? 'success' : 'info'}>{humanise(m.movement_type)}</Badge>
                {staff && m.person_id && (
                  <Link to={`/broker/people/${m.person_id}`} className="ml-2 text-xs font-semibold text-brand-600">
                    Person
                  </Link>
                )}
              </Td>
              <Td className="text-xs">{formatDate(m.effective_date)}</Td>
              <Td className="text-xs">{show(m.before)}</Td>
              <Td className="text-xs">{show(m.after)}</Td>
              <Td className="text-xs">
                {m.cover_before !== null || m.cover_after !== null ? (
                  <span className="flex items-center gap-1.5">
                    {zar(m.cover_before)} → {zar(m.cover_after)} <BasisBadge basis="calculated" />
                  </span>
                ) : (
                  'Not recalculated yet'
                )}
              </Td>
              <Td>
                <StatusBadge status={m.status} />
              </Td>
            </tr>
          ))}
        </Table>
      ) : (
        <p className="text-sm text-navy-500">No movements yet. Commit a payroll import to detect joiners, leavers and salary changes.</p>
      )}
    </Section>
  )
}
