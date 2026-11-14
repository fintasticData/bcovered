import { SAMPLE_MOTOR_REQUEST } from '@/data/qe/sampleMotorRequest'
import { SAMPLE_MOTOR_RESULT } from '@/data/qe/sampleMotorResult'
import {
  COVER_OPTIONS,
  type CoverCode,
  type MotorFormErrors,
  type MotorQuoteForm,
  type QeExcess,
  type QeInsurerQuote,
  type QeMotorRequest,
  type QeQuotedItem,
  type QeResult,
} from './types'

const QUOTE_VALID_DAYS = 30

export function formFromRequest(req: Readonly<QeMotorRequest> = SAMPLE_MOTOR_REQUEST): MotorQuoteForm {
  const p = req.policyholder
  const v = req.vehicles[0]
  return {
    name: p.name,
    surname: p.surname,
    mobile: p.mobile ?? '',
    email: p.email ?? '',
    street: p.address.street ?? '',
    suburb: p.address.suburb,
    postalCode: p.address.postalCode,
    meadCode: v.meadCode,
    year: String(v.year),
    cover: v.cover ?? '0',
  }
}

export function validateMotorForm(form: MotorQuoteForm, today = new Date()): MotorFormErrors {
  const e: MotorFormErrors = {}
  if (form.name.trim().length < 2) e.name = 'Enter the policyholder’s first name.'
  if (form.surname.trim().length < 2) e.surname = 'Enter the policyholder’s surname.'
  if (!/^(\+27|0)\d{9}$/.test(form.mobile.replace(/\s/g, ''))) e.mobile = 'Use a South African mobile number, e.g. 082 123 4567.'
  if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) e.email = 'Enter a valid email address.'
  if (!form.street.trim()) e.street = 'Enter the street address.'
  if (!form.suburb.trim()) e.suburb = 'Enter the suburb.'
  if (!/^\d{4}$/.test(form.postalCode.trim())) e.postalCode = 'Postal code must be 4 digits.'
  if (!/^\d{8}$/.test(form.meadCode.trim())) e.meadCode = 'M&M code must be 8 digits.'
  const year = Number(form.year)
  const maxYear = today.getFullYear() + 1
  if (!/^\d{4}$/.test(form.year.trim()) || year < 1950 || year > maxYear) e.year = `Enter a model year between 1950 and ${maxYear}.`
  if (!isCoverCode(form.cover)) e.cover = 'Choose a cover type.'
  return e
}

/** A new request from the current form values; supporting A.1 fields come from a fresh copy of the starter fixture. */
export function buildMotorRequest(form: MotorQuoteForm, starter: Readonly<QeMotorRequest> = SAMPLE_MOTOR_REQUEST): QeMotorRequest {
  const req = structuredClone(starter) as QeMotorRequest
  req.policyholder.name = form.name.trim()
  req.policyholder.surname = form.surname.trim()
  req.policyholder.mobile = form.mobile.replace(/\s/g, '')
  req.policyholder.email = form.email.trim()
  req.policyholder.address.street = form.street.trim()
  req.policyholder.address.suburb = form.suburb.trim()
  req.policyholder.address.postalCode = form.postalCode.trim()
  req.vehicles[0].meadCode = form.meadCode.trim()
  req.vehicles[0].year = Number(form.year)
  req.vehicles[0].cover = form.cover
  return req
}

let lastRequestID = 0

/** Fixed sample insurer results for a submitted request. Synchronous and local; premiums never depend on the request. */
export function getSampleQuotes(request: Readonly<QeMotorRequest>, now = new Date()): QeResult {
  if (!request.vehicles.length) throw new Error('At least one insured item is required')
  const requestID = Math.max(lastRequestID + 1, Math.floor(now.getTime() / 1000))
  lastRequestID = requestID
  const quoteDate = localIso(now)
  const quoteExpires = localIso(new Date(now.getTime() + QUOTE_VALID_DAYS * 86_400_000))

  const result = structuredClone(SAMPLE_MOTOR_RESULT) as QeResult
  result.requestID = requestID
  for (const q of result.quotes ?? []) {
    q.requestID = requestID
    q.quoteDate = quoteDate
    q.quoteExpires = q.hasQuote ? quoteExpires : null
    q.validDays = q.hasQuote ? QUOTE_VALID_DAYS : 0
    q.hasExpired = false
  }
  return result
}

/** Local date-time without a zone, matching the QE response format, e.g. 2026-09-10T14:19:47.406. */
function localIso(d: Date) {
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`
}

export const isCoverCode = (code: string): code is CoverCode => COVER_OPTIONS.some((o) => o.code === code)

export const coverLabel = (code: string | undefined) => COVER_OPTIONS.find((o) => o.code === code)?.label ?? 'Not specified'

export const vehicleItem = (q: QeInsurerQuote): QeQuotedItem | undefined => q.items.find((i) => i.name === 'Vehicle') ?? q.items[0]

/** True only when the insurer rated the vehicle. Insurer status "Complete" means it answered, not that it quoted. */
export const isQuoted = (q: QeInsurerQuote) => q.hasQuote && vehicleItem(q)?.status === 'Quoted'

export const basicExcess = (item: QeQuotedItem | undefined): QeExcess | undefined =>
  item?.excess.find((x) => x.name.toLowerCase() === 'basic') ?? item?.excess[0]

export const NO_VALUE = '—'

export const formatRand = (n: number) => `R${Math.round(n).toLocaleString('en-US')}`

export const formatQeDate = (value: string | null) =>
  value ? new Date(value).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Not applicable'
