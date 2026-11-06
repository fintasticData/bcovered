import type { ProductSlug } from '../data/products'

export interface QuoteInput {
  product: ProductSlug
  value: number
  age: number
  province: string
  claimsLast3Years: number
  excess: 'low' | 'standard' | 'high'
  security: boolean
}

export interface InsurerOffer {
  insurer: string
  monthly: number
  excess: number
  rating: number
  highlights: string[]
  recommended?: boolean
}

const baseRate: Record<ProductSlug, number> = {
  car: 0.0042,
  home: 0.00055,
  contents: 0.0018,
  business: 0.0024,
  motorbike: 0.0048,
  valuables: 0.0075,
}

const provinceLoad: Record<string, number> = {
  Gauteng: 1.18,
  'Western Cape': 1.05,
  'KwaZulu-Natal': 1.1,
  'Eastern Cape': 1.0,
  'Free State': 0.94,
  Limpopo: 0.95,
  Mpumalanga: 0.97,
  'North West': 0.96,
  'Northern Cape': 0.9,
}

export const provinces = Object.keys(provinceLoad)

const panel: { insurer: string; factor: number; rating: number; highlights: string[] }[] = [
  { insurer: 'Protea Insure', factor: 1.04, rating: 4.6, highlights: ['Claims paid in 48h', 'Free 24/7 assist'] },
  { insurer: 'Karoo Mutual', factor: 0.97, rating: 4.4, highlights: ['Cash-back after 3 years', 'Flexible excess'] },
  { insurer: 'Baobab General', factor: 1.0, rating: 4.3, highlights: ['Load-shedding cover', 'Power surge included'] },
  { insurer: 'Springbok Assure', factor: 0.92, rating: 4.2, highlights: ['Premium decreases monthly', 'Online claims'] },
]

/** Deterministic mock rating – illustrative only, not a real underwriting model. */
export function calculateOffers(q: QuoteInput): InsurerOffer[] {
  const ageLoad = q.product === 'car' || q.product === 'motorbike'
    ? q.age < 25 ? 1.45 : q.age < 30 ? 1.15 : q.age > 70 ? 1.2 : 1
    : 1
  const claimsLoad = 1 + q.claimsLast3Years * 0.18
  const excessLoad = { low: 1.15, standard: 1, high: 0.86 }[q.excess]
  const securityLoad = q.security ? 0.92 : 1
  const region = provinceLoad[q.province] ?? 1

  const base =
    q.value * baseRate[q.product] * ageLoad * claimsLoad * excessLoad * securityLoad * region
  const minimum = { car: 389, home: 215, contents: 129, business: 650, motorbike: 245, valuables: 79 }[q.product]

  const excessAmount = Math.round(
    Math.max(2500, q.value * { low: 0.01, standard: 0.025, high: 0.05 }[q.excess]) / 50,
  ) * 50

  const offers = panel.map((p) => ({
    insurer: p.insurer,
    monthly: Math.round(Math.max(minimum, base * p.factor)),
    excess: Math.round((excessAmount * (p.factor > 1 ? 0.9 : 1.05)) / 50) * 50,
    rating: p.rating,
    highlights: p.highlights,
  }))

  offers.sort((a, b) => a.monthly - b.monthly)
  const best = [...offers].sort((a, b) => b.rating / b.monthly - a.rating / a.monthly)[0]
  return offers.map((o) => ({ ...o, recommended: o.insurer === best.insurer }))
}

export const rand = (n: number) =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 })
    .format(n)
    .replace('ZAR', 'R')

export function reference(prefix: string) {
  return `${prefix}-${Date.now().toString(36).toUpperCase().slice(-6)}`
}
