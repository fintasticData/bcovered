import { hashPayload } from '../../lib/hash'

export const normaliseIdNumber = (raw: string) => raw.replace(/[\s-]/g, '').toUpperCase()

/**
 * Lookup hash for identity resolution. Production computes a keyed HMAC server-side with a secret that never reaches the
 * browser; the demo uses the platform hash with a fixed key, so the value is not a security control here.
 */
export const idLookupHash = (raw: string) => `idh_${hashPayload({ k: 'insureflow-demo-id-key', v: normaliseIdNumber(raw) })}`

export const idLast4 = (raw: string) => normaliseIdNumber(raw).slice(-4)

/** Luhn check digit for a numeric payload (the digit that makes payload + digit pass the Luhn test). */
export function luhnCheckDigit(payload: string): number {
  let sum = 0
  for (let i = 0; i < payload.length; i++) {
    let d = Number(payload[payload.length - 1 - i])
    if (i % 2 === 0) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
  }
  return (10 - (sum % 10)) % 10
}

/** Structural check of a South African ID number: 13 digits, a real date of birth and a valid Luhn check digit. */
export function isValidSaId(raw: string): boolean {
  const id = normaliseIdNumber(raw)
  if (!/^\d{13}$/.test(id)) return false
  const mm = Number(id.slice(2, 4))
  const dd = Number(id.slice(4, 6))
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return false
  return luhnCheckDigit(id.slice(0, 12)) === Number(id[12])
}

/** Date of birth implied by an SA ID number, resolving the century against a reference year. */
export function dobFromSaId(raw: string, referenceYear = 2026): string | null {
  const id = normaliseIdNumber(raw)
  if (!isValidSaId(id)) return null
  const yy = Number(id.slice(0, 2))
  const century = 2000 + yy > referenceYear ? 1900 : 2000
  return `${century + yy}-${id.slice(2, 4)}-${id.slice(4, 6)}`
}

/** Builds a structurally valid synthetic SA ID number for fixtures. */
export function makeSaId(dob: string, seq: number, female: boolean): string {
  const [y, m, d] = dob.split('-')
  const gender = String((female ? 0 : 5000) + (seq % 5000)).padStart(4, '0')
  const payload = `${y.slice(2)}${m}${d}${gender}08`
  return `${payload}${luhnCheckDigit(payload)}`
}

/** Age in completed years on a date (both YYYY-MM-DD). */
export function ageOn(dob: string, on: string): number {
  const [by, bm, bd] = dob.split('-').map(Number)
  const [oy, om, od] = on.split('-').map(Number)
  return oy - by - (om < bm || (om === bm && od < bd) ? 1 : 0)
}

export const today = () => new Date().toISOString().slice(0, 10)
