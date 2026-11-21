import type { BusinessPageAsset, BusinessPageDto } from '@/api/businessPage'
import { businessCoverToMapStatus } from './assetMapStatus'
import { areasForPack, industryPackForKey, inferAreaId, layoutSlotForArea } from './illustratedPacks'
import type { AssetMapModel, AssetMapPin, AssetMapPlace } from './assetMapTypes'

function pinFromAsset(
  asset: BusinessPageAsset,
  pack: ReturnType<typeof industryPackForKey>,
  index: number,
): AssetMapPin {
  const areaId = inferAreaId(asset.display_label, pack) ?? inferAreaId(asset.description, pack)
  const areaLabel = areaId ? areasForPack(pack).find((a) => a.id === areaId)?.label ?? areaId : null
  const slot = layoutSlotForArea(areaId, index)
  return {
    id: asset.id,
    label: asset.display_label,
    status: businessCoverToMapStatus(asset.cover_status),
    mobility: asset.mobility_type ?? 'fixed',
    placeId: asset.usual_base_place_id ?? asset.location_id,
    areaId,
    areaLabel,
    typicallyUsedPlaceIds: asset.typically_used_place_ids ?? [],
    insuredValue: asset.insured_value ?? asset.declared_value,
    assetClass: asset.asset_class,
    layoutX: slot.x,
    layoutY: slot.y,
  }
}

export function toBusinessMapModel(dto: BusinessPageDto, industryKey?: string | null): AssetMapModel {
  const pack = industryPackForKey(industryKey ?? dto.industry_name)
  const places: AssetMapPlace[] = [
    ...dto.locations.map((l) => ({
      id: l.id,
      label: l.name,
      kind: 'site' as const,
      parentId: null,
      subtitle: l.city,
      floorPlanUrl: l.floor_plan_url ?? null,
    })),
    {
      id: 'portable-group',
      label: 'Portable items',
      kind: 'portable_group',
      parentId: null,
      subtitle: 'Phones, laptops and tablets',
    },
  ]

  const pins = dto.assets.map((a, i) => pinFromAsset(a, pack, i))

  return {
    title: `${dto.trading_name} · assets`,
    industryPack: pack,
    places,
    pins,
    customerLabel: dto.trading_name,
  }
}

/** Assets visible at a place: assigned there, or portable typically used there. */
export function assetsAtPlace(
  dto: BusinessPageDto,
  placeId: string | null,
  areaId?: string | null,
): BusinessPageAsset[] {
  let list: BusinessPageAsset[]
  if (!placeId) {
    list = dto.assets
  } else if (placeId === 'portable-group') {
    list = dto.assets.filter((a) => (a.mobility_type ?? 'fixed') === 'portable')
  } else {
    list = dto.assets.filter((a) => {
      if (a.location_id === placeId || a.usual_base_place_id === placeId) return true
      return (a.typically_used_place_ids ?? []).includes(placeId)
    })
  }

  if (!areaId || !placeId || placeId === 'portable-group') return list

  const pack = industryPackForKey(dto.industry_name)
  return list.filter((a) => {
    const mobility = a.mobility_type ?? 'fixed'
    if (mobility === 'portable' && a.usual_base_place_id !== placeId && a.location_id !== placeId) {
      return true
    }
    const inferred = inferAreaId(a.display_label, pack) ?? inferAreaId(a.description, pack)
    if (areaId === 'branch-items') return !inferred
    return inferred === areaId
  })
}
