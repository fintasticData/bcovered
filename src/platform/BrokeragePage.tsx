import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Ban, Mail, RotateCcw, Save, Trash2, UserPlus } from 'lucide-react'
import { api, type CreatedInvitation } from '@/api/client'
import { useBrokerageAdmin, usePlatformAction } from '@/api/hooks'
import { MediaField } from '@/components/MediaField'
import { StatusBadge } from '@/components/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { fetchOrganisationMedia, patchOrganisationMedia } from '@/lib/supabase/organisations'
import { resolveMediaUrl } from '@/lib/supabase/media'
import { formatDateTime } from '@/lib/utils'
import type { BrokerageType, MemberRole, OrganisationProductModule } from '@/server/db/onboardingSchema'
import { BROKERAGE_TYPES, MODULE_LABEL, PACKAGES, ROLE_LABEL } from '@/server/onboarding/config'
import { InvitationCreated } from '@/onboarding/sections'
import { ErrorState, LoadingState } from '@/broker/PageHeader'
import { Notice, Page, Section } from '@/broker/shared/ui'
import { auditReason, textInput } from '@/onboarding/ui'

const TEAM_ROLES = (['agent', 'sub_broker', 'representative', 'operations_admin', 'brokerage_admin', 'compliance_reviewer', 'read_only', 'brokerage_owner'] as MemberRole[]).filter(
  (r) => r in ROLE_LABEL,
)

const MODULE_STATUSES: OrganisationProductModule['status'][] = ['declared', 'approved', 'enabled', 'disabled']

