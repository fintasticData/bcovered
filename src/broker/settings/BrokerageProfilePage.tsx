import { useEffect, useState } from 'react'
import { Loader2, Save } from 'lucide-react'
import { useMe } from '@/api/hooks'
import { MediaField } from '@/components/MediaField'
import { Button } from '@/components/ui/button'
import { fetchOrganisationMedia, patchOrganisationMedia } from '@/lib/supabase/organisations'
import { useSalesProfile } from '@/copilot/salesApi'
import { ErrorState, LoadingState, PageHeader } from '../PageHeader'
import { Page, Section } from '../shared/ui'

/** Broker-facing branding: logo and brand image for the active workspace. */
export default function BrokerageProfilePage() {
  const { data: me } = useMe()
  const profile = useSalesProfile()
  const orgId = profile.data?.brokerage?.id ?? me?.organisation?.id ?? null
  const canManage = Boolean(profile.data?.can_manage_team)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [brandUrl, setBrandUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!orgId) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    void fetchOrganisationMedia(orgId)
      .then((media) => {
        if (cancelled || !media) return
        setLogoUrl(media.logo_url)
        setBrandUrl(media.brand_image_url)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load branding')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [orgId])

  const save = async () => {
    if (!orgId || !canManage) return
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await patchOrganisationMedia(orgId, { logo_url: logoUrl, brand_image_url: brandUrl })
      setSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (profile.isLoading || loading) return <div className="p-6"><LoadingState /></div>
  if (!orgId) return <div className="p-6"><ErrorState message="No brokerage workspace is active yet." /></div>

  return (
    <Page>
      <PageHeader
        title="Brokerage profile"
        description="Logo and brand image shown in your workspace and on customer-facing referral pages."
      />
      {!canManage && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Only the brokerage owner or administrator can change branding. You can still view the current logo.
        </p>
      )}
      {error && <ErrorState message={error} />}
      <Section title="Brand media">
        <div className="grid gap-3 sm:grid-cols-2">
          <MediaField
            label="Logo"
            hint="Square image works best. Used in the broker nav and customer referral pages."
            tenantId={orgId}
            purpose="logo"
            kind="image"
            accept="image/*"
            value={logoUrl}
            previewUrl={logoUrl}
            disabled={!canManage}
            onChange={setLogoUrl}
          />
          <MediaField
            label="Brand image"
            hint="Optional cover / hero image for branded surfaces."
            tenantId={orgId}
            purpose="brand_image"
            kind="image"
            accept="image/*"
            value={brandUrl}
            previewUrl={brandUrl}
            disabled={!canManage}
            onChange={setBrandUrl}
          />
        </div>
        {canManage && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="accent" disabled={saving} onClick={() => void save()}>
              {saving ? <Loader2 className="animate-spin" /> : <Save />} Save branding
            </Button>
            {saved && <span className="text-xs font-semibold text-emerald-700">Saved</span>}
          </div>
        )}
      </Section>
    </Page>
  )
}
