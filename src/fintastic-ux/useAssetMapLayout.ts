import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

export type AssetLayoutMode = 'table' | 'cards' | 'map'

function parseLayout(raw: string | null): AssetLayoutMode {
  if (raw === 'cards' || raw === 'map') return raw
  return 'table'
}

/** URL params for Assets & cover map: layout, place, area, item, panel. */
export function useAssetMapLayout() {
  const [params, setParams] = useSearchParams()
  const layout = parseLayout(params.get('layout'))
  const placeId = params.get('place')
  const areaId = params.get('area')
  const itemKey = params.get('item')
  const panel = params.get('panel')

  const setLayout = useCallback(
    (next: AssetLayoutMode) => {
      setParams(
        (p) => {
          const copy = new URLSearchParams(p)
          if (next === 'table') copy.delete('layout')
          else copy.set('layout', next)
          if (next !== 'map') {
            copy.delete('place')
            copy.delete('area')
          }
          return copy
        },
        { replace: true },
      )
    },
    [setParams],
  )

  const setPlace = useCallback(
    (place: string | null) => {
      setParams(
        (p) => {
          const copy = new URLSearchParams(p)
          if (!place) {
            copy.delete('place')
            copy.delete('area')
          } else {
            copy.set('place', place)
            copy.delete('area')
          }
          return copy
        },
        { replace: true },
      )
    },
    [setParams],
  )

  const setArea = useCallback(
    (area: string | null) => {
      setParams(
        (p) => {
          const copy = new URLSearchParams(p)
          if (!area) copy.delete('area')
          else copy.set('area', area)
          return copy
        },
        { replace: true },
      )
    },
    [setParams],
  )

  const setItem = useCallback(
    (item: string | null, openPanel?: boolean) => {
      setParams(
        (p) => {
          const copy = new URLSearchParams(p)
          if (!item) {
            copy.delete('item')
            copy.delete('panel')
          } else {
            copy.set('item', item)
            if (openPanel) copy.set('panel', copy.get('panel') || 'overview')
          }
          return copy
        },
        { replace: true },
      )
    },
    [setParams],
  )

  const setPanel = useCallback(
    (next: string | null) => {
      setParams(
        (p) => {
          const copy = new URLSearchParams(p)
          if (!next) copy.delete('panel')
          else copy.set('panel', next)
          return copy
        },
        { replace: true },
      )
    },
    [setParams],
  )

  return {
    layout,
    setLayout,
    placeId,
    setPlace,
    areaId,
    setArea,
    itemKey,
    setItem,
    panel,
    setPanel,
    isMap: layout === 'map',
  }
}
