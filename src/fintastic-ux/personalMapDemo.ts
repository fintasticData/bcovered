/**
 * Phase 1 personal map overlay — Home / Work places and laptop typically used at both.
 * Mapping-layer only (no personal schema migration).
 */
import type { CustomerPageDto, CustomerPageItem } from '@/api/customerPage'
import { layoutSlotForArea } from './illustratedPacks'
import type { AssetMapModel, AssetMapPin, AssetMapPlace } from './assetMapTypes'

export const PERSONAL_MAP_PLACES: AssetMapPlace[] = [
  {
    id: 'place-home',
    label: 'My home',
    kind: 'site',
    parentId: null,
    floorPlanUrl: '/map-packs/map-home.jpg',
  },
  { id: 'place-work', label: 'Work', kind: 'site', parentId: null },
  { id: 'place-away', label: 'Away from home', kind: 'site', parentId: null },
  { id: 'portable-group', label: 'Portable items', kind: 'portable_group', parentId: null },
]

const HOME_AREA = 'study'

function pinStatus(item: CustomerPageItem): AssetMapPin['status'] {
  if (item.customer_status === 'covered' || item.cover_status === 'covered') return 'covered'
  if (item.customer_status === 'awaiting_cover' || item.cover_status === 'awaiting_cover') return 'awaiting_cover'
  return 'review_due'
}

function isLaptop(item: CustomerPageItem): boolean {
  const hay = `${item.display_label} ${item.item_type}`.toLowerCase()
  return hay.includes('laptop') || hay.includes('notebook') || hay.includes('macbook')
}

/** Enrich customer page items with mobility / places for the Map view. */
export function enrichPersonalItemsForMap(items: CustomerPageItem[]): CustomerPageItem[] {
  return items.map((item) => {
    if (!isLaptop(item)) {
      return {
        ...item,
        details: {
          ...(item.details ?? {}),
          mobility_type: item.item_type?.toLowerCase().includes('vehicle') ? 'vehicle' : 'fixed',
          usual_base_place_id: 'place-home',
          typically_used_place_ids: item.location_id ? [item.location_id] : ['place-home'],
        },
      }
    }
    return {
      ...item,
      location_id: item.location_id ?? 'place-home',
      location_name: item.location_name ?? 'My home',
      details: {
        ...(item.details ?? {}),
        mobility_type: 'portable',
        usual_base_place_id: 'place-home',
        typically_used_place_ids: ['place-home', 'place-work'],
        typically_used_place_names: ['My home', 'Work'],
        area_id: HOME_AREA,
        area_label: 'Study',
      },
    }
  })
}

export function toPersonalMapModel(dto: CustomerPageDto): AssetMapModel {
  const items = enrichPersonalItemsForMap(dto.items)
  const pins: AssetMapPin[] = items.map((item, index) => {
    const details = (item.details ?? {}) as Record<string, unknown>
    const mobility =
      details.mobility_type === 'portable' || details.mobility_type === 'vehicle' ? details.mobility_type : 'fixed'
    const typicallyUsed = Array.isArray(details.typically_used_place_ids)
      ? (details.typically_used_place_ids as string[])
      : []
    const areaId = (details.area_id as string) || null
    const slot = layoutSlotForArea(areaId, index)
    return {
      id: item.id,
      label: item.display_label,
      status: pinStatus(item),
      mobility,
      placeId: (details.usual_base_place_id as string) || item.location_id || 'place-home',
      areaId,
      areaLabel: (details.area_label as string) || null,
      typicallyUsedPlaceIds: typicallyUsed,
      insuredValue: item.insured_value,
      assetClass: item.item_type,
      layoutX: slot.x,
      layoutY: slot.y,
    }
  })

  return {
    title: 'My home & belongings',
    industryPack: 'home',
    places: PERSONAL_MAP_PLACES,
    pins,
    customerLabel: dto.greeting_name || dto.full_name,
  }
}
