import { useState, type FormEvent } from 'react'
import { ChevronDown, ChevronRight, Mail, Pencil, Trash2, UserPlus, X } from 'lucide-react'
import type { CreatedInvitation } from '@/api/client'
import { useChangeMemberRole, useInviteMember, useRemoveMember, useRevokeInvitation, useTeam, useUpdateMemberFais } from '@/api/hooks'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { formatDateTime } from '@/lib/utils'
import type { FaisAppointmentStatus, FaisCapacity, MemberRole } from '@/server/db/onboardingSchema'
import { FAIS_CAPACITY_LABEL, FAIS_STATUS_LABEL, LICENCE_CATEGORIES, ROLE_LABEL } from '@/server/onboarding/config'
import { InvitationCreated } from '@/onboarding/sections'
import { textInput } from '@/onboarding/ui'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../PageHeader'
import { Page, Section, Table, Td } from '../shared/ui'

/** Prefer relationship-handling roles first when inviting colleagues. */
const ROLES = (['agent', 'sub_broker', 'representative', 'operations_admin', 'brokerage_admin', 'compliance_reviewer', 'read_only', 'brokerage_owner'] as MemberRole[]).filter(
  (r) => r in ROLE_LABEL,
)

const CAPACITIES = Object.keys(FAIS_CAPACITY_LABEL) as FaisCapacity[]
const STATUSES = Object.keys(FAIS_STATUS_LABEL) as FaisAppointmentStatus[]

type TeamMemberRow = {
  membership_id: string
  full_name: string
  email: string
  is_you: boolean
  role: MemberRole
  role_label: string
  status: string
  fais_capacity: FaisCapacity | null
  fais_capacity_label: string | null
  fais_status: FaisAppointmentStatus | null
  dofa_date: string | null
  authorised_licence_categories: string[]
}

function faisSummary(m: TeamMemberRow): string {
  const parts: string[] = []
  if (m.fais_capacity_label) parts.push(m.fais_capacity_label)
  else if (m.fais_capacity) parts.push(FAIS_CAPACITY_LABEL[m.fais_capacity])
  if (m.fais_status) parts.push(FAIS_STATUS_LABEL[m.fais_status])
  if (m.dofa_date) parts.push(`DOFA ${m.dofa_date}`)
  if (m.authorised_licence_categories.length) {
    parts.push(`${m.authorised_licence_categories.length} categor${m.authorised_licence_categories.length === 1 ? 'y' : 'ies'}`)
  }
  return parts.length ? parts.join(' · ') : 'Not set'
}

function canEditMember(m: TeamMemberRow, canManage: boolean, isOwner: boolean) {
  return canManage && !m.is_you && (isOwner || m.role !== 'brokerage_owner')
}

