import type { MotorDetails } from '../db/schema'

const MAKES: Record<string, string> = {
  toyota: 'Toyota',
  volkswagen: 'Volkswagen',
  vw: 'Volkswagen',
  ford: 'Ford',
  hyundai: 'Hyundai',
  kia: 'Kia',
  suzuki: 'Suzuki',
  nissan: 'Nissan',
  bmw: 'BMW',
  mercedes: 'Mercedes-Benz',
  'mercedes-benz': 'Mercedes-Benz',
  audi: 'Audi',
  mazda: 'Mazda',
  honda: 'Honda',
  renault: 'Renault',
  haval: 'Haval',
  chery: 'Chery',
  isuzu: 'Isuzu',
  mahindra: 'Mahindra',
  volvo: 'Volvo',
  opel: 'Opel',
  peugeot: 'Peugeot',
  jeep: 'Jeep',
}

const MODELS: Record<string, string> = {
  corolla: 'Toyota',
  hilux: 'Toyota',
  fortuner: 'Toyota',
  yaris: 'Toyota',
  starlet: 'Toyota',
  rav4: 'Toyota',
  polo: 'Volkswagen',
  golf: 'Volkswagen',
  tiguan: 'Volkswagen',
  ranger: 'Ford',
  everest: 'Ford',
  ecosport: 'Ford',
  i20: 'Hyundai',
  tucson: 'Hyundai',
  creta: 'Hyundai',
  swift: 'Suzuki',
  jimny: 'Suzuki',
  baleno: 'Suzuki',
  navara: 'Nissan',
  magnite: 'Nissan',
  'cx-5': 'Mazda',
  jazz: 'Honda',
  kwid: 'Renault',
  jolion: 'Haval',
}

const STOP = new Set(['and', 'model', 'which', 'that', 'i', 'it', 'is', 'car', 'vehicle', 'with', 'for', 'the', 'a', 'in'])
const WORD_NUM: Record<string, number> = { zero: 0, none: 0, one: 1, once: 1, two: 2, twice: 2, three: 3, four: 4, five: 5 }

const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function parseMakeModel(text: string): Pick<MotorDetails, 'make' | 'model'> {
  const words = text.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(Boolean)
  let make: string | undefined
  let model: string | undefined
  words.forEach((w, i) => {
    if (!make && MAKES[w]) {
      make = MAKES[w]
      const next = words[i + 1]
      if (next && !STOP.has(next) && !/^\d{4}$/.test(next)) model = title(next)
    }
    if (MODELS[w]) {
      model = w === 'rav4' ? 'RAV4' : w === 'i20' ? 'i20' : title(w)
      make = make ?? MODELS[w]
    }
  })
  return { make, model }
}

export function parseYear(text: string): number | undefined {
  const m = text.match(/\b(19[89]\d|20[0-3]\d)\b/)
  return m ? Number(m[1]) : undefined
}

const NUM = String.raw`(\d{1,3}(?:[\s,]\d{3})+|\d+(?:\.\d+)?)`
const MULT = String.raw`\s*(k|m|mil|million|thousand)?\b`

function applyMultiplier(raw: string, mult?: string) {
  const n = Number(raw.replace(/[\s,]/g, ''))
  if (!mult) return n
  return /^(k|thousand)$/.test(mult) ? n * 1000 : n * 1_000_000
}

/** Money with an R prefix or a k/million suffix; bare numbers only when the question was about value. */
export function parseMoney(text: string, allowBare: boolean): number | undefined {
  const t = text.toLowerCase()
  const prefixed = t.match(new RegExp(String.raw`(?:^|[^a-z])r\s?` + NUM + MULT))
  if (prefixed) return applyMultiplier(prefixed[1], prefixed[2])
  const suffixed = t.match(new RegExp(NUM + String.raw`\s*(k|mil|million|thousand)\b`))
  if (suffixed) return applyMultiplier(suffixed[1], suffixed[2])
  if (allowBare) {
    const bare = t.match(new RegExp(NUM))
    if (bare) {
      const n = applyMultiplier(bare[1])
      if (n >= 10_000) return n
    }
  }
  return undefined
}

export function parseCondition(text: string, targeted: boolean): MotorDetails['condition'] {
  const t = text.toLowerCase()
  if (/brand[\s-]new/.test(t)) return 'new'
  if (/second[\s-]hand|pre[\s-]?owned/.test(t)) return 'used'
  if (!targeted) return undefined
  if (/\bnew\b/.test(t)) return 'new'
  if (/\bused\b/.test(t)) return 'used'
  return undefined
}

export function parseUsage(text: string): MotorDetails['usage'] {
  const t = text.toLowerCase()
  if (/business|for work|company|deliver|client visits/.test(t)) return 'business'
  if (/private|personal|commut|family|leisure/.test(t)) return 'private'
  return undefined
}

