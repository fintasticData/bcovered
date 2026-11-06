import type { BusinessFacts } from '../domain/commercial/facts'
import { parseMoney } from './motorParser'

const WORD_NUM: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, twenty: 20 }
const NUM_WORD = String.raw`(\d{1,3}|${Object.keys(WORD_NUM).join('|')})`
const toNum = (w: string) => (/^\d+$/.test(w) ? Number(w) : WORD_NUM[w.toLowerCase()])

const SITE_NOUN = String.raw`(?:restaurants?|branches|branch|sites?|shops?|stores?|outlets?|locations?|premises|factories|factory|warehouses?|offices?|practices?|lodges?|guesthouses?|schools?)`
const VEHICLE_NOUN = String.raw`(scooters?|vans?|bakkies?|trucks?|vehicles?|cars?|motorbikes?|bikes?)`

const CITIES: Array<[RegExp, string]> = [
  [/\b(johannesburg|joburg|jozi)\b/i, 'Johannesburg'],
  [/\bcape town\b/i, 'Cape Town'],
  [/\bdurban\b/i, 'Durban'],
  [/\bpretoria|tshwane\b/i, 'Pretoria'],
  [/\bgermiston\b/i, 'Germiston'],
  [/\bstellenbosch\b/i, 'Stellenbosch'],
  [/\bgqeberha|port elizabeth\b/i, 'Gqeberha'],
  [/\bbloemfontein\b/i, 'Bloemfontein'],
]

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
const KNOWN_INSURERS = ['Protea Insure', 'Karoo Mutual', 'Baobab General']

const title = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase())

export function parseSiteCount(text: string): number | undefined {
  const m = text.match(new RegExp(String.raw`\b${NUM_WORD}\s+(?:[a-z-]+\s+)?${SITE_NOUN}\b`, 'i'))
  return m ? toNum(m[1]) : undefined
}

export function parseCity(text: string): string | undefined {
  return CITIES.find(([re]) => re.test(text))?.[1]
}

