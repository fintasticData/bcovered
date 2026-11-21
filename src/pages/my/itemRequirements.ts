/** Insurance-required fields by item type for quote readiness. */

export type ItemDetails = Record<string, unknown> | null | undefined

export type RequiredField = {
  key: string
  label: string
  fromDetails?: boolean
}

const BY_TYPE: Record<string, RequiredField[]> = {
  vehicle: [
    { key: 'make', label: 'Make', fromDetails: true },
    { key: 'model', label: 'Model', fromDetails: true },
    { key: 'year', label: 'Year', fromDetails: true },
    { key: 'declared_value', label: 'Declared value' },
  ],
  contents: [{ key: 'declared_value', label: 'Sum insured' }],
  building: [
    { key: 'address', label: 'Address', fromDetails: true },
    { key: 'declared_value', label: 'Building sum insured' },
  ],
  equipment: [
    { key: 'description', label: 'Description', fromDetails: true },
    { key: 'declared_value', label: 'Declared value' },
  ],
}

export function requiredFieldsForType(itemType: string): RequiredField[] {
  return BY_TYPE[itemType] ?? [{ key: 'declared_value', label: 'Declared value' }]
}

export function missingRequiredFields(opts: {
  item_type: string
  display_label?: string | null
  insured_value?: number | null
  details?: ItemDetails
}): RequiredField[] {
  const details = opts.details ?? {}
  return requiredFieldsForType(opts.item_type).filter((f) => {
    if (f.key === 'declared_value') {
      const v = opts.insured_value ?? details.declared_value ?? details.contents_limit ?? details.building_sum_insured
      return v == null || v === '' || Number.isNaN(Number(v))
    }
    if (f.key === 'description') {
      const d = details.description ?? opts.display_label
      return !String(d ?? '').trim()
    }
    const raw = details[f.key]
    return raw == null || String(raw).trim() === ''
  })
}

/** Heuristic parse of "Toyota Corolla 2019" style labels into make/model/year. */
export function parseVehicleLabel(label: string): { make?: string; model?: string; year?: string } {
  const parts = label.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return {}
  const last = parts[parts.length - 1]
  const year = /^\d{4}$/.test(last ?? '') ? last : undefined
  const body = year ? parts.slice(0, -1) : parts
  if (body.length === 0) return year ? { year } : {}
  if (body.length === 1) return { make: body[0], year }
  return { make: body[0], model: body.slice(1).join(' '), year }
}