export function parseParking(text: string): MotorDetails['parking'] {
  const t = text.toLowerCase()
  if (/garage/.test(t)) return 'garage'
  if (/carport/.test(t)) return 'carport'
  if (/complex|estate|security village|boom/.test(t)) return 'secure_complex'
  if (/driveway|behind (a |the )?gate|yard|property/.test(t)) return 'driveway'
  if (/street|road|outside/.test(t)) return 'street'
  return undefined
}

export function parseTracker(text: string): boolean | undefined {
  const t = text.toLowerCase()
  if (/(no|without|not have|doesn'?t have|don'?t have)( a| any)? (tracker|tracking)/.test(t)) return false
  if (/tracker|tracking|netstar|cartrack|ctrack|matrix|tracked/.test(t)) return true
  return undefined
}

export function parseDriver(text: string, targeted: boolean): Pick<MotorDetails, 'driver_age' | 'licence_years'> {
  const t = text.toLowerCase()
  let driver_age: number | undefined
  let licence_years: number | undefined
  const age = t.match(/(\d{2})\s*(years? old|yrs? old|yo\b|year-old)/) ?? t.match(/\b(?:aged?|i'?m)\s*(\d{2})\b/)
  if (age) driver_age = Number(age[1])
  const lic =
    t.match(/licen[cs]ed?\s*(?:for\s*)?(\d{1,2})\s*(?:years?|yrs?)/) ??
    t.match(/(\d{1,2})\s*(?:years?|yrs?)\s*(?:of\s*)?(?:licen|driving|experience)/) ??
    t.match(/licen[cs]e\s*(?:for\s*)?(\d{1,2})/)
  if (lic) licence_years = Number(lic[1])
  const since = t.match(/(?:licen[cs]ed?|driving)\s*since\s*((?:19|20)\d{2})/)
  if (since) licence_years = new Date().getFullYear() - Number(since[1])
  if (targeted && (driver_age === undefined || licence_years === undefined)) {
    const nums = [...t.matchAll(/\b(\d{1,2})\b/g)].map((m) => Number(m[1]))
    const rest = nums.filter((n) => n !== driver_age && n !== licence_years)
    if (driver_age === undefined && rest.length) {
      const a = rest.find((n) => n >= 17)
      if (a !== undefined) {
        driver_age = a
        rest.splice(rest.indexOf(a), 1)
      }
    }
    if (licence_years === undefined && rest.length) licence_years = rest[0]
  }
  return { driver_age, licence_years }
}

export function parseClaims(text: string, targeted: boolean): number | undefined {
  const t = text.toLowerCase()
  if (/no claims|claim[\s-]free|never claimed|not claimed|haven'?t claimed|zero claims/.test(t)) return 0
  if (!targeted) return undefined
  if (/two or more|more than one|several/.test(t)) return 2
  if (/^\s*(no|none|nope|never|zero|0)\b/.test(t)) return 0
  const n = t.match(/\b(\d{1,2})\b/)
  if (n) return Number(n[1])
  const w = Object.keys(WORD_NUM).find((k) => new RegExp(`\\b${k}\\b`).test(t))
  return w ? WORD_NUM[w] : undefined
}

export function parseCover(text: string, targeted: boolean): MotorDetails['cover_type'] {
  const t = text.toLowerCase()
  if (/comprehensive|full cover|\bcomp\b/.test(t)) return 'comprehensive'
  if (/fire\s*(and|&)\s*theft|tpft/.test(t)) return 'third_party_fire_theft'
  if (/third[\s-]party( only)?/.test(t)) return 'third_party'
  if (targeted && /not sure|don'?t know|unsure|recommend|whatever/.test(t)) return 'comprehensive'
  return undefined
}

export const isAffirmative = (text: string) =>
  /\b(yes|yep|yeah|agree|ok|okay|sure|accept|fine|please do|go ahead|correct|send)\b/i.test(text) && !isNegative(text)

export const isNegative = (text: string) =>
  /\b(don'?t|do not|disagree|decline|nope|not now|no thanks|no thank you)\b|^\s*no\b/i.test(text)

export const parseEmail = (text: string) => text.match(/[^\s@]+@[^\s@]+\.[a-z]{2,}/i)?.[0].toLowerCase()

export function parsePhone(text: string): string | undefined {
  const digits = text.replace(/[^\d+]/g, '')
  return /^(\+27|0)\d{9}$/.test(digits) ? digits : undefined
}

export function parseName(text: string): string | undefined {
  const cleaned = text
    .replace(/^(hi|hello)[,!\s]*/i, '')
    .replace(/^(my name is|my name's|i am|i'm|it's|this is|name:)\s*/i, '')
    .replace(/[^a-zA-Z\s'-]/g, '')
    .trim()
  if (cleaned.length < 2) return undefined
  return cleaned
    .split(/\s+/)
    .slice(0, 4)
    .map((w) => (w.length > 1 ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w.toUpperCase()))
    .join(' ')
}