export default function TeamPage() {
  const { data, isLoading, error } = useTeam()
  const invite = useInviteMember()
  const revoke = useRevokeInvitation()
  const change = useChangeMemberRole()
  const updateFais = useUpdateMemberFais()
  const remove = useRemoveMember()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<MemberRole>('agent')
  const [inviteOpen, setInviteOpen] = useState(true)
  const [created, setCreated] = useState<CreatedInvitation | null>(null)
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null)
  const [draftRole, setDraftRole] = useState<MemberRole>('agent')
  const [editingFaisId, setEditingFaisId] = useState<string | null>(null)

  if (isLoading) return <div className="p-6"><LoadingState /></div>
  if (error || !data) return <div className="p-6"><ErrorState message={error?.message ?? 'Could not load the team'} /></div>

  const canManage = data.capabilities.includes('manage_team')
  const isOwner = data.member_role === 'brokerage_owner'
  const canViewFais = canManage || data.member_role === 'compliance_reviewer'
  const actionError = invite.error?.message ?? change.error?.message ?? remove.error?.message ?? revoke.error?.message ?? updateFais.error?.message
  const inviteRoles = ROLES.filter((r) => isOwner || r !== 'brokerage_owner')
  const editingFaisMember = data.members.find((m) => m.membership_id === editingFaisId) ?? null

  const submitInvite = (e: FormEvent) => {
    e.preventDefault()
    invite.mutate({ email, role }, { onSuccess: (c) => { setCreated(c); setEmail('') } })
  }

  const startRoleEdit = (m: TeamMemberRow) => {
    setEditingFaisId(null)
    setEditingRoleId(m.membership_id)
    setDraftRole(m.role)
  }

  const saveRole = () => {
    if (!editingRoleId) return
    change.mutate(
      { membership_id: editingRoleId, role: draftRole },
      { onSuccess: () => setEditingRoleId(null) },
    )
  }

  const startFaisEdit = (membershipId: string) => {
    setEditingRoleId(null)
    setEditingFaisId((prev) => (prev === membershipId ? null : membershipId))
  }

  const confirmRemove = (m: TeamMemberRow) => {
    if (!window.confirm(`Remove ${m.full_name} from this brokerage?`)) return
    remove.mutate(m.membership_id)
  }

  return (
    <Page>
      <PageHeader
        title="Team"
        description="People who work in this brokerage. Roles control platform access; FAIS appointments record appointment under this FSP."
        actions={
          canManage ? (
            <Button
              type="button"
              variant="accent"
              onClick={() => setInviteOpen((o) => !o)}
              aria-expanded={inviteOpen}
            >
              <UserPlus /> Invite person
            </Button>
          ) : undefined
        }
      />

      {!canManage && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Inviting, changing roles and removing people is limited to <strong>brokerage owner</strong> and <strong>brokerage administrator</strong>. You are viewing as{' '}
          <strong>{ROLE_LABEL[data.member_role] ?? data.member_role}</strong>.
        </p>
      )}
      {actionError && <ErrorState message={actionError} />}

      {canManage && inviteOpen && (
        <Section title="Invite a person" actions={
          <Button type="button" size="sm" variant="ghost" onClick={() => setInviteOpen(false)} aria-label="Close invite">
            <X className="h-4 w-4" />
          </Button>
        }>
          <form onSubmit={submitInvite} className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
            <input
              aria-label="Email"
              type="email"
              className={textInput}
              placeholder="colleague@yourbrokerage.co.za"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <select aria-label="Role" className={textInput} value={role} onChange={(e) => setRole(e.target.value as MemberRole)}>
              {inviteRoles.map((r) => (
                <option key={r} value={r}>{ROLE_LABEL[r]}</option>
              ))}
            </select>
            <Button type="submit" variant="accent" disabled={invite.isPending || !email.trim()}>
              <Mail /> Send invite
            </Button>
          </form>
          <p className="mt-2 text-[11px] text-navy-500">
            They receive a private invitation link. Assign client-facing people as Broker / representative only when appointed under this FSP.
          </p>
          {created && <div className="mt-3"><InvitationCreated created={created} /></div>}
        </Section>
      )}

      <Section
        title={`People (${data.members.length})`}
        actions={
          canManage && !inviteOpen ? (
            <Button type="button" size="sm" variant="outline" onClick={() => setInviteOpen(true)}>
              <UserPlus /> Invite
            </Button>
          ) : undefined
        }
      >
        {data.members.length === 0 ? (
          <EmptyState title="No people on this team yet">
            {canManage ? 'Use Invite person to add the first colleague.' : 'Ask an owner or administrator to invite you or colleagues.'}
          </EmptyState>
        ) : (
          <>
            <div className="overflow-hidden rounded-xl border border-navy-800/10">
              <Table head={canViewFais ? ['Person', 'Role', 'FAIS', 'Status', ''] : ['Person', 'Role', 'Status', '']} minWidth={canViewFais ? 720 : 560}>
                {data.members.map((m) => {
                  const editable = canEditMember(m, canManage, isOwner)
                  const roleEditing = editingRoleId === m.membership_id
                  const faisOpen = editingFaisId === m.membership_id
                  return (
                    <tr key={m.membership_id} className={faisOpen || roleEditing ? 'bg-mist/60' : undefined}>
                      <Td>
                        <span className="font-medium text-navy-900">
                          {m.full_name} {m.is_you && <span className="text-xs font-normal text-navy-500">(you)</span>}
                        </span>
                        <span className="block text-[11px] text-navy-500">{m.email}</span>
                      </Td>
                      <Td>
                        {roleEditing ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <select
                              aria-label={`New role for ${m.full_name}`}
                              className={`${textInput} max-w-56`}
                              value={draftRole}
                              onChange={(e) => setDraftRole(e.target.value as MemberRole)}
                              disabled={change.isPending}
                            >
                              {inviteRoles.map((r) => (
                                <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                              ))}
                            </select>
                            <Button type="button" size="sm" variant="accent" disabled={change.isPending} onClick={saveRole}>
                              Save
                            </Button>
                            <Button type="button" size="sm" variant="ghost" disabled={change.isPending} onClick={() => setEditingRoleId(null)}>
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <span className="text-navy-800">{m.role_label}</span>
                        )}
                      </Td>
                      {canViewFais && (
                        <Td>
                          {canManage ? (
                            <button
                              type="button"
                              className="group flex max-w-xs cursor-pointer items-start gap-1 text-left text-xs text-navy-700 hover:text-navy-900"
                              onClick={() => startFaisEdit(m.membership_id)}
                              aria-expanded={faisOpen}
                            >
                              {faisOpen ? <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                              <span className="underline-offset-2 group-hover:underline">{faisSummary(m)}</span>
                            </button>
                          ) : (
                            <span className="max-w-xs text-xs text-navy-700">{faisSummary(m)}</span>
                          )}
                        </Td>
                      )}
                      <Td>
                        <StatusBadge status={m.status} />
                      </Td>
                      <Td className="text-right">
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          {editable && !roleEditing && (
                            <Button type="button" size="sm" variant="ghost" onClick={() => startRoleEdit(m)} aria-label={`Change role for ${m.full_name}`}>
                              <Pencil className="h-3.5 w-3.5" /> Role
                            </Button>
                          )}
                          {editable && (
                            <Button type="button" size="icon" variant="ghost" aria-label={`Remove ${m.full_name}`} onClick={() => confirmRemove(m)}>
                              <Trash2 />
                            </Button>
                          )}
                        </div>
                      </Td>
                    </tr>
                  )
                })}
              </Table>
            </div>

            {canManage && editingFaisMember && (
              <div className="mt-4 rounded-xl border border-navy-800/10 bg-white p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-navy-900">FAIS appointment · {editingFaisMember.full_name}</p>
                    <p className="text-[11px] text-navy-500">
                      Capacity under this FSP, status, DOFA and authorised licence categories. Advice and quoting need an active appointment with matching categories.
                    </p>
                  </div>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setEditingFaisId(null)}>
                    Close
                  </Button>
                </div>
                <FaisEditor
                  key={`${editingFaisMember.membership_id}-${editingFaisMember.fais_capacity}-${editingFaisMember.fais_status}-${editingFaisMember.dofa_date}-${editingFaisMember.authorised_licence_categories.join(',')}`}
                  membershipId={editingFaisMember.membership_id}
                  capacity={editingFaisMember.fais_capacity}
                  status={editingFaisMember.fais_status}
                  dofa={editingFaisMember.dofa_date}
                  categories={editingFaisMember.authorised_licence_categories}
                  disabled={updateFais.isPending}
                  onSave={(body) => updateFais.mutate(body, { onSuccess: () => setEditingFaisId(null) })}
                  onCancel={() => setEditingFaisId(null)}
                />
              </div>
            )}

            {canViewFais && !canManage && (
              <p className="mt-3 text-[11px] text-navy-600">
                Compliance reviewers can view FAIS summaries; only owners and administrators can change them.
              </p>
            )}
          </>
        )}
      </Section>

      <Section title="Invitations">
        {data.invitations.length === 0 ? (
          <p className="text-xs text-navy-600">No invitations yet.</p>
        ) : (
          <ul className="space-y-1.5 text-xs text-navy-700">
            {data.invitations.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-navy-800/10 px-3 py-2">
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

function FaisEditor({
  membershipId,
  capacity,
  status,
  dofa,
  categories,
  disabled,
  onSave,
  onCancel,
}: {
  membershipId: string
  capacity: FaisCapacity | null
  status: FaisAppointmentStatus | null
  dofa: string | null
  categories: string[]
  disabled: boolean
  onSave: (body: {
    membership_id: string
    fais_capacity: FaisCapacity | null
    fais_status: FaisAppointmentStatus | null
    dofa_date: string | null
    authorised_licence_categories: string[]
  }) => void
  onCancel: () => void
}) {
  const [faisCapacity, setFaisCapacity] = useState<FaisCapacity | ''>(capacity ?? '')
  const [faisStatus, setFaisStatus] = useState<FaisAppointmentStatus | ''>(status ?? '')
  const [dofaDate, setDofaDate] = useState(dofa ?? '')
  const [cats, setCats] = useState<string[]>(categories)

  const save = (e: FormEvent) => {
    e.preventDefault()
    onSave({
      membership_id: membershipId,
      fais_capacity: faisCapacity || null,
      fais_status: faisStatus || null,
      dofa_date: dofaDate || null,
      authorised_licence_categories: faisCapacity === 'non_advice' ? [] : cats,
    })
  }

  const toggleCat = (value: string) => {
    setCats((prev) => (prev.includes(value) ? prev.filter((c) => c !== value) : [...prev, value]))
  }

  return (
    <form onSubmit={save} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-[11px] font-semibold text-navy-700">
        Capacity
        <select className={`${textInput} mt-1`} value={faisCapacity} onChange={(e) => setFaisCapacity(e.target.value as FaisCapacity | '')} disabled={disabled}>
          <option value="">Not set</option>
          {CAPACITIES.map((c) => (
            <option key={c} value={c}>{FAIS_CAPACITY_LABEL[c]}</option>
          ))}
        </select>
      </label>
      <label className="text-[11px] font-semibold text-navy-700">
        Status
        <select className={`${textInput} mt-1`} value={faisStatus} onChange={(e) => setFaisStatus(e.target.value as FaisAppointmentStatus | '')} disabled={disabled}>
          <option value="">Not set</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{FAIS_STATUS_LABEL[s]}</option>
          ))}
        </select>
      </label>
      <label className="text-[11px] font-semibold text-navy-700">
        DOFA
        <input type="date" className={`${textInput} mt-1`} value={dofaDate} onChange={(e) => setDofaDate(e.target.value)} disabled={disabled} />
      </label>
      <div className="flex items-end gap-2">
        <Button type="submit" size="sm" variant="accent" disabled={disabled}>
          Save FAIS
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={onCancel}>
          Cancel
        </Button>
      </div>
      {faisCapacity !== 'non_advice' && (
        <fieldset className="sm:col-span-2 lg:col-span-4">
          <legend className="text-[11px] font-semibold text-navy-700">Authorised licence categories</legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {LICENCE_CATEGORIES.map((c) => (
              <label key={c.value} className="inline-flex items-center gap-1.5 rounded-lg border border-navy-800/10 px-2 py-1 text-[11px] text-navy-800">
                <input type="checkbox" checked={cats.includes(c.value)} onChange={() => toggleCat(c.value)} disabled={disabled} />
                {c.label}
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </form>
  )
}
