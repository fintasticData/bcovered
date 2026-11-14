import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Ban, RotateCcw } from 'lucide-react'
import { api } from '@/api/client'
import { useBrokerageAdmin, usePlatformAction } from '@/api/hooks'
import { StatusBadge } from '@/components/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDateTime } from '@/lib/utils'
import { MODULE_LABEL, PACKAGES } from '@/server/onboarding/config'
import { ErrorState, LoadingState } from '@/broker/PageHeader'
import { Page, Section } from '@/broker/shared/ui'
import { auditReason, textInput } from '@/onboarding/ui'

export default function BrokeragePage() {
  const { organisationId } = useParams()
  const { data: view, isLoading, error } = useBrokerageAdmin(organisationId)
  const suspend = usePlatformAction(api.platformAdmin.suspend)
  const reinstate = usePlatformAction(api.platformAdmin.reinstate)
  const disable = usePlatformAction(api.insurers.disable)
  const [reason, setReason] = useState('')
  if (isLoading) return <div className="p-6"><LoadingState /></div>
  if (error || !view) return <div className="p-6"><ErrorState message={error?.message ?? 'Could not load the brokerage'} /></div>
  const org = view.organisation
  const isAdmin = view.platform_role === 'platform_admin'
  const actionError = suspend.error?.message ?? reinstate.error?.message ?? disable.error?.message

  return (
    <Page wide>
      <Link to="/platform/brokerages" className="inline-flex items-center gap-1 text-xs font-semibold text-navy-600 hover:text-brand-600">
        <ArrowLeft className="h-3.5 w-3.5" /> Brokerages
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-navy-900">{org.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-navy-600">
            <StatusBadge status={org.lifecycle_status} /> {org.legal_name ?? ''} {org.registration_number && `· ${org.registration_number}`} {org.fsp_number && `· FSP ${org.fsp_number} (declared)`}
            {org.is_demo && <Badge tone="warning">Demo data</Badge>}
          </p>
          {org.status_reason && <p className="mt-1 text-xs text-navy-600">Reason: {org.status_reason}</p>}
          {org.retention_until && <p className="text-xs text-navy-600">Records retained until {org.retention_until}</p>}
        </div>
        {view.application && (
          <Button variant="outline" asChild>
            <Link to={`/platform/onboarding/${view.application.id}`}>Open onboarding review</Link>
          </Button>
        )}
      </div>

      {isAdmin && (org.lifecycle_status === 'active' || org.lifecycle_status === 'suspended') && (
        <Section title={org.lifecycle_status === 'active' ? 'Suspend brokerage' : 'Reinstate brokerage'}>
          <p className="mb-2 text-xs text-navy-600">
            {org.lifecycle_status === 'active'
              ? 'Suspension blocks every member from operational records, quoting and imports immediately. All records are kept for the retention period.'
              : 'Reinstating restores operational access for active members.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <input aria-label="Reason" className={`${textInput} max-w-md`} placeholder="Reason (recorded in the audit trail)" value={reason} onChange={(e) => setReason(e.target.value)} />
            {org.lifecycle_status === 'active' ? (
              <Button variant="danger" disabled={!reason.trim() || suspend.isPending} onClick={() => suspend.mutate({ organisation_id: org.id, reason }, { onSuccess: () => setReason('') })}>
                <Ban /> Suspend
              </Button>
            ) : (
              <Button variant="accent" disabled={!reason.trim() || reinstate.isPending} onClick={() => reinstate.mutate({ organisation_id: org.id, reason }, { onSuccess: () => setReason('') })}>
                <RotateCcw /> Reinstate
              </Button>
            )}
          </div>
          {actionError && <p className="mt-2 text-xs text-red-600">{actionError}</p>}
        </Section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Team">
          <ul className="space-y-1 text-sm">
            {view.team.members.map((m) => (
              <li key={m.membership_id} className="flex items-center justify-between gap-2">
                <span>
                  {m.full_name} <span className="text-xs text-navy-500">{m.email}</span>
                </span>
                <Badge tone="accent">{m.role_label}</Badge>
              </li>
            ))}
          </ul>
          {view.team.invitations.length > 0 && <p className="mt-2 text-xs text-navy-600">{view.team.invitations.filter((i) => i.state === 'valid').length} pending invitation(s)</p>}
        </Section>
        <Section title="Products and terms">
          <ul className="space-y-1 text-sm">
            {view.modules.map((m) => (
              <li key={m.id} className="flex items-center justify-between">
                {MODULE_LABEL[m.module]} <StatusBadge status={m.status} />
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-navy-600">{view.terms ? `Package ${PACKAGES.find((p) => p.key === view.terms!.package_key)?.label ?? view.terms.package_key}, agreed ${formatDateTime(view.terms.agreed_at ?? view.terms.created_at)}` : 'No commercial terms agreed'}</p>
        </Section>
        <Section title="Insurer access">
          <ul className="space-y-2 text-sm">
            {view.insurers.length === 0 && <li className="text-xs text-navy-600">No insurer relationships recorded.</li>}
            {view.insurers.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {a.insurer_name} · {MODULE_LABEL[a.product_module]}
                  <span className="block text-xs text-navy-500">
                    Code {a.intermediary_code ?? '–'} · credentials {a.credential_hint ?? 'none'} {!a.supported && '· no integration'}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <StatusBadge status={a.status} />
                  {isAdmin && a.status === 'enabled' && (
                    <Button size="sm" variant="ghost" onClick={() => disable.mutate({ access_id: a.id, reason: 'Disabled by B-Covered platform administration' })}>
                      Disable
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Section>
        <Section title="Audit trail (access and onboarding actions)">
          <ul className="scroll-area max-h-80 space-y-1">
            {view.audit.map((e) => (
              <li key={e.id} className="text-[11px] text-navy-700">
                <span className="font-medium">{e.action}</span> · {e.actor_name} · {formatDateTime(e.created_at)} {e.actor_scope === 'platform' && <Badge tone="accent">platform</Badge>}
                {auditReason(e.after) && <span className="block text-navy-500">Reason: {auditReason(e.after)}</span>}
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </Page>
  )
}
