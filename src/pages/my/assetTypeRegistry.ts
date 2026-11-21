import type { ComponentType, ReactNode } from 'react'
import {
  Building2,
  Cpu,
  Forklift,
  Package,
  Refrigerator,
  Truck,
  Wrench,
} from 'lucide-react'
import type { BusinessPageAsset } from '@/api/businessPage'

/** Cover / quote readiness status for a commercial asset on My Business Page. */
export type BusinessAssetStatus =
  | 'covered'
  | 'awaiting_cover'
  | 'value_missing'
  | 'review_needed'
  | 'not_confirmed'

export type AssetRequiredField = {
  key: string
  label: string
}

export type AssetSpokeDef = {
  id: string
  title: string
  /** Which asset fields drive the spoke body. */
  kind: 'location' | 'value' | 'class' | 'quantity' | 'broker' | 'requests'
}

export type AssetTypeDef = {
  classKey: string
  label: string
  requiredFields: AssetRequiredField[]
  spokes: AssetSpokeDef[]
  Icon: ComponentType<{ className?: string }>
}

const FALLBACK: AssetTypeDef = {
  classKey: 'other',
  label: 'Asset',
  requiredFields: [
    { key: 'description', label: 'Description' },
    { key: 'declared_value', label: 'Declared value' },
  ],
  spokes: [
    { id: 'class', title: 'Type', kind: 'class' },
    { id: 'value', title: 'Declared value', kind: 'value' },
    { id: 'location', title: 'Location', kind: 'location' },
    { id: 'broker', title: 'Broker', kind: 'broker' },
  ],
  Icon: Package,
}

const REGISTRY: Record<string, AssetTypeDef> = {
  buildings: {
    classKey: 'buildings',
    label: 'Buildings',
    requiredFields: [
      { key: 'description', label: 'Description' },
      { key: 'declared_value', label: 'Replacement value' },
      { key: 'location_id', label: 'Location' },
    ],
    spokes: [
      { id: 'location', title: 'Premises', kind: 'location' },
      { id: 'value', title: 'Replacement value', kind: 'value' },
      { id: 'class', title: 'Asset class', kind: 'class' },
      { id: 'broker', title: 'Broker', kind: 'broker' },
    ],
    Icon: Building2,
  },
  machinery: {
    classKey: 'machinery',
    label: 'Machinery',
    requiredFields: [
      { key: 'description', label: 'Description' },
      { key: 'declared_value', label: 'Declared value' },
    ],
    spokes: [
      { id: 'class', title: 'Asset class', kind: 'class' },
      { id: 'value', title: 'Declared value', kind: 'value' },
      { id: 'location', title: 'Location', kind: 'location' },
      { id: 'broker', title: 'Broker', kind: 'broker' },
    ],
    Icon: Refrigerator,
  },
  stock: {
    classKey: 'stock',
    label: 'Stock',
    requiredFields: [
      { key: 'description', label: 'Description' },
      { key: 'declared_value', label: 'Stock value' },
    ],
    spokes: [
      { id: 'class', title: 'Asset class', kind: 'class' },
      { id: 'value', title: 'Stock value', kind: 'value' },
      { id: 'location', title: 'Location', kind: 'location' },
      { id: 'broker', title: 'Broker', kind: 'broker' },
    ],
    Icon: Package,
  },
  vehicle: {
    classKey: 'vehicle',
    label: 'Vehicles',
    requiredFields: [
      { key: 'description', label: 'Description' },
      { key: 'declared_value', label: 'Fleet value' },
      { key: 'quantity', label: 'Quantity' },
    ],
    spokes: [
      { id: 'quantity', title: 'Units', kind: 'quantity' },
      { id: 'value', title: 'Fleet value', kind: 'value' },
      { id: 'location', title: 'Based at', kind: 'location' },
      { id: 'broker', title: 'Broker', kind: 'broker' },
    ],
    Icon: Truck,
  },
  equipment: {
    classKey: 'equipment',
    label: 'Equipment',
    requiredFields: [
      { key: 'description', label: 'Description' },
      { key: 'declared_value', label: 'Declared value' },
    ],
    spokes: [
      { id: 'class', title: 'Asset class', kind: 'class' },
      { id: 'value', title: 'Declared value', kind: 'value' },
      { id: 'location', title: 'Location', kind: 'location' },
      { id: 'broker', title: 'Broker', kind: 'broker' },
    ],
    Icon: Wrench,
  },
  electronic_equipment: {
    classKey: 'electronic_equipment',
    label: 'Electronic equipment',
    requiredFields: [
      { key: 'description', label: 'Description' },
      { key: 'declared_value', label: 'Declared value' },
    ],
    spokes: FALLBACK.spokes,
    Icon: Cpu,
  },
  contents: {
    classKey: 'contents',
    label: 'Contents',
    requiredFields: [
      { key: 'description', label: 'Description' },
      { key: 'declared_value', label: 'Sum insured' },
    ],
    spokes: FALLBACK.spokes,
    Icon: Package,
  },
  mobile_plant: {
    classKey: 'mobile_plant',
    label: 'Mobile plant',
    requiredFields: [
      { key: 'description', label: 'Description' },
      { key: 'declared_value', label: 'Declared value' },
    ],
    spokes: FALLBACK.spokes,
    Icon: Forklift,
  },
  other: FALLBACK,
}

