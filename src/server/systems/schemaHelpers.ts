import type { PlannedColumn } from './plannedSchema'

/** Lookup tables keyed by a text code rather than a uuid. */
const TEXT_KEYED = new Set(['roles', 'product_categories', 'industries', 'cover_classes', 'claim_types', 'approval_types', 'benefit_types', 'onboarding_requirements'])

export function keyType(ref: string) {
  return TEXT_KEYED.has(ref) ? 'text' : 'uuid'
}

export const id = (): PlannedColumn => ({ name: 'id', type: 'uuid', key: 'PK' })
export const key = (type = 'text'): PlannedColumn => ({ name: 'key', type, key: 'PK' })
export const fk = (name: string, ref: string, optional = false, note?: string): PlannedColumn => ({ name, type: keyType(ref), key: 'FK', ref, optional, note })
export const pkfk = (name: string, ref: string): PlannedColumn => ({ name, type: keyType(ref), key: 'PK, FK', ref })
export const col = (name: string, type: string, note?: string): PlannedColumn => ({ name, type, note })
export const uk = (name: string, type = 'text', note?: string): PlannedColumn => ({ name, type, key: 'UK', note })
/** Effective-dated validity window. */
export const effective = (): PlannedColumn[] => [col('effective_from', 'date'), col('effective_to', 'date')]
/** Amount with its provenance, as every material financial record carries. */
export const money = (name: string, note?: string): PlannedColumn => ({ name, type: 'numeric(18,2)', note })
