import { beforeEach, describe, expect, it } from 'vitest'
import { SEED_IDS, TENANT_ID } from '../db/seed'
import { db, Repo } from '../db/store'
import { COVER_CLASSES } from '../domain/commercial/coverClasses'
import { ToolError } from '../lib/errors'
import { getCommercialCover, getPersonalLines, productForCategory } from '../shortTermApi'

const broker = { userId: SEED_IDS.users.broker }
const customer = { userId: SEED_IDS.users.johan }

beforeEach(() => db.reset())

describe('personal lines', () => {
  it('maps lead categories to the five public-site products', () => {
    expect(productForCategory('motor')).toBe('car')
    expect(productForCategory('household_contents')).toBe('contents')
    expect(productForCategory('business_property')).toBeNull()
  })

  it('counts leads per product and leaves commercial leads out', () => {
    const book = getPersonalLines(broker)
    expect(book.products.map((p) => p.key)).toEqual(['car', 'home', 'contents', 'motorbike', 'valuables'])
    const personalLeads = new Repo(TENANT_ID).list('leads', (l) => l.line === 'personal')
    expect(book.products.reduce((s, p) => s + p.leads, 0)).toBe(personalLeads.filter((l) => productForCategory(l.product_category)).length)
    expect(book.policies.every((r) => r.policy.line === 'short_term_personal')).toBe(true)
  })

  it('is staff only', () => {
    expect(() => getPersonalLines(customer)).toThrow(ToolError)
  })
})

describe('commercial cover', () => {
  it('groups every cover class into the six cover areas', () => {
    const book = getCommercialCover(broker)
    expect(book.areas.map((a) => a.group)).toEqual(['property', 'interruption', 'liability', 'motor_transit', 'specialist', 'special_risk'])
    expect(book.areas.flatMap((a) => a.classes).length).toBe(COVER_CLASSES.length)
    expect(book.clients_with_twin).toBeLessThanOrEqual(book.clients)
    book.areas.flatMap((a) => a.classes).forEach((c) => {
      expect(Object.values(c.coverage).reduce((s, n) => s + n, 0)).toBe(c.exposures)
    })
    expect(book.policies.every((r) => r.policy.line === 'short_term_commercial')).toBe(true)
  })

  it('is staff only', () => {
    expect(() => getCommercialCover(customer)).toThrow(ToolError)
  })
})
