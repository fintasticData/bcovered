// Generic two-source reconciliation over integer values (cents for amounts, micro-units for unit balances).
import type { ItemOutcome } from '../../db/controlsSchema'

export interface ReconEntry {
  key: string
  label: string
  person_id?: string | null
  row_id?: string | null
  values: Record<string, number | null>
}

export interface ReconResultItem {
  key: string
  label: string
  person_id: string | null
  left_row_id: string | null
  right_row_id: string | null
  outcome: ItemOutcome
  field: string | null
  left: number | null
  right: number | null
  difference: number | null
}

export interface ReconResult {
  items: ReconResultItem[]
  left_total: number
  right_total: number
  difference_total: number
  matched: number
  differences: number
  left_only: number
  right_only: number
  duplicates: number
}

const sum = (values: Record<string, number | null>, fields: string[]) => fields.reduce((s, f) => s + (values[f] ?? 0), 0)

export function reconcile(left: ReconEntry[], right: ReconEntry[], fields: string[], tolerances: Record<string, number> = {}): ReconResult {
  const items: ReconResultItem[] = []
  const firstBy = (side: ReconEntry[], dupes: ReconEntry[]) => {
    const map = new Map<string, ReconEntry>()
    side.forEach((e) => (map.has(e.key) ? dupes.push(e) : map.set(e.key, e)))
    return map
  }
  const leftDupes: ReconEntry[] = []
  const rightDupes: ReconEntry[] = []
  const L = firstBy(left, leftDupes)
  const R = firstBy(right, rightDupes)
  let leftTotal = 0
  let rightTotal = 0
  let matched = 0
  let differences = 0
  let leftOnly = 0
  let rightOnly = 0

  for (const [key, l] of L) {
    const r = R.get(key)
    leftTotal += sum(l.values, fields)
    if (!r) {
      leftOnly++
      items.push({ key, label: l.label, person_id: l.person_id ?? null, left_row_id: l.row_id ?? null, right_row_id: null, outcome: 'left_only', field: null, left: sum(l.values, fields), right: null, difference: sum(l.values, fields) })
      continue
    }
    const diffs = fields.filter((f) => Math.abs((l.values[f] ?? 0) - (r.values[f] ?? 0)) > (tolerances[f] ?? 0))
    if (!diffs.length) {
      matched++
      const exact = fields.every((f) => (l.values[f] ?? 0) === (r.values[f] ?? 0))
      items.push({ key, label: l.label, person_id: l.person_id ?? r.person_id ?? null, left_row_id: l.row_id ?? null, right_row_id: r.row_id ?? null, outcome: exact ? 'matched' : 'within_tolerance', field: null, left: sum(l.values, fields), right: sum(r.values, fields), difference: sum(l.values, fields) - sum(r.values, fields) })
      continue
    }
    differences++
    diffs.forEach((f) =>
      items.push({ key, label: l.label, person_id: l.person_id ?? r.person_id ?? null, left_row_id: l.row_id ?? null, right_row_id: r.row_id ?? null, outcome: 'difference', field: f, left: l.values[f] ?? null, right: r.values[f] ?? null, difference: (l.values[f] ?? 0) - (r.values[f] ?? 0) }),
    )
  }
  for (const [key, r] of R) {
    rightTotal += sum(r.values, fields)
    if (!L.has(key)) {
      rightOnly++
      items.push({ key, label: r.label, person_id: r.person_id ?? null, left_row_id: null, right_row_id: r.row_id ?? null, outcome: 'right_only', field: null, left: null, right: sum(r.values, fields), difference: -sum(r.values, fields) })
    }
  }
  ;[...leftDupes.map((e) => ({ e, side: 'left' as const })), ...rightDupes.map((e) => ({ e, side: 'right' as const }))].forEach(({ e, side }) =>
    items.push({
      key: e.key,
      label: e.label,
      person_id: e.person_id ?? null,
      left_row_id: side === 'left' ? (e.row_id ?? null) : null,
      right_row_id: side === 'right' ? (e.row_id ?? null) : null,
      outcome: 'duplicate',
      field: null,
      left: side === 'left' ? sum(e.values, fields) : null,
      right: side === 'right' ? sum(e.values, fields) : null,
      difference: null,
    }),
  )
  return { items, left_total: leftTotal, right_total: rightTotal, difference_total: leftTotal - rightTotal, matched, differences, left_only: leftOnly, right_only: rightOnly, duplicates: leftDupes.length + rightDupes.length }
}
