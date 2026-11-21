import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  CheckCircle2,
  MapPin,
  Radio,
  Shield,
  Truck,
  Camera,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ErrorState, LoadingState } from '@/broker/PageHeader'
import { cn } from '@/lib/utils'
import {
  OUTCOME_LABEL,
  centsToRand,
  installStatusLabel,
  usePartnerMyContext,
  usePartnerRequestMutation,
  usePartnerTrackingPage,
  type PartnerPackage,
} from '@/copilot/partnerTrackingApi'
import type { DataCategory } from '@/lib/supabase/category'

function outcomeIcon(outcome: string) {
  if (outcome === 'recovery') return <Shield className="h-3.5 w-3.5" />
  if (outcome === 'live_location') return <MapPin className="h-3.5 w-3.5" />
  if (outcome === 'dashcam') return <Camera className="h-3.5 w-3.5" />
  if (outcome === 'trailer') return <Truck className="h-3.5 w-3.5" />
  return <Radio className="h-3.5 w-3.5" />
}

function PackageCard({
  pkg,
  selected,
  onSelect,
}: {
  pkg: PartnerPackage
  selected: boolean
  onSelect: () => void
}) {
  return (
    <article
      className={cn(
        'flex flex-col rounded-3xl border bg-white/90 p-6 backdrop-blur transition hover:shadow-[0_16px_40px_-28px_rgba(10,43,44,0.4)]',
        selected ? 'border-brand-500 ring-2 ring-brand-500/20' : 'border-brand-800/10',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold tracking-wide text-brand-600 uppercase">
            {(pkg.outcomes ?? []).includes('recovery') ? 'Recovery support' : (pkg.outcomes ?? []).includes('live_location') ? 'Live location' : pkg.product_kind}
          </p>
          <h3 className="mt-1 font-display text-2xl text-brand-900">{pkg.name}</h3>
          <p className="mt-2 text-sm text-navy-600">{pkg.can_do || pkg.description}</p>
        </div>
      </div>
      <ul className="mt-4 space-y-2">
        {(pkg.outcomes ?? []).map((o) => (
          <li key={o} className="flex items-start gap-2 text-sm text-navy-800">
            <span className="mt-0.5 text-brand-700">{outcomeIcon(o)}</span>
            <span>{OUTCOME_LABEL[o] ?? o}</span>
          </li>
        ))}
      </ul>
      <div className="mt-5 grid grid-cols-3 gap-2 border-t border-navy-800/10 pt-4 text-center">
        <div>
          <p className="text-[10px] font-semibold tracking-wide text-navy-500 uppercase">Today</p>
          <p className="text-sm font-semibold text-navy-900">{centsToRand(pkg.install_fee_cents)}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold tracking-wide text-navy-500 uppercase">Monthly</p>
          <p className="text-sm font-semibold text-navy-900">{centsToRand(pkg.monthly_fee_cents)}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold tracking-wide text-navy-500 uppercase">Term</p>
          <p className="text-sm font-semibold text-navy-900">
            {pkg.contract_months ? `${pkg.contract_months} mo` : '—'}
          </p>
        </div>
      </div>
      <Button className="mt-4 w-full" variant={selected ? 'accent' : 'outline'} onClick={onSelect}>
        {selected ? 'Selected' : 'Select device'}
      </Button>
    </article>
  )
}

/**
 * Partner-branded vehicle tracking page.
 * Shareable at /p/:slug/tracking — also reachable from My Area → Other products → Vehicle tracking.
 */
export default function PartnerTrackingPage() {
  const { slug = 'guardtrack' } = useParams()
  const [params] = useSearchParams()
  const category = (params.get('mode') === 'live' ? 'live' : 'sample') as DataCategory
  const preselectItem = params.get('item')
  const page = usePartnerTrackingPage(slug, category)
  const ctx = usePartnerMyContext()
  const submit = usePartnerRequestMutation()
  const [clientKey] = useState(() => `trk:${crypto.randomUUID()}`)
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null)
  const [selectedItems, setSelectedItems] = useState<string[]>(preselectItem ? [preselectItem] : [])
  const [vehicleLabel, setVehicleLabel] = useState('')
  const [contact, setContact] = useState({ name: '', phone: '', email: '', area: '' })
  const [shareWithPartner, setShareWithPartner] = useState(true)
  const [done, setDone] = useState(false)

  const partner = page.data?.partner
  const trackers = page.data?.trackers ?? []
  const other = page.data?.other_products ?? []
  const vehicles = ctx.data?.vehicles ?? []
  const signedIn = Boolean(ctx.data?.signed_in)
  const selectedPkg = useMemo(
    () => [...trackers, ...other].find((p) => p.id === selectedPackageId) ?? null,
    [trackers, other, selectedPackageId],
  )

  useEffect(() => {
    document.title = partner ? `${partner.name} · Vehicle tracking · B-Covered` : 'Vehicle tracking · B-Covered'
  }, [partner])

  useEffect(() => {
    if (preselectItem && vehicles.some((v) => v.id === preselectItem)) {
      setSelectedItems([preselectItem])
    }
  }, [preselectItem, vehicles])

  const fleetMode = selectedItems.length > 1
  const canSubmit =
    Boolean(selectedPkg) &&
    (selectedItems.length > 0 || vehicleLabel.trim().length > 2) &&
    (signedIn || contact.name.trim() || contact.phone.trim() || contact.email.trim()) &&
    !submit.isPending

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!selectedPkg || !canSubmit) return
    submit.mutate(
      {
        slug,
        package_id: selectedPkg.id,
        request_kind: fleetMode ? 'fleet_quote' : 'installation',
        insured_item_ids: selectedItems,
        vehicle_label: selectedItems.length ? undefined : vehicleLabel.trim(),
        contact_name: contact.name.trim() || undefined,
        contact_phone: contact.phone.trim() || undefined,
        contact_email: contact.email.trim() || undefined,
        preferred_area: contact.area.trim() || undefined,
        share_with_partner: shareWithPartner,
        source: signedIn ? 'my_area' : 'share_link',
        client_key: clientKey,
      },
      { onSuccess: () => setDone(true) },
    )
  }

  const toggleItem = (id: string) => {
    setSelectedItems((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  if (page.isLoading) return <LoadingState label="Loading tracking options…" />
  if (page.error || !page.data?.valid || !partner) {
    return <ErrorState message={page.data?.reason ?? page.error?.message ?? 'Partner page not found'} />
  }

  if (done && submit.data?.ok) {
    const reqs = submit.data.requests ?? []
    return (
      <div className="container-x grid min-h-[70vh] place-items-center py-12">
        <div className="card w-full max-w-lg p-8 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
          <h1 className="mt-4 font-display text-3xl text-brand-900">
            {fleetMode ? 'Fleet quote requested' : 'Installation requested'}
          </h1>
          <p className="mt-2 text-ink/70">
            {submit.data.partner_name} has your request for {submit.data.package_name}.
            {shareWithPartner
              ? ' They will contact you to confirm the area and booking.'
              : ' Your broker can share it with the partner when you are ready.'}
          </p>
          <ul className="mt-4 space-y-1 text-left text-sm text-navy-700">
            {reqs.map((r) => (
              <li key={r.id} className="rounded-lg border border-navy-800/10 px-3 py-2">
                <span className="font-mono text-xs">{r.reference}</span>
                <span className="ml-2">{r.vehicle_label || 'Vehicle'}</span>
                <span className="mt-0.5 block text-xs text-navy-500">{installStatusLabel(r.status)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button asChild variant="accent">
              <Link to="/my">Back to My Area</Link>
            </Button>
            <Button variant="outline" onClick={() => { setDone(false); setSelectedPackageId(null) }}>
              Choose another device
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_#eef7f6_0%,_#faf7f2_45%,_#f5f7fa_100%)]">
      <div className="container-x animate-rise space-y-12 py-10">
        <section className="relative overflow-hidden rounded-[1.75rem] border border-brand-800/10 bg-brand-900 text-white shadow-[0_20px_50px_-28px_rgba(10,43,44,0.55)]">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(ellipse 70% 60% at 15% 20%, rgba(227,159,28,0.3), transparent 55%), radial-gradient(ellipse 50% 40% at 90% 0%, rgba(169,214,208,0.28), transparent 45%)',
            }}
          />
          <div className="relative grid gap-8 p-7 sm:p-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
            <div>
              <p className="text-[11px] font-semibold tracking-[0.22em] text-gold-300 uppercase">Vehicle tracking</p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                {partner.logo_url ? (
                  <img src={partner.logo_url} alt="" className="h-14 w-14 rounded-2xl object-cover ring-1 ring-white/20" />
                ) : (
                  <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gold-400 text-lg font-bold text-brand-900">
                    {partner.name.slice(0, 2).toUpperCase()}
                  </span>
                )}
                <div>
                  <h1 className="font-display text-4xl leading-tight font-semibold tracking-tight sm:text-5xl">{partner.name}</h1>
                  <p className="text-sm text-brand-100/80">Available via {partner.brokerage}</p>
                </div>
              </div>
              <p className="mt-5 max-w-xl text-lg text-brand-50/90">{partner.intro}</p>
              {partner.install_areas?.length > 0 && (
                <p className="mt-3 text-sm text-brand-100/70">
                  Installs in {partner.install_areas.join(', ')}
                </p>
              )}
              <div className="mt-7 flex flex-wrap gap-2">
                <Button
                  className="bg-gold-400 text-brand-900 hover:bg-gold-300"
                  onClick={() => document.getElementById('compare-devices')?.scrollIntoView({ behavior: 'smooth' })}
                >
                  Choose a tracking device
                </Button>
                <Button variant="outline" className="border-white/25 bg-white/5 text-white hover:bg-white/10" asChild>
                  <Link to="/my">Your Page</Link>
                </Button>
              </div>
            </div>
            <div className="rounded-3xl border border-white/15 bg-white/10 p-6 backdrop-blur-md">
              <h2 className="text-sm font-semibold text-gold-300">Compare what matters</h2>
              <ul className="mt-4 space-y-3 text-sm text-brand-50">
                <li className="flex gap-2"><Shield className="mt-0.5 h-4 w-4 shrink-0 text-gold-300" /> If my car is stolen, who helps me recover it?</li>
                <li className="flex gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gold-300" /> If I just want to see where my car is, which device?</li>
                <li className="flex gap-2"><Radio className="mt-0.5 h-4 w-4 shrink-0 text-gold-300" /> What will I pay today and each month?</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="space-y-4" id="choose-vehicle">
          <div>
            <h2 className="font-display text-2xl text-navy-900">Choose your vehicle</h2>
            <p className="mt-1 text-sm text-navy-600">
              {signedIn
                ? 'Pick one or more vehicles from your profile. Several vehicles become a fleet quote.'
                : 'Enter a vehicle, or browse devices first and add details when you request installation.'}
            </p>
          </div>
          {signedIn && vehicles.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {vehicles.map((v) => {
                const active = selectedItems.includes(v.id)
                const existing = (ctx.data?.requests ?? []).find((r) => r.insured_item_id === v.id)
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => toggleItem(v.id)}
                    className={cn(
                      'rounded-xl border px-4 py-3 text-left transition',
                      active ? 'border-brand-500 bg-brand-50/60' : 'border-navy-800/10 bg-white hover:border-brand-300',
                    )}
                  >
                    <p className="text-sm font-semibold text-navy-900">{v.display_label}</p>
                    {existing ? (
                      <p className="mt-1 text-xs text-amber-800">{installStatusLabel(existing.status)} · {existing.partner_name}</p>
                    ) : (
                      <p className="mt-1 text-xs text-navy-500 capitalize">{v.status.replace(/_/g, ' ')}</p>
                    )}
                  </button>
                )
              })}
            </div>
          ) : (
            <label className="block max-w-lg">
              <span className="text-xs font-semibold text-navy-600">Vehicle</span>
              <input
                className="mt-1 w-full rounded-xl border border-navy-800/15 bg-white px-3 py-2 text-sm"
                placeholder="e.g. 2019 Toyota Corolla CA 123-456"
                value={vehicleLabel}
                onChange={(e) => setVehicleLabel(e.target.value)}
              />
            </label>
          )}
          {fleetMode && (
            <p className="text-sm font-medium text-brand-800">
              {selectedItems.length} vehicles selected — request will be a fleet quote.
            </p>
          )}
        </section>

        <section className="space-y-4" id="compare-devices">
          <div>
            <h2 className="font-display text-3xl text-brand-900">Compare tracking devices</h2>
            <p className="mt-1 text-sm text-navy-600">
              Outcomes first — recovery help, live location, and what you pay — then the package name.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {trackers.map((pkg) => (
              <PackageCard
                key={pkg.id}
                pkg={pkg}
                selected={selectedPackageId === pkg.id}
                onSelect={() => setSelectedPackageId(pkg.id)}
              />
            ))}
          </div>
        </section>

        {other.length > 0 && (
          <section className="space-y-4">
            <div>
              <h2 className="font-display text-2xl text-navy-900">Other products from this company</h2>
              <p className="mt-1 text-sm text-navy-600">Dashcams, trailer trackers and related devices with their own pricing.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {other.map((pkg) => (
                <PackageCard
                  key={pkg.id}
                  pkg={pkg}
                  selected={selectedPackageId === pkg.id}
                  onSelect={() => setSelectedPackageId(pkg.id)}
                />
              ))}
            </div>
          </section>
        )}

        {selectedPkg && (
          <section className="rounded-3xl border border-navy-800/10 bg-white p-6 shadow-sm">
            <h2 className="font-display text-2xl text-navy-900">
              {fleetMode ? 'Request a fleet quote' : 'Request installation'}
            </h2>
            <p className="mt-1 text-sm text-navy-600">
              Confirm contact details and preferred area. Main conversion for this MVP is a qualified enquiry to {partner.name}.
            </p>
            <form className="mt-5 grid gap-3 sm:grid-cols-2" onSubmit={onSubmit}>
              <label className="block text-sm">
                <span className="text-xs font-semibold text-navy-600">Your name</span>
                <input
                  className="mt-1 w-full rounded-xl border border-navy-800/15 px-3 py-2"
                  value={contact.name}
                  onChange={(e) => setContact((c) => ({ ...c, name: e.target.value }))}
                  placeholder={signedIn ? 'Optional if you are signed in' : 'Required'}
                />
              </label>
              <label className="block text-sm">
                <span className="text-xs font-semibold text-navy-600">Preferred area</span>
                <select
                  className="mt-1 w-full rounded-xl border border-navy-800/15 px-3 py-2"
                  value={contact.area}
                  onChange={(e) => setContact((c) => ({ ...c, area: e.target.value }))}
                >
                  <option value="">Select area</option>
                  {(partner.install_areas ?? []).map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-xs font-semibold text-navy-600">Phone</span>
                <input
                  className="mt-1 w-full rounded-xl border border-navy-800/15 px-3 py-2"
                  value={contact.phone}
                  onChange={(e) => setContact((c) => ({ ...c, phone: e.target.value }))}
                />
              </label>
              <label className="block text-sm">
                <span className="text-xs font-semibold text-navy-600">Email</span>
                <input
                  type="email"
                  className="mt-1 w-full rounded-xl border border-navy-800/15 px-3 py-2"
                  value={contact.email}
                  onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))}
                />
              </label>
              <label className="col-span-full flex items-start gap-2 text-sm text-navy-700">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={shareWithPartner}
                  onChange={(e) => setShareWithPartner(e.target.checked)}
                />
                <span>Share this request with {partner.name} so they can contact me</span>
              </label>
              <div className="col-span-full rounded-xl bg-navy-50 px-4 py-3 text-sm text-navy-700">
                <p className="font-semibold text-navy-900">{selectedPkg.name}</p>
                <p>
                  Once-off {centsToRand(selectedPkg.install_fee_cents)} · Monthly {centsToRand(selectedPkg.monthly_fee_cents)}
                  {selectedPkg.contract_months ? ` · ${selectedPkg.contract_months}-month term` : ''}
                </p>
              </div>
              {submit.isError && (
                <p className="col-span-full text-sm text-rose-700">{(submit.error as Error).message}</p>
              )}
              <div className="col-span-full">
                <Button type="submit" variant="accent" disabled={!canSubmit}>
                  {submit.isPending ? <Loader2 className="animate-spin" /> : null}
                  {fleetMode ? 'Request a fleet quote' : 'Request installation'}
                </Button>
              </div>
            </form>
          </section>
        )}
      </div>
    </div>
  )
}
