export type AssetMapMobility = 'fixed' | 'portable' | 'vehicle'

export type AssetMapCoverStatus = 'covered' | 'awaiting_cover' | 'review_due'

export type AssetMapPlaceKind = 'site' | 'area' | 'portable_group'

export type AssetMapIndustryPack = 'hospitality' | 'home' | 'logistics' | 'manufacturing' | 'retail' | 'generic'

export interface AssetMapPlace {
  id: string
  label: string
  kind: AssetMapPlaceKind
  parentId: string | null
  subtitle?: string | null
  /** When set, Map renders Site layout (plan + positioned pins) for this place. */
  floorPlanUrl?: string | null
}

export interface AssetMapPin {
  id: string
  label: string
  status: AssetMapCoverStatus
  mobility: AssetMapMobility
  /** Usual base / assigned site. */
  placeId: string | null
  areaId?: string | null
  areaLabel?: string | null
  typicallyUsedPlaceIds: string[]
  insuredValue?: number | null
  assetClass?: string | null
  /** Percent position on Site layout (0–100). */
  layoutX?: number | null
  layoutY?: number | null
}

export interface AssetMapModel {
  title: string
  industryPack: AssetMapIndustryPack
  places: AssetMapPlace[]
  pins: AssetMapPin[]
  customerLabel: string
}

export type AssetMapDrillLevel = 'overview' | 'site' | 'area'