export default function BrokeragePage() {
  const { organisationId } = useParams()
  const { data: view, isLoading, error } = useBrokerageAdmin(organisationId)
  const suspend = usePlatformAction(api.platformAdmin.suspend)
  const reinstate = usePlatformAction(api.platformAdmin.reinstate)
  const disable = usePlatformAction(api.insurers.disable)
  const updateProfile = usePlatformAction(api.platformAdmin.updateBrokerage)
  const addMember = usePlatformAction(api.platformAdmin.addOrInviteMember)
  const changeRole = usePlatformAction(api.platformAdmin.changeMemberRole)
  const removeMember = usePlatformAction(api.platformAdmin.removeMember)
  const revokeInvite = usePlatformAction(api.platformAdmin.revokeInvitation)
  const setModule = usePlatformAction(api.platformAdmin.setModuleStatus)
  const [reason, setReason] = useState('')
  const [created, setCreated] = useState<CreatedInvitation | null>(null)

  if (isLoading) return <div className="p-6"><LoadingState /></div>
  if (error || !view) return <div className="p-6"><ErrorState message={error?.message ?? 'Could not load the brokerage'} /></div>

  const org = view.organisation
  const canManage = view.can_manage
  const canAccess = view.can_access_actions
  const actionError =
    suspend.error?.message ??
    reinstate.error?.message ??
    disable.error?.message ??
    updateProfile.error?.message ??
    addMember.error?.message ??
    changeRole.error?.message ??
    removeMember.error?.message ??
    revokeInvite.error?.message ??
    setModule.error?.message

  return (
    <Page wide>
      <Link to="/platform/brokerages" className="inline-flex items-center gap-1 text-xs font-semibold text-navy-600 hover:text-brand-600">
        <ArrowLeft className="h-3.5 w-3.5" /> Brokerages
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {org.logo_url ? (
            <img src={org.logo_url} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover ring-1 ring-navy-800/10" />
          ) : (
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-navy-100 text-sm font-bold text-navy-600">
              {org.name.slice(0, 2).toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-navy-900">{org.name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-navy-600">
              <StatusBadge status={org.lifecycle_status} /> {org.legal_name ?? ''} {org.registration_number && `· ${org.registration_number}`}
              {org.blp_number && ` · BLP# ${org.blp_number}`}
              {org.fsp_number && ` · FSP ${org.fsp_number} (declared)`}
              {org.is_demo && <Badge tone="warning">Demo data</Badge>}
            </p>
            {org.status_reason && <p className="mt-1 text-xs text-navy-600">Reason: {org.status_reason}</p>}
            {org.retention_until && <p className="text-xs text-navy-600">Records retained until {org.retention_until}</p>}
          </div>
        </div>
        {view.application && (
          <Button variant="outline" asChild>
            <Link to={`/platform/onboarding/${view.application.id}`}>Open onboarding review</Link>
          </Button>
        )}
      </div>

      {canManage ? (
        <Notice>
          You can update brokerage details and manage team members here. Suspend / reinstate and disabling insurers still need a platform administrator
          {canAccess ? ' (you have that role).' : '.'}
        </Notice>
      ) : (
        <Notice tone="warning">
          Your role ({view.platform_role.replaceAll('_', ' ')}) is read-only on this screen. Switch to a platform administrator or onboarding reviewer to edit.
        </Notice>
      )}

      {canAccess && (org.lifecycle_status === 'active' || org.lifecycle_status === 'suspended') && (
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
        </Section>
      )}

      {actionError && <ErrorState message={actionError} />}

      <Section title="Brokerage details">
        <BrokerageProfileForm
          key={`${org.id}-${org.updated_at}`}
          organisationId={org.id}
          canManage={canManage}
          initial={{
            name: org.name,
            legal_name: org.legal_name ?? '',
            trading_name: org.trading_name ?? '',
            registration_number: org.registration_number ?? '',
            fsp_number: org.fsp_number ?? '',
            blp_number: org.blp_number ?? '',
            brokerage_type: org.brokerage_type,
            logo_url: org.logo_url ?? null,
            brand_image_url: org.brand_image_url ?? null,
            intro_video_url: org.intro_video_url ?? null,
            profile_doc_url: org.profile_doc_url ?? null,
          }}
          saving={updateProfile.isPending}
          onSave={(body) =>
            updateProfile.mutate(body, {
              onSuccess: () => {
                void patchOrganisationMedia(org.id, {
                  logo_url: body.logo_url ?? null,
                  brand_image_url: body.brand_image_url ?? null,
                  intro_video_url: body.intro_video_url ?? null,
                  profile_doc_url: body.profile_doc_url ?? null,
                }).catch(() => undefined)
              },
            })
          }
        />
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Team">
          <p className="mb-3 text-xs text-navy-600">
            Add someone with an existing B-Covered login immediately, or send an invitation if they do not have an account yet. Changes are audited as platform actions.
          </p>
          {canManage && (
            <AddMemberForm
              organisationId={org.id}
              pending={addMember.isPending}
              onSubmit={(body) =>
                addMember.mutate(body, {
                  onSuccess: (result) => {
                    if (result.kind === 'invited') setCreated(result.invitation)
                    else setCreated(null)
                  },
                })
              }
            />
          )}
          {created && (
            <div className="mb-3">
              <InvitationCreated created={created} />
            </div>
          )}
          <ul className="space-y-2 text-sm">
            {view.team.members.map((m) => (
              <li key={m.membership_id} className="rounded-xl border border-navy-800/10 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-navy-900">
                      {m.full_name} <span className="text-xs font-normal text-navy-500">{m.email}</span>
                    </p>
                    <p className="text-[11px] text-navy-500">
                      {m.fais_capacity_label ?? 'FAIS not set'}
                      {m.fais_status ? ` · ${m.fais_status}` : ''}
                      {m.authorised_licence_categories?.length ? ` · ${m.authorised_licence_categories.join(', ')}` : ''}
                    </p>
                  </div>
                  <StatusBadge status={m.status} />
                </div>
                {canManage ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <select
                      aria-label={`Role for ${m.full_name}`}
                      className={`${textInput} max-w-56`}
                      value={m.role}
                      disabled={changeRole.isPending}
                      onChange={(e) =>
                        changeRole.mutate({ organisation_id: org.id, membership_id: m.membership_id, role: e.target.value as MemberRole })
                      }
                    >
                      {TEAM_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={removeMember.isPending}
                      onClick={() => {
                        if (window.confirm(`Remove ${m.full_name} from ${org.name}?`)) {
                          removeMember.mutate({ organisation_id: org.id, membership_id: m.membership_id })
                        }
                      }}
                    >
                      <Trash2 /> Remove
                    </Button>
                  </div>
                ) : (
                  <Badge tone="accent" className="mt-2">
                    {m.role_label}
                  </Badge>
                )}
              </li>
            ))}
          </ul>
          {view.team.invitations.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold text-navy-700">Pending invitations</p>
              <ul className="space-y-1.5 text-xs text-navy-700">
                {view.team.invitations.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      {i.email} · {i.role_label} · sent {formatDateTime(i.created_at)}
                    </span>
                    <span className="flex items-center gap-2">
                      <StatusBadge status={i.state} />
                      {canManage && i.state === 'valid' && (
                        <button type="button" className="cursor-pointer font-semibold text-red-600 underline" onClick={() => revokeInvite.mutate(i.id)}>
                          Revoke
                        </button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Section>

        <Section title="Products and terms">
          <ul className="space-y-2 text-sm">
            {view.modules.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>{MODULE_LABEL[m.module]}</span>
                {canManage ? (
                  <select
                    aria-label={`Status for ${MODULE_LABEL[m.module]}`}
                    className={`${textInput} max-w-40`}
                    value={m.status}
                    disabled={setModule.isPending}
                    onChange={(e) =>
                      setModule.mutate({
                        organisation_id: org.id,
                        module_id: m.id,
                        status: e.target.value as OrganisationProductModule['status'],
                      })
                    }
                  >
                    {MODULE_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                ) : (
                  <StatusBadge status={m.status} />
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-navy-600">
            {view.terms
              ? `Package ${PACKAGES.find((p) => p.key === view.terms!.package_key)?.label ?? view.terms.package_key}, agreed ${formatDateTime(view.terms.agreed_at ?? view.terms.created_at)}`
              : 'No commercial terms agreed'}
          </p>
        </Section>

        <Section title="Insurer access">
          <ul className="space-y-2 text-sm">
            {view.insurers.length === 0 && <li className="text-xs text-navy-600">No insurer relationships recorded.</li>}
            {view.insurers.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {a.insurer_name} · {MODULE_LABEL[a.product_module]}
                  <span className="block text-xs text-navy-500">
                    Intermediary / BLP code {a.intermediary_code ?? '–'} · credentials {a.credential_hint ?? 'none'} {!a.supported && '· no integration'}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <StatusBadge status={a.status} />
                  {canAccess && a.status === 'enabled' && (
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
            {view.audit.length === 0 && <li className="text-xs text-navy-500">No audited platform actions yet.</li>}
            {view.audit.map((e) => (
              <li key={e.id} className="text-[11px] text-navy-700">
                <span className="font-medium">{e.action}</span> · {e.actor_name} · {formatDateTime(e.created_at)}{' '}
                {e.actor_scope === 'platform' && <Badge tone="accent">platform</Badge>}
                {auditReason(e.after) && <span className="block text-navy-500">Reason: {auditReason(e.after)}</span>}
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </Page>
  )
}

function BrokerageProfileForm({
  organisationId,
  canManage,
  initial,
  saving,
  onSave,
}: {
  organisationId: string
  canManage: boolean
  initial: {
    name: string
    legal_name: string
    trading_name: string
    registration_number: string
    fsp_number: string
    blp_number: string
    brokerage_type: BrokerageType | null
    logo_url: string | null
    brand_image_url: string | null
    intro_video_url: string | null
    profile_doc_url: string | null
  }
  saving: boolean
  onSave: (body: {
    organisation_id: string
    name: string
    legal_name: string | null
    trading_name: string | null
    registration_number: string | null
    fsp_number: string | null
    blp_number: string | null
    brokerage_type: BrokerageType | null
    logo_url: string | null
    brand_image_url: string | null
    intro_video_url: string | null
    profile_doc_url: string | null
  }) => void
}) {
  const [name, setName] = useState(initial.name)
  const [legalName, setLegalName] = useState(initial.legal_name)
  const [tradingName, setTradingName] = useState(initial.trading_name)
  const [registration, setRegistration] = useState(initial.registration_number)
  const [fsp, setFsp] = useState(initial.fsp_number)
  const [blp, setBlp] = useState(initial.blp_number)
  const [type, setType] = useState<BrokerageType | ''>(initial.brokerage_type ?? '')
  const [logoUrl, setLogoUrl] = useState<string | null>(initial.logo_url)
  const [brandUrl, setBrandUrl] = useState<string | null>(initial.brand_image_url)
  const [videoUrl, setVideoUrl] = useState<string | null>(initial.intro_video_url)
  const [docUrl, setDocUrl] = useState<string | null>(initial.profile_doc_url)
  const [videoPreview, setVideoPreview] = useState<string | null>(null)
  const [docPreview, setDocPreview] = useState<string | null>(null)

  useEffect(() => {
    setName(initial.name)
    setLegalName(initial.legal_name)
    setTradingName(initial.trading_name)
    setRegistration(initial.registration_number)
    setFsp(initial.fsp_number)
    setBlp(initial.blp_number)
    setType(initial.brokerage_type ?? '')
    setLogoUrl(initial.logo_url)
    setBrandUrl(initial.brand_image_url)
    setVideoUrl(initial.intro_video_url)
    setDocUrl(initial.profile_doc_url)
  }, [initial])

  useEffect(() => {
    let cancelled = false
    void fetchOrganisationMedia(organisationId).then((media) => {
      if (cancelled || !media) return
      if (media.logo_url) setLogoUrl(media.logo_url)
      if (media.brand_image_url) setBrandUrl(media.brand_image_url)
      if (media.intro_video_url) setVideoUrl(media.intro_video_url)
      if (media.profile_doc_url) setDocUrl(media.profile_doc_url)
    })
    return () => {
      cancelled = true
    }
  }, [organisationId])

  useEffect(() => {
    let cancelled = false
    void resolveMediaUrl('media-videos', videoUrl).then((url) => {
      if (!cancelled) setVideoPreview(url)
    })
    void resolveMediaUrl('media-docs', docUrl).then((url) => {
      if (!cancelled) setDocPreview(url)
    })
    return () => {
      cancelled = true
    }
  }, [videoUrl, docUrl])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    onSave({
      organisation_id: organisationId,
      name,
      legal_name: legalName || null,
      trading_name: tradingName || null,
      registration_number: registration || null,
      fsp_number: fsp || null,
      blp_number: blp || null,
      brokerage_type: type || null,
      logo_url: logoUrl,
      brand_image_url: brandUrl,
      intro_video_url: videoUrl,
      profile_doc_url: docUrl,
    })
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-navy-700">
          Display name
          <input className={`${textInput} mt-1`} value={name} onChange={(e) => setName(e.target.value)} disabled={!canManage} required />
        </label>
        <label className="text-xs font-semibold text-navy-700">
          Legal name
          <input className={`${textInput} mt-1`} value={legalName} onChange={(e) => setLegalName(e.target.value)} disabled={!canManage} />
        </label>
        <label className="text-xs font-semibold text-navy-700">
          Trading name
          <input className={`${textInput} mt-1`} value={tradingName} onChange={(e) => setTradingName(e.target.value)} disabled={!canManage} />
        </label>
        <label className="text-xs font-semibold text-navy-700">
          Registration number
          <input className={`${textInput} mt-1`} value={registration} onChange={(e) => setRegistration(e.target.value)} disabled={!canManage} />
        </label>
        <label className="text-xs font-semibold text-navy-700">
          FSP number
          <input className={`${textInput} mt-1`} value={fsp} onChange={(e) => setFsp(e.target.value)} disabled={!canManage} />
        </label>
        <label className="text-xs font-semibold text-navy-700">
          BLP#
          <input className={`${textInput} mt-1`} value={blp} onChange={(e) => setBlp(e.target.value)} disabled={!canManage} />
        </label>
        <label className="text-xs font-semibold text-navy-700 sm:col-span-2">
          Brokerage type
          <select className={`${textInput} mt-1`} value={type} onChange={(e) => setType(e.target.value as BrokerageType | '')} disabled={!canManage}>
            <option value="">Not set</option>
            {BROKERAGE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold text-navy-800">Media (Supabase Storage)</p>
        <p className="mb-3 text-[11px] text-navy-500">
          Uploads go to <code>media-images</code>, <code>media-videos</code> or <code>media-docs</code>. The returned URL/path is saved on the
          brokerage row and registered in <code>media_assets</code>.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <MediaField
            label="Logo"
            hint="PNG/JPEG/WebP · media-images (public URL)"
            tenantId={organisationId}
            purpose="logo"
            kind="image"
            value={logoUrl}
            previewUrl={logoUrl}
            disabled={!canManage}
            accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
            onChange={setLogoUrl}
          />
          <MediaField
            label="Brand / cover image"
            hint="Shown on branded surfaces · media-images"
            tenantId={organisationId}
            purpose="brand_image"
            kind="image"
            value={brandUrl}
            previewUrl={brandUrl}
            disabled={!canManage}
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={setBrandUrl}
          />
          <MediaField
            label="Intro video"
            hint="MP4/WebM · media-videos (private; signed URL for preview)"
            tenantId={organisationId}
            purpose="intro_video"
            kind="video"
            value={videoUrl}
            previewUrl={videoPreview}
            disabled={!canManage}
            accept="video/mp4,video/webm,video/quicktime"
            onChange={setVideoUrl}
          />
          <MediaField
            label="Profile document"
            hint="PDF/Office · media-docs (private)"
            tenantId={organisationId}
            purpose="profile_doc"
            kind="document"
            value={docUrl}
            previewUrl={docPreview}
            disabled={!canManage}
            accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,application/pdf"
            onChange={setDocUrl}
          />
        </div>
      </div>

      {canManage && (
        <Button type="submit" variant="accent" disabled={saving || !name.trim()}>
          <Save /> Save brokerage details
        </Button>
      )}
    </form>
  )
}

function AddMemberForm({
  organisationId,
  pending,
  onSubmit,
}: {
  organisationId: string
  pending: boolean
  onSubmit: (body: { organisation_id: string; email: string; role: MemberRole; full_name?: string }) => void
}) {
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<MemberRole>('representative')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    onSubmit({ organisation_id: organisationId, email, role, full_name: fullName || undefined })
    setEmail('')
    setFullName('')
  }

  return (
    <form onSubmit={submit} className="mb-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
      <input aria-label="Email" type="email" className={textInput} placeholder="colleague@brokerage.co.za" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input aria-label="Full name" className={textInput} placeholder="Full name (optional)" value={fullName} onChange={(e) => setFullName(e.target.value)} />
      <select aria-label="Role" className={textInput} value={role} onChange={(e) => setRole(e.target.value as MemberRole)}>
        {TEAM_ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABEL[r]}
          </option>
        ))}
      </select>
      <Button type="submit" variant="accent" disabled={pending || !email.trim()}>
        <UserPlus /> Add / invite
      </Button>
      <p className="sm:col-span-4 text-[11px] text-navy-500">
        <Mail className="mr-1 inline h-3 w-3" />
        If the email already has an account, they join immediately. Otherwise an invitation link is created.
      </p>
    </form>
  )
}
