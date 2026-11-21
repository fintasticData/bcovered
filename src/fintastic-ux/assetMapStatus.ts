import type { AssetMapCoverStatus } from './assetMapTypes'
import type { BusinessAssetCoverStatus } from '@/api/businessPage'

export const MAP_STATUS_LABEL: Record<AssetMapCoverStatus, string> = {
  covered: 'Covered',
  awaiting_cover: 'Awaiting cover',
  review_due: 'Review due',
}

export const MAP_STATUS_PIN_CLASS: Record<AssetMapCoverStatus, string> = {
  covered: 'bg-emerald-500 text-white ring-emerald-200',
  awaiting_cover: 'bg-amber-400 text-navy-950 ring-amber-200',
  review_due: 'bg-rose-500 text-white ring-rose-200',
}

export const MAP_STATUS_BADGE_CLASS: Record<AssetMapCoverStatus, string> = {
  covered: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  awaiting_cover: 'bg-amber-50 text-amber-900 border-amber-200',
  review_due: 'bg-rose-50 text-rose-800 border-rose-200',
}

export function businessCoverToMapStatus(status: BusinessAssetCoverStatus | string): AssetMapCoverStatus {
  if (status === 'covered') return 'covered'
  if (status === 'awaiting_cover') return 'awaiting_cover'
  return 'review_due'
}
