import { Link } from 'react-router-dom'
import { useCompliance } from '@/api/hooks'
import { StatusBadge, humanise } from '@/components/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { formatDate, formatDateTime } from '@/lib/utils'
import { ErrorState, LoadingState, PageHeader } from '../PageHeader'
import { Notice, Page, Section, Table, Td } from '../shared/ui'

export default function CompliancePage() {
  const { data, isLoading, error } = useCompliance()
  if (isLoading) return <LoadingState />
  if (error || !data) return <div className="p-6"><ErrorState message={error?.message ?? 'Not found'} /></div>
  return (
    <Page>
      <PageHeader title="Compliance register" description="Regulatory questions that must be answered before production activation, adviser authorisations, and the Compliance Agent’s open findings." />
      <Notice tone="warning">The platform tracks these questions and enforces the guardrails configured for them. It does not answer them: the compliance officer, key individual or information officer must.</Notice>
      <Section title={`Open regulatory questions (${data.questions.filter((q) => q.status === 'open').length})`}>
        <ul className="space-y-3">
          {data.questions.map((q) => (
            <li key={q.id} className="rounded-xl border border-navy-800/10 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-navy-900">
                  <Badge tone="info">{q.topic}</Badge> {q.question}
                </p>
                <StatusBadge status={q.status} />
              </div>
              <p className="mt-1 text-xs text-navy-700">{q.why}</p>
              <p className="mt-1 text-[11px] text-navy-500">
                Owner: {q.owner} · Blocks: {q.blocks.join('; ')}
              </p>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Adviser authorisations (FAIS product categories)">
        <Table head={['Representative', 'Role', 'Categories', 'Valid from']} minWidth={760}>
          {data.advisers.map((a) => (
            <tr key={a.user_id}>
              <Td className="font-medium">{a.name}</Td>
              <Td className="text-xs">{humanise(a.role)}</Td>
              <Td>
                <div className="flex flex-wrap gap-1">
                  {a.categories.map((c) => (
                    <Badge key={c.id} tone={c.status === 'active' ? 'success' : 'warning'}>
                      {c.label}
                    </Badge>
                  ))}
                </div>
              </Td>
              <Td className="text-xs">{formatDate(a.categories.map((c) => c.effective_from).sort()[0])}</Td>
            </tr>
          ))}
        </Table>
        <p className="mt-2 text-[11px] text-navy-500">Seeded demonstration values. The real categories must come from the FSP licence and the representative register.</p>
      </Section>
      <Section title={`Compliance Agent findings (${data.findings.length})`}>
        {data.findings.length ? (
          <ul className="space-y-1 text-sm">
            {data.findings.map((f) => (
              <li key={f.id} className="flex flex-wrap justify-between gap-2">
                {f.link ? (
                  <Link to={f.link} className="font-medium text-brand-600">
                    {f.title}
                  </Link>
                ) : (
                  <span>{f.title}</span>
                )}
                <span className="text-xs text-navy-500">{formatDateTime(f.created_at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-navy-500">No open findings. Run the life servicing scan to check placed policies for missing advice records.</p>
        )}
      </Section>
    </Page>
  )
}