export function assetTypeDef(assetClass: string): AssetTypeDef {
  return REGISTRY[assetClass] ?? { ...FALLBACK, classKey: assetClass || 'other', label: humaniseClass(assetClass) }
}

export function humaniseClass(assetClass: string): string {
  if (!assetClass) return 'Asset'
  return assetClass.replace(/_/g, ' ')
}

export function knownAssetClasses(): Array<{ id: string; label: string }> {
  return Object.values(REGISTRY)
    .filter((d) => d.classKey !== 'other')
    .map((d) => ({ id: d.classKey, label: d.label }))
}

export function assetStatus(asset: BusinessPageAsset): BusinessAssetStatus {
  if (asset.cover_status === 'covered') return 'covered'
  if (asset.declared_value == null) return 'value_missing'
  if (asset.cover_status === 'review_needed') return 'review_needed'
  if (asset.value_basis === 'unknown') return 'review_needed'
  if (asset.cover_status === 'awaiting_cover') return 'awaiting_cover'
  return 'not_confirmed'
}

export const ASSET_STATUS_LABEL: Record<BusinessAssetStatus, string> = {
  covered: 'Covered',
  awaiting_cover: 'Awaiting cover',
  value_missing: 'Value missing',
  review_needed: 'Review values',
  not_confirmed: 'Not yet confirmed',
}

export const ASSET_STATUS_CLASS: Record<BusinessAssetStatus, string> = {
  covered: 'bg-emerald-100 text-emerald-900',
  awaiting_cover: 'bg-navy-100 text-navy-800',
  value_missing: 'bg-amber-100 text-amber-900',
  review_needed: 'bg-orange-100 text-orange-900',
  not_confirmed: 'bg-sky-100 text-sky-900',
}

export function requiredFieldsForAsset(asset: BusinessPageAsset): AssetRequiredField[] {
  return assetTypeDef(asset.asset_class).requiredFields
}

export function missingRequiredFields(asset: BusinessPageAsset): AssetRequiredField[] {
  return requiredFieldsForAsset(asset).filter((f) => {
    if (f.key === 'declared_value') return asset.declared_value == null || Number.isNaN(Number(asset.declared_value))
    if (f.key === 'description') return !String(asset.display_label ?? '').trim()
    if (f.key === 'location_id') return !asset.location_id
    if (f.key === 'quantity') return asset.quantity == null || asset.quantity < 1
    return false
  })
}

export type PrimaryAction = {
  label: string
  kind: 'confirm_values' | 'request_cover' | 'review_risk' | 'report_claim' | 'none'
}

export function primaryActionFor(status: BusinessAssetStatus): PrimaryAction {
  if (status === 'covered') return { label: 'Report a claim', kind: 'report_claim' }
  if (status === 'value_missing') return { label: 'Confirm values', kind: 'confirm_values' }
  if (status === 'review_needed') return { label: 'Review risk profile', kind: 'review_risk' }
  if (status === 'awaiting_cover' || status === 'not_confirmed') {
    return { label: 'Request cover', kind: 'request_cover' }
  }
  return { label: 'Open', kind: 'none' }
}

export function hubStatusTone(
  status: BusinessAssetStatus,
): 'pending' | 'ok' | 'attention' {
  if (status === 'covered') return 'ok'
  if (status === 'value_missing' || status === 'review_needed') return 'attention'
  return 'pending'
}

/** Spoke body helpers — callers supply React nodes. */
export type SpokeRenderCtx = {
  asset: BusinessPageAsset
  locationLabel: string | null
  brokerName: string | null
  brokerageName: string
  openRequestCount: number
  money: (n: number | null | undefined) => ReactNode
}
