import { describe, expect, it } from 'vitest'
import { SAMPLE_MOTOR_REQUEST } from '@/data/qe/sampleMotorRequest'
import { SAMPLE_MOTOR_RESULT } from '@/data/qe/sampleMotorResult'
import {
  basicExcess,
  buildMotorRequest,
  coverLabel,
  formatRand,
  formFromRequest,
  getSampleQuotes,
  isQuoted,
  validateMotorForm,
  vehicleItem,
} from '../sampleQuotes'

const NOW = new Date(2026, 10, 11, 18, 30, 0)

describe('sample motor request', () => {
  it('prefills a valid form from the starter fixture', () => {
    const form = formFromRequest()
    expect(form).toMatchObject({ name: 'Lerato', surname: 'Sample', meadCode: '12345678', year: '2020', cover: '0', postalCode: '3629' })
    expect(validateMotorForm(form, NOW)).toEqual({})
  })

  it('builds a new request from the current form values and leaves the fixture untouched', () => {
    const before = JSON.stringify(SAMPLE_MOTOR_REQUEST)
    const req = buildMotorRequest({ ...formFromRequest(), surname: 'Mokoena', year: '2023', cover: '7', mobile: '082 555 0101' })

    expect(req.policyholder.surname).toBe('Mokoena')
    expect(req.policyholder.mobile).toBe('0825550101')
    expect(req.vehicles[0].year).toBe(2023)
    expect(typeof req.vehicles[0].year).toBe('number')
    expect(req.vehicles[0].cover).toBe('7')
    expect(req.vehicles[0].meadCode).toBe('12345678')
    expect(req.policyholder.address.postalCode).toBe('3629')
    expect(req).not.toHaveProperty('vehicles.0.coverType')

    expect(req.policyholder.idNumber).toBe('8301075073084')
    expect(req.policyholder.licence).toEqual({ code: '3', issueDate: '01 Jan 2005' })
    expect(req.policyholder.noClaim).toEqual({ noClaimYears: 3, insuredYears: 5 })
    expect(req.vehicles[0].colour).toBe('White')
    expect(req.source).toBe('ExternalAPI')
    expect(req.hasITCConsent).toBe(true)

    expect(JSON.stringify(SAMPLE_MOTOR_REQUEST)).toBe(before)
    expect(req.policyholder).not.toBe(SAMPLE_MOTOR_REQUEST.policyholder)
  })

  it('reports inline errors for invalid visible fields', () => {
    const errors = validateMotorForm(
      { ...formFromRequest(), surname: '', mobile: '123', email: 'nope', postalCode: '36', meadCode: '12AB', year: '1890' },
      NOW,
    )
    expect(Object.keys(errors).sort()).toEqual(['email', 'meadCode', 'mobile', 'postalCode', 'surname', 'year'])
  })

  it('maps cover codes to readable labels', () => {
    expect(coverLabel('0')).toBe('Comprehensive')
    expect(coverLabel('8')).toBe('Total loss')
  })
})

describe('getSampleQuotes', () => {
  const request = buildMotorRequest(formFromRequest())

  it('returns a completed result shaped like Appendix B.3', () => {
    const r = getSampleQuotes(request, NOW)
    expect(r).toMatchObject({
      status: 'Complete',
      requestStatus: 'Open',
      isComplete: true,
      expectedInsurers: 3,
      completedInsurers: 3,
      elapsedSeconds: 0,
      estimatedSecondsRemaining: null,
    })
    expect(Number.isInteger(r.requestID)).toBe(true)
    expect(r.quotes).toHaveLength(3)
    for (const q of r.quotes!) {
      expect(q.requestID).toBe(r.requestID)
      expect(q.items).toHaveLength(1)
      expect(q.items[0].index).toBe(1)
      expect(q.insurerImage).toBe('')
    }
    const ids = r.quotes!.map((q) => [q.quoteID, q.insurerID, q.insurerReference])
    expect(new Set(ids.map((x) => x[0])).size).toBe(3)
    expect(new Set(ids.map((x) => x[1])).size).toBe(3)
    expect(new Set(ids.map((x) => x[2])).size).toBe(3)
  })

  it('returns the fixed outcomes for insurers A, B and C', () => {
    const [a, b, c] = getSampleQuotes(request, NOW).quotes!

    expect(a).toMatchObject({ insurerName: 'Demo Insurer A', hasQuote: true, totalPremium: 780 })
    expect(vehicleItem(a)).toMatchObject({ status: 'Quoted', premium: 780 })
    expect(basicExcess(vehicleItem(a))?.value).toBe(5000)

    expect(b).toMatchObject({ insurerName: 'Demo Insurer B', hasQuote: true, totalPremium: 855 })
    expect(vehicleItem(b)).toMatchObject({ status: 'Quoted', premium: 855 })
    expect(basicExcess(vehicleItem(b))?.value).toBe(3500)

    expect(c).toMatchObject({ insurerName: 'Demo Insurer C', hasQuote: false, totalPremium: 0, status: 'Complete' })
    expect(vehicleItem(c)).toMatchObject({ status: 'No Quote', premium: 0, excess: [] })
    expect(vehicleItem(c)?.messages).toEqual([
      expect.objectContaining({ messageTypeName: 'QuoteItem', message: 'Vehicle outside this insurer’s demo acceptance criteria.' }),
    ])
    expect(isQuoted(a)).toBe(true)
    expect(isQuoted(c)).toBe(false)
  })

  it('dates quoted offers on submission with a 30-day expiry', () => {
    const [a, b, c] = getSampleQuotes(request, NOW).quotes!
    for (const q of [a, b]) {
      expect(q.validDays).toBe(30)
      expect(q.hasExpired).toBe(false)
      const days = (new Date(q.quoteExpires!).getTime() - new Date(q.quoteDate!).getTime()) / 86_400_000
      expect(Math.round(days)).toBe(30)
      expect(new Date(q.quoteDate!).getTime()).toBe(NOW.getTime())
    }
    expect(c.quoteExpires).toBeNull()
  })

  it('returns a fresh object every time and never mutates the template', () => {
    const before = JSON.stringify(SAMPLE_MOTOR_RESULT)
    const first = getSampleQuotes(request, NOW)
    first.quotes![0].totalPremium = 1
    const second = getSampleQuotes(request, NOW)
    expect(second).not.toBe(first)
    expect(second.quotes![0].totalPremium).toBe(780)
    expect(second.requestID).toBeGreaterThan(first.requestID)
    expect(JSON.stringify(SAMPLE_MOTOR_RESULT)).toBe(before)
  })

  it('keeps premiums fixed when the request changes', () => {
    const edited = buildMotorRequest({ ...formFromRequest(), surname: 'Other', year: '2015', cover: '2' })
    expect(getSampleQuotes(edited, NOW).quotes!.map((q) => q.totalPremium)).toEqual([780, 855, 0])
  })
})

describe('formatRand', () => {
  it('formats whole rands with comma grouping', () => {
    expect(formatRand(780)).toBe('R780')
    expect(formatRand(5000)).toBe('R5,000')
    expect(formatRand(3500)).toBe('R3,500')
  })
})
