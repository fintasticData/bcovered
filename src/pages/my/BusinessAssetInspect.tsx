import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  ClipboardList,
  FileText,
  MessageSquare,
} from 'lucide-react'
import type { BusinessPageAsset, BusinessPageDto } from '@/api/businessPage'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { moneyOrNotSupplied } from '@/pages/my/portalFormat'
import {
  ASSET_STATUS_CLASS,
  ASSET_STATUS_LABEL,
  assetStatus,
  assetTypeDef,
  humaniseClass,
  missingRequiredFields,
  primaryActionFor,
} from '@/pages/my/assetTypeRegistry'
import { cn } from '@/lib/utils'

function valueBasisLabel(basis: string): string {
  return basis.replace(/_/g, ' ')
}

function Fact({ label, children, align }: { label: string; children: ReactNode; align?: 'right' }) {
  return (
    <div className="rounded-xl border border-navy-800/10 bg-white px-3 py-2.5">
      <dt className="text-[10px] font-bold tracking-wide text-navy-500 uppercase">{label}</dt>
      <dd className={cn('mt-0.5 text-sm font-semibold text-navy-900', align === 'right' && 'text-right tabular-nums')}>
        {children}
      </dd>
    </div>
  )
}

/** Thin focused-item inspect body for a commercial asset (Fintastic drawer mode). */
export function BusinessAssetInspect({
  asset,
  dto,
  tab,
  onTab,
  readOnly,
  onAskRuss,
  onOpenRisk,
}: {
  asset: BusinessPageAsset
  dto: BusinessPageDto
  tab: string
  onTab: (tab: string) => void
  readOnly?: boolean
  onAskRuss?: () => void
  onOpenRisk?: () => void
}) {
  const status = assetStatus(asset)
  const gaps = missingRequiredFields(asset)
  const action = primaryActionFor(status)
  const def = assetTypeDef(asset.asset_class)
  const Icon = def.Icon
  const mobility = asset.mobility_type ?? 'fixed'
  const typicallyUsed = asset.typically_used_place_names ?? []
  const readiness = [
    { id: 'description', label: 'Description', ok: Boolean(asset.display_label?.trim()) },
    { id: 'value', label: 'Declared value', ok: asset.declared_value != null },
    { id: 'basis', label: 'Value basis known', ok: asset.value_basis !== 'unknown' },
    { id: 'location', label: 'Location linked', ok: Boolean(asset.location_id) },
    {
      id: 'source',
      label: 'Value verified',
      ok: asset.source === 'verified',
    },
  ]
  const readyCount = readiness.filter((r) => r.ok).length

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3 rounded-xl border border-navy-800/10 bg-mist/40 px-3 py-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-navy-900">{asset.display_label}</p>
          <p className="text-xs capitalize text-navy-600">
            {humaniseClass(asset.asset_class)} · {dto.trading_name}
          </p>
          <span
            className={cn(
              'mt-1.5 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
              ASSET_STATUS_CLASS[status],
            )}
          >
            {ASSET_STATUS_LABEL[status]}
          </span>
        </div>
      </div>

      <Tabs value={tab} onValueChange={onTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="cover">Cover</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-3 text-sm">
          <dl className="grid grid-cols-2 gap-2">
            <Fact label="Status">{ASSET_STATUS_LABEL[status]}</Fact>
            <Fact label="Value" align="right">
              {moneyOrNotSupplied(asset.declared_value)}
            </Fact>
            <Fact label="Class">
              <span className="capitalize">{humaniseClass(asset.asset_class)}</span>
            </Fact>
            <Fact label="Quantity" align="right">
              {asset.quantity}
            </Fact>
            <Fact label="Location">{asset.location_name ?? '—'}</Fact>
            <Fact label="Mobility">
              <span className="capitalize">{mobility}</span>
            </Fact>
            <Fact label="Usual base">
              {asset.usual_base_place_name ?? asset.location_name ?? 'Not set'}
            </Fact>
            {(mobility === 'portable' || typicallyUsed.length > 0) && (
              <Fact label="Typically used">
                {typicallyUsed.length > 0 ? typicallyUsed.join(', ') : 'Not set'}
              </Fact>
            )}
            <Fact label="Covered where">
              {asset.coverage_territory?.trim()
                ? asset.coverage_territory
                : 'Policy territory — ask broker to confirm'}
            </Fact>
            <Fact label="Value basis">
              <span className="capitalize">{valueBasisLabel(String(asset.value_basis))}</span>
            </Fact>
            <Fact label="Source">
              <span className="capitalize">{(asset.source ?? '—').replace(/_/g, ' ')}</span>
            </Fact>
            <Fact label="Valued">
              {asset.valuation_date
                ? new Date(asset.valuation_date).toLocaleDateString('en-ZA')
                : 'Not dated'}
            </Fact>
          </dl>

          {gaps.length > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-950">
              <p className="flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="h-3.5 w-3.5" /> Gaps for cover readiness
              </p>
              <ul className="mt-1.5 list-inside list-disc space-y-0.5">
                {gaps.map((g) => (
                  <li key={g.key}>{g.label}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">
              Core facts look complete for a broker review.
            </p>
          )}

          <div className="rounded-xl border border-navy-800/10 bg-white px-3 py-2.5">
            <p className="text-[10px] font-bold tracking-wide text-navy-500 uppercase">What happens next</p>
            <p className="mt-1 text-sm text-navy-800">
              {action.kind === 'confirm_values' && 'Confirm declared values with your broker or risk profile.'}
              {action.kind === 'review_risk' && 'Review the risk profile — values or basis still need attention.'}
              {action.kind === 'request_cover' && 'Ask Russ or your broker to place cover for this asset.'}
              {action.kind === 'report_claim' && 'This asset is on cover — report a claim from the expanded row if needed.'}
              {action.kind === 'none' && 'Open the expanded-row hub for the primary action.'}
            </p>
            {!readOnly && (action.kind === 'review_risk' || action.kind === 'confirm_values') && (
              onOpenRisk ? (
                <Button size="sm" variant="outline" className="mt-2" type="button" onClick={onOpenRisk}>
                  Review risk profile
                </Button>
              ) : (
                <Button size="sm" variant="outline" className="mt-2" asChild>
                  <Link to="/my/business/risk-profile">Review risk profile</Link>
                </Button>
              )
            )}
          </div>
        </TabsContent>

        <TabsContent value="cover" className="mt-4 space-y-3 text-sm">
          <div className="rounded-xl border border-navy-800/10 bg-white px-3 py-3">
            <p className="text-[10px] font-bold tracking-wide text-navy-500 uppercase">
              Cover readiness · {readyCount} of {readiness.length}
            </p>
            <ul className="mt-2 space-y-1.5">
              {readiness.map((r) => (
                <li key={r.id} className="flex items-center gap-2 text-navy-800">
                  {r.ok ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />
                  ) : (
                    <CircleDashed className="h-4 w-4 text-amber-600" aria-hidden />
                  )}
                  <span className={cn(!r.ok && 'font-medium')}>{r.label}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-navy-700">
            Commercial assets are not yet linked to live policy sections on this page. Primary cover actions stay in the
            expanded row — this panel is for facts and gaps only.
          </p>
          {dto.review_status && (
            <p className="rounded-lg bg-mist px-3 py-2 text-xs text-navy-700">
              Business review: <span className="font-semibold text-navy-900">{dto.review_status}</span>
            </p>
          )}
        </TabsContent>

        <TabsContent value="documents" className="mt-4 space-y-3 text-sm">
          <div className="rounded-xl border border-dashed border-navy-800/20 bg-white px-4 py-6 text-center">
            <FileText className="mx-auto h-8 w-8 text-navy-300" />
            <p className="mt-2 font-semibold text-navy-900">No documents on this asset yet</p>
            <p className="mt-1 text-xs text-navy-600">
              Typical attachments: valuation certificate, purchase invoice, photos of the asset or premises.
            </p>
          </div>
          <ul className="space-y-2 text-xs text-navy-700">
            <li className="flex gap-2 rounded-lg border border-navy-800/10 px-3 py-2">
              <ClipboardList className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-700" />
              Ask your broker for a valuation if declared value is missing or marked unknown.
            </li>
            <li className="flex gap-2 rounded-lg border border-navy-800/10 px-3 py-2">
              <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-700" />
              Keep supplier invoices for equipment and fit-out so sums insured can be confirmed.
            </li>
          </ul>
          {!readOnly && onAskRuss && (
            <Button size="sm" variant="outline" type="button" onClick={onAskRuss}>
              <MessageSquare /> Ask Russ about documents
            </Button>
          )}
        </TabsContent>

        <TabsContent value="activity" className="mt-4 space-y-3 text-sm">
          <ol className="space-y-2">
            <li className="rounded-xl border border-navy-800/10 bg-white px-3 py-2.5">
              <p className="text-[10px] font-bold tracking-wide text-navy-500 uppercase">Review status</p>
              <p className="mt-0.5 text-navy-900">{dto.review_status ?? 'No review status recorded yet.'}</p>
            </li>
            {dto.open_requests.slice(0, 3).map((r) => (
              <li key={r.id} className="rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2.5">
                <p className="text-[10px] font-bold tracking-wide text-amber-900 uppercase">Open request</p>
                <p className="mt-0.5 font-medium text-navy-900">{r.title}</p>
                {r.detail && <p className="mt-0.5 text-xs text-navy-600">{r.detail}</p>}
              </li>
            ))}
            {dto.open_requests.length === 0 && (
              <li className="rounded-xl border border-navy-800/10 bg-white px-3 py-2.5 text-navy-700">
                No open broker requests for this business. Asset-level activity will appear here as cover work progresses.
              </li>
            )}
          </ol>
          {!readOnly && onAskRuss && (
            <Button size="sm" variant="outline" type="button" onClick={onAskRuss}>
              <MessageSquare /> Ask Russ
            </Button>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
