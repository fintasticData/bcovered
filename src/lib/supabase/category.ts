// Sample or Live: the category every copilot job and every Supabase read and write is scoped to. The database enforces it
// (x-data-category header + row-level security); this store only remembers the broker's choice.
import { useSyncExternalStore } from 'react'

export type DataCategory = 'sample' | 'live'

const KEY = 'bcovered_data_category_v1'
const listeners = new Set<() => void>()
const hasStorage = typeof localStorage !== 'undefined'
let current: DataCategory = hasStorage && localStorage.getItem(KEY) === 'live' ? 'live' : 'sample'

export const CATEGORY_LABEL: Record<DataCategory, string> = { sample: 'Sample', live: 'Live' }

export const dataCategory = {
  get: () => current,
  set(next: DataCategory) {
    if (next === current) return
    current = next
    if (hasStorage) localStorage.setItem(KEY, next)
    listeners.forEach((l) => l())
  },
  subscribe(fn: () => void) {
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  },
}

export function useDataCategory(): DataCategory {
  return useSyncExternalStore(dataCategory.subscribe, dataCategory.get, dataCategory.get)
}
