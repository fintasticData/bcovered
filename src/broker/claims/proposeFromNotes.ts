/** Heuristic draft from free-text incident notes for broker/customer claim forms. */

export type ClaimNotesDraft = {
  incident_date: string
  incident_time: string
  time_unknown: boolean
  incident_type: string
  description: string
  item_ids: string[]
}

export type NotesItem = { id: string; display_label: string }

const TYPE_HINTS: Array<{ re: RegExp; value: string }> = [
  { re: /\b(hijack|stolen|theft|stolen)\b/i, value: 'vehicle_theft' },
  { re: /\b(burglar|break[- ]?in|theft at home)\b/i, value: 'burglary' },
  { re: /\b(flood|leak|water damage|burst pipe)\b/i, value: 'water_damage' },
  { re: /\b(hail|storm|wind|tornado)\b/i, value: 'storm_hail' },
  { re: /\b(accident|collision|crash|rear[- ]?ended|hit)\b/i, value: 'motor_accident' },
]

function parseDate(notes: string): string {
  const iso = notes.match(/\b(20\d{2}-\d{2}-\d{2})\b/)
  if (iso) return iso[1]
  const dmy = notes.match(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](20\d{2})\b/)
  if (dmy) {
    const [, d, m, y] = dmy
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  const months: Record<string, string> = {
    jan: '01', january: '01', feb: '02', february: '02', mar: '03', march: '03',
    apr: '04', april: '04', may: '05', jun: '06', june: '06', jul: '07', july: '07',
    aug: '08', august: '08', sep: '09', sept: '09', september: '09',
    oct: '10', october: '10', nov: '11', november: '11', dec: '12', december: '12',
  }
  const named = notes.match(/\b(\d{1,2})\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(20\d{2})\b/i)
  if (named) {
    const mon = months[named[2].toLowerCase()]
    if (mon) return `${named[3]}-${mon}-${named[1].padStart(2, '0')}`
  }
  return ''
}

function parseTime(notes: string): { time: string; unknown: boolean } {
  const m = notes.match(/\b([01]?\d|2[0-3])[:.](\d{2})\b/)
  if (m) return { time: `${m[1].padStart(2, '0')}:${m[2]}`, unknown: false }
  if (/\b(time unknown|don'?t know (the )?time|approx(?:imately)?)\b/i.test(notes)) {
    return { time: '', unknown: true }
  }
  return { time: '', unknown: false }
}

function matchItems(notes: string, items: NotesItem[]): string[] {
  const lower = notes.toLowerCase()
  const hits = items.filter((i) => {
    const label = i.display_label.toLowerCase()
    const parts = label.split(/\s+/).filter((p) => p.length > 2)
    return parts.some((p) => lower.includes(p)) || lower.includes(label)
  })
  return hits.map((h) => h.id)
}

export function proposeClaimFromNotes(notes: string, items: NotesItem[] = []): Partial<ClaimNotesDraft> {
  const trimmed = notes.trim()
  if (!trimmed) return {}
  const type = TYPE_HINTS.find((h) => h.re.test(trimmed))?.value ?? 'motor_accident'
  const { time, unknown } = parseTime(trimmed)
  return {
    incident_date: parseDate(trimmed),
    incident_time: time,
    time_unknown: unknown || !time,
    incident_type: type,
    description: trimmed,
    item_ids: matchItems(trimmed, items),
  }
}

export type VehicleNotesDraft = {
  make: string
  model: string
  year: string
  registration: string
  vin: string
  requested_effective_at: string
  notes: string
}

/** Parse “sold Polo, bought 2022 Toyota Corolla CA123456” style notes. */
export function proposeVehicleReplacementFromNotes(notes: string): Partial<VehicleNotesDraft> {
  const trimmed = notes.trim()
  if (!trimmed) return {}
  const year = trimmed.match(/\b(20\d{2}|19\d{2})\b/)?.[1] ?? ''
  const reg = trimmed.match(/\b([A-Z]{2,3}\s?\d{2,3}(?:\s?[A-Z]{2})?)\b/i)?.[1]?.toUpperCase().replace(/\s+/g, ' ') ?? ''
  const vin = trimmed.match(/\b([A-HJ-NPR-Z0-9]{17})\b/i)?.[1]?.toUpperCase() ?? ''
  const bought = trimmed.match(/\b(?:bought|buying|replacing with|new(?:\s+vehicle)?|got)\s+(?:a\s+)?(?:(\d{4})\s+)?([A-Za-z][A-Za-z0-9-]*)\s+([A-Za-z0-9][A-Za-z0-9 -]{1,40}?)(?=[,.]|\s+reg|\s+with|\s+vin|$)/i)
  const make = bought?.[2] ?? ''
  const model = bought?.[3]?.trim() ?? ''
  const isoDate = parseDate(trimmed)
  const effective = isoDate ? `${isoDate}T09:00` : ''
  return {
    make,
    model,
    year: bought?.[1] || year,
    registration: reg,
    vin,
    requested_effective_at: effective,
    notes: trimmed,
  }
}
