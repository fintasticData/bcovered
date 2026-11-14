import { useState, type FormEvent } from 'react'
import { Mail, Trash2 } from 'lucide-react'
import type { CreatedInvitation } from '@/api/client'
import { useChangeMemberRole, useInviteMember, useRemoveMember, useRevokeInvitation, useTeam } from '@/api/hooks'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { formatDateTime } from '@/lib/utils'
import type { MemberRole } from '@/server/db/onboardingSchema'
import { ROLE_LABEL } from '@/server/onboarding/config'
import { InvitationCreated } from '@/onboarding/sections'
import { textInput } from '@/onboarding/ui'
import { ErrorState, LoadingState, PageHeader } from '../PageHeader'
import { Page, Section, Table, Td } from '../shared/ui'

const ROLES = Object.keys(ROLE_LABEL) as MemberRole[]

export default function TeamPage() {
  const { data, isLoading, error } = useTeam()
  const invite = useInviteMember()
  const revoke = useRevokeInvitation()
  const change = useChangeMemberRole()
  const remove = useRemoveMember()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<MemberRole>('representative')
  const [created, setCreated] = useState<CreatedInvitation | null>(null)
  if (isLoading) return <div className="p-6"><LoadingState /></div>
  if (error || !data) return <div className="p-6"><ErrorState message={error?.message ?? 'Could not load the team'} /></div>
  const canManage = data.capabilities.includes('manage_team')
  const isOwner = data.member_role === 'brokerage_owner'
  const actionError = invite.error?.message ?? change.error?.message ?? remove.error?.message ?? revoke.error?.message

  const submit = (e: FormEvent) => {
    e.preventDefault()
    invite.mutate({ email, role }, { onSuccess: (c) => { setCreated(c); setEmail('') } })
  }

  return (
    <Page>
      <PageHeader title="Team" description="People who work in this brokerage and their roles. Roles are enforced by the service layer on every call, not only in the screen." />
      {actionError && <ErrorState message={actionError} />}
      <div className="panel overflow-hidden">
        <Table head={['Person', 'Role', 'Status', '']} minWidth={640}>
          {data.members.map((m) => (
            <tr key={m.membership_id}>
              <Td>
                {m.full_name} {m.is_you && <span className="text-xs text-navy-500">(you)</span>}
                <span className="block text-[11px] text-navy-500">{m.email}</span>
              </Td>
              <Td>
                {canManage && !m.is_you && (isOwner || m.role !== 'brokerage_owner') ? (
                  <select aria-label={`Role for ${m.full_name}`} className={`${textInput} max-w-56`} value={m.role} onChange={(e) => change.mutate({ membership_id: m.membership_id, role: e.target.value as MemberRole })}>
                    {ROLES.filter((r) => isOwner || r !== 'brokerage_owner').map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                ) : (
                  m.role_label
                )}
              </Td>
              <Td>
                <StatusBadge status={m.status} />
              </Td>
              <Td className="text-right">
                {canManage && !m.is_you && (isOwner || m.role !== 'brokerage_owner') && (
                  <Button size="icon" variant="ghost" aria-label={`Remove ${m.full_name}`} onClick={() => remove.mutate(m.membership_id)}>
                    <Trash2 />
                  </Button>
                )}
              </Td>
            </tr>
          ))}
        </Table>
      </div>
      <Section title="Invitations">
        {canManage && (
          <form onSubmit={submit} className="mb-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
            <input aria-label="Email" type="email" className={textInput} placeholder="colleague@yourbrokerage.co.za" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <select aria-label="Role" className={textInput} value={role} onChange={(e) => setRole(e.target.value as MemberRole)}>
              {ROLES.filter((r) => isOwner || r !== 'brokerage_owner').map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
            <Button type="submit" variant="accent" disabled={invite.isPending}>
              <Mail /> Invite
            </Button>
          </form>
        )}
        {created && <div className="mb-3"><InvitationCreated created={created} /></div>}
        {data.invitations.length === 0 ? (
          <p className="text-xs text-navy-600">No invitations yet.</p>
        ) : (
          <ul className="space-y-1.5 text-xs text-navy-700">
            {data.invitations.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {i.email} · {i.role_label} · sent {formatDateTime(i.created_at)} · expires {formatDateTime(i.expires_at)}
                </span>
                <span className="flex items-center gap-2">
                  <StatusBadge status={i.state} />
                  {canManage && i.state === 'valid' && i.kind === 'team' && (
                    <button type="button" className="cursor-pointer font-semibold text-red-600 underline" onClick={() => revoke.mutate(i.id)}>
                      Revoke
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </Page>
  )
}