export function parseCompanyName(text: string): Pick<BusinessFacts, 'registered_name' | 'trading_name'> {
  const out: Pick<BusinessFacts, 'registered_name' | 'trading_name'> = {}
  const pty = text.match(/((?:[A-Z][\w&'’.-]*\s+){0,5}[A-Z][\w&'’.-]*)\s*\(\s*[Pp][Tt][Yy]\s*\)\s*[Ll][Tt][Dd]\b/)
  if (pty) out.registered_name = `${pty[1].trim()} (Pty) Ltd`
  const cc = !pty && text.match(/((?:[A-Z][\w&'’.-]*\s+){0,5}[A-Z][\w&'’.-]*)\s+CC\b/)
  if (cc) out.registered_name = `${cc[1].trim()} CC`
  const trading = text.match(/trad(?:ing|es) as\s+([A-Z][\w&'’.-]*(?:\s+[A-Z][\w&'’.-]*){0,4})/)
  if (trading) out.trading_name = trading[1].trim()
  return out
}

export function parseStructure(text: string): Pick<BusinessFacts, 'same_entity' | 'single_policy'> {
  const t = text.toLowerCase()
  const out: Pick<BusinessFacts, 'same_entity' | 'single_policy'> = {}
  if (/(different|separate)\s+(legal\s+)?(entities|companies)|each (is|has) (its own|a separate) (company|entity)/.test(t)) out.same_entity = false
  else if (/(same|one|single)\s+(legal\s+)?(entity|company)|\ball\b[^.]*\bowned by\b|owned by (the same|one)/.test(t)) out.same_entity = true
  if (/(separate|different) polic(y|ies)|policy (for|per) each|each (has|have) (its|their) own polic/.test(t)) out.single_policy = false
  else if (/\b(one|single|same|a single)\s+policy\b/.test(t)) out.single_policy = true
  return out
}

export function parseLocationNames(text: string): string[] {
  return text
    .replace(/^(we'?re|we are|they'?re|they are|in|at)\s+/i, '')
    .replace(/[.!?]+$/, '')
    .split(/,|\band\b|&|;/i)
    .map((s) => s.replace(/^\s*(in|at|the|one in|one at)\s+/i, '').trim())
    .filter((s) => s.length > 1 && s.length < 40 && /^[A-Za-z][A-Za-z\s'-]*$/.test(s))
    .map(title)
    .slice(0, 10)
}

export function parseOwnership(text: string): BusinessFacts['ownership'] {
  const t = text.toLowerCase()
  const leased = /\b(lease|leased|leasing|rent|rented|renting|tenants?)\b/.test(t)
  const owned = /\bwe own\b|\bown (the |our |all )?(building|buildings|premises|property|properties)\b|\b(building|premises|property) is owned\b/.test(t)
  if (leased && owned) return 'mixed'
  if (leased) return 'leased'
  if (owned) return 'owned'
  return undefined
}

export function parseEmployees(text: string): number | undefined {
  const m =
    text.match(/\b(\d{1,5})\s*(?:full[- ]time\s+)?(?:staff|employees|people|workers|team members)\b/i) ??
    text.match(/\bemploy(?:s)?\s+(?:about\s+|around\s+)?(\d{1,5})\b/i)
  return m ? Number(m[1]) : undefined
}

/** Spreads a stated value across sites unless it was stated per site. */
export function perSite(text: string, value: number, sites: number | undefined): number {
  if (/\b(per|each|a)\s+(branch|site|restaurant|store|shop|location|outlet)\b|\beach\b/i.test(text) || !sites || sites <= 1) return value
  return Math.round(value / sites)
}

export function parseBackupPower(text: string, knownSites: string[]): Pick<BusinessFacts, 'backup_power' | 'backup_power_locations'> {
  const t = text.toLowerCase()
  const mentioned = knownSites.filter((s) => t.includes(s.toLowerCase()))
  if (mentioned.length && mentioned.length < knownSites.length) return { backup_power: 'partial', backup_power_locations: mentioned }
  if (/\b(all|every|each)\b[^.]*\b(generator|backup|inverter|ups)\b|\b(generators?|backup|inverters?)\b[^.]*\b(all|every|each)\b/.test(t) && !/\bno\b|don'?t/.test(t)) {
    return { backup_power: 'all', backup_power_locations: knownSites }
  }
  if (/\b(no|none|don'?t|do not|without)\b[^.]*\b(generator|backup|inverter|power)\b|\bnone of\b/.test(t)) return { backup_power: 'none', backup_power_locations: [] }
  if (/\b(generator|backup|inverter|ups)\b/.test(t)) return { backup_power: 'all', backup_power_locations: knownSites }
  return {}
}

export function parseFire(text: string): Pick<BusinessFacts, 'fire_suppression' | 'fire_notes'> {
  const t = text.toLowerCase()
  const out: Pick<BusinessFacts, 'fire_suppression' | 'fire_notes'> = {}
  if (/\b(no|not|don'?t|without)\b[^.]*\b(suppression|sprinkler|fire system)/.test(t)) out.fire_suppression = false
  else if (/suppression|sprinkler|ansul|fire system/.test(t)) out.fire_suppression = true
  const serviced = t.match(/serviced\s+([a-z0-9 ]{3,30}?)(?:[.,;]|$)/)
  if (serviced) out.fire_notes = `serviced ${serviced[1].trim()}`
  return out
}

const SECURITY: Array<[RegExp, string]> = [
  [/\balarms?\b/i, 'Alarm'],
  [/armed response/i, 'Armed response'],
  [/\bcctv\b|cameras?/i, 'CCTV'],
  [/\bguards?\b|guarding/i, 'Guarding'],
  [/electric fenc/i, 'Electric fence'],
  [/burglar bars|security gates?/i, 'Burglar bars'],
]

export function parseSecurity(text: string, targeted: boolean): string[] | undefined {
  const found = SECURITY.filter(([re]) => re.test(text)).map(([, label]) => label)
  if (found.length) return found
  if (targeted && /^\s*(no|none|nothing)\b/i.test(text)) return []
  return undefined
}

export function parseVehicles(text: string, knownSites: string[], targeted: boolean): Pick<BusinessFacts, 'vehicle_count' | 'vehicle_type' | 'vehicle_location'> {
  const t = text.toLowerCase()
  if (/\b(no|don'?t (have|own)( any)?|without)\b[^.]*\bvehicles?\b|\bwe use (uber|mr ?d|a courier)/.test(t) || (targeted && /^\s*no\b/.test(t))) {
    return { vehicle_count: 0 }
  }
  const m = t.match(new RegExp(String.raw`\b${NUM_WORD}\s+(?:[a-z-]+\s+)?${VEHICLE_NOUN}\b`, 'i'))
  if (!m) return {}
  const at = knownSites.find((s) => t.includes(s.toLowerCase()))
  return { vehicle_count: toNum(m[1]), vehicle_type: m[2].replace(/s$/, ''), ...(at ? { vehicle_location: at } : {}) }
}

export function parsePublic(text: string, targeted: boolean): Pick<BusinessFacts, 'seating_per_location' | 'card_payments' | 'online_orders'> {
  const t = text.toLowerCase()
  const out: Pick<BusinessFacts, 'seating_per_location' | 'card_payments' | 'online_orders'> = {}
  const seats = t.match(/\b(\d{1,4})\s*(?:seats|covers|seated|people seated)\b/) ?? t.match(/\bseats?\s+(?:about\s+|around\s+)?(\d{1,4})\b/)
  if (seats) out.seating_per_location = Number(seats[1])
  if (/cash only/.test(t)) out.card_payments = false
  else if (/\bcards?\b|speedpoint|\bpos\b|tap to pay/.test(t)) out.card_payments = true
  if (/online|uber ?eats|mr ?d|app orders|website orders|delivery apps?/.test(t)) out.online_orders = true
  else if (targeted && out.card_payments !== undefined) out.online_orders = false
  return out
}

export function parseCurrentCover(text: string, targeted: boolean): Pick<BusinessFacts, 'current_insurer' | 'renewal_month' | 'single_policy'> {
  const out: Pick<BusinessFacts, 'current_insurer' | 'renewal_month' | 'single_policy'> = {}
  const t = text.toLowerCase()
  if (/\b(not|un)insured\b|no insurance|not currently insured|don'?t have (any )?insurance/.test(t)) {
    out.current_insurer = ''
    return out
  }
  const known = KNOWN_INSURERS.find((n) => t.includes(n.toLowerCase()))
  const named = text.match(/(?:with|insured by|insurer is|through)\s+([A-Z][\w]*(?:\s+[A-Z][\w]*){0,2})/)
  if (known) out.current_insurer = known
  else if (named && (targeted || /insur|polic/i.test(text))) out.current_insurer = named[1].trim()
  const month = MONTHS.find((m) => new RegExp(`renew[a-z]*[^.]*\\b${m}\\b|\\b${m}\\b[^.]*renew`).test(t))
  if (month) out.renewal_month = title(month)
  if (/\b(one|single|same)\s+policy\b/.test(t)) out.single_policy = true
  return out
}

export function parseClaimsHistory(text: string, targeted: boolean): Pick<BusinessFacts, 'claims_last_5_years' | 'claims_notes'> {
  const t = text.toLowerCase().trim()
  if (/no claims|never claimed|claim[\s-]free|haven'?t claimed|not claimed/.test(t) || (targeted && /^\s*(no|none|never)\b/.test(t))) {
    return { claims_last_5_years: 0 }
  }
  const m = t.match(new RegExp(String.raw`\b${NUM_WORD}\s+claims?\b`, 'i'))
  if (!m) return {}
  return { claims_last_5_years: toNum(m[1]), claims_notes: text.trim().replace(/[.!]+$/, '') }
}

export function parseAmount(text: string, targeted: boolean) {
  return parseMoney(text, targeted)
}
