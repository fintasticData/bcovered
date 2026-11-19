import { Link } from 'react-router-dom'
import { ExternalLink, MailPlus, ShieldAlert } from 'lucide-react'
import { useBrokerages, useMe } from '@/api/hooks'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { formatDateTime } from '@/lib/utils'
import { MODULE_LABEL } from '@/server/onboarding/config'
import { ErrorState, LoadingState, PageHeader } from '@/broker/PageHeader'
import { Notice, Page, RowLink, Table, Td } from '@/broker/shared/ui'

export default function BrokeragesPage() {
  const { data = [], isLoading, error } = useBrokerages()
  const { data: me } = useMe()
  const isAdmin = me?.platform_role === 'platform_admin'

  return (
    <Page wide>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="Brokerages"
          description="Every brokerage workspace on the platform. Open a row to review access, onboarding and insurer enablement. Platform staff never open a brokerage’s clients or policies from here."
        />
        {isAdmin && (
          <Button variant="accent" asChild>
            <Link to="/platform/invitations">
              <MailPlus /> Invite a brokerage
            </Link>
          </Button>
        )}
      </div>

      {!isAdmin && (
        <Notice tone="warning">
          You are signed in as <strong>{me?.platform_role ? me.platform_role.replaceAll('_', ' ') : 'platform staff'}</strong>. Open a brokerage to
          edit details and team (reviewers and admins). Suspend, reinstate and owner invitations need a <strong>platform administrator</strong>.
        </Notice>
      )}
      {isAdmin && (
        <Notice>
          <strong>Create</strong> = invite an owner. <strong>Open</strong> a brokerage to update details, add/edit/remove staff, change product
          modules, suspend/reinstate, and disable insurers.
        </Notice>
      )}

      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error.message} />
      ) : data.length === 0 ? (
        <div className="panel flex items-start gap-3 p-6 text-sm text-navy-700">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <div>
            <p className="font-semibold text-navy-900">No brokerages yet</p>
            <p className="mt-1 text-xs text-navy-600">
              {isAdmin ? (
                <>
                  Start with <Link to="/platform/invitations" className="font-semibold text-brand-600 underline">Invite a brokerage</Link>.
                </>
              ) : (
                'Ask a platform administrator to invite an owner.'
              )}
            </p>
          </div>
        </div>
      ) : (
        <div className="panel overflow-hidden">
          <Table head={['Brokerage', 'Workspace', 'Application', 'Owner', 'Team', 'Modules enabled', 'Insurers enabled', '']} minWidth={1080}>
            {data.map((b) => (
              <tr key={b.organisation.id}>
                <Td>
                  <RowLink to={`/platform/brokerages/${b.organisation.id}`}>{b.organisation.name}</RowLink>
                  <span className="block text-[11px] text-navy-500">
                    {b.organisation.activated_at ? `Active since ${formatDateTime(b.organisation.activated_at)}` : `Created ${formatDateTime(b.organisation.created_at)}`}
                  </span>
                </Td>
                <Td>
                  <StatusBadge status={b.organisation.lifecycle_status} />
                </Td>
                <Td>{b.application_status ? <StatusBadge status={b.application_status} /> : <span className="text-xs text-navy-400">set up before onboarding</span>}</Td>
                <Td>{b.owner ?? '–'}</Td>
                <Td>{b.members}</Td>
                <Td className="text-xs">{b.modules_enabled.map((m) => MODULE_LABEL[m]).join(', ') || '–'}</Td>
                <Td>{b.insurers_enabled}</Td>
                <Td className="text-right">
                  <Button size="sm" variant="ghost" asChild>
                    <Link to={`/platform/brokerages/${b.organisation.id}`} aria-label={`Open ${b.organisation.name}`}>
                      Open <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </Td>
              </tr>
            ))}
          </Table>
        </div>
      )}
    </Page>
  )
}
