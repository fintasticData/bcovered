// Request and result shapes for Russ "Generate leads". Everything the models return is parsed here before it can reach
// the database; anything that fails validation is dropped, never repaired by guessing.
import { z } from 'zod'

const text = (max: number) => z.string().trim().min(1).max(max)
const optionalText = (max: number) => z.string().trim().max(max).nullish().transform((v) => (v ? v : null))
export const httpUrl = z.string().trim().max(2000).regex(/^https?:\/\/[^\s]+$/i, 'Must be a public http(s) URL')
export const email = z.string().trim().toLowerCase().max(254).regex(/^[^@\s<>()[\]\\,;:"]+@[a-z0-9.-]+\.[a-z]{2,}$/i, 'Must be an email address')

export const Filters = z.object({
  area: text(160),
  radius_km: z.number().min(0.5).max(200).nullish().transform((v) => v ?? null),
  business_function: optionalText(120),
  category: optionalText(120),
  industry: optionalText(120),
  cover_type: z.string().trim().max(80).nullish().transform((v) => v || 'Commercial property'),
  requested_count: z.number().int().min(1).max(50).nullish().transform((v) => v ?? 20),
})
export type Filters = z.infer<typeof Filters>

/** What /parse returns: the same fields, but any of them may still be missing for the broker to fill in. */
export const ParsedFilters = z.object({
  area: optionalText(160),
  radius_km: z.number().min(0.5).max(200).nullish().transform((v) => v ?? null),
  business_function: optionalText(120),
  category: optionalText(120),
  industry: optionalText(120),
  cover_type: optionalText(80),
  requested_count: z.number().int().min(1).max(50).nullish().transform((v) => v ?? null),
})
export type ParsedFilters = z.infer<typeof ParsedFilters>

export const AreaFinding = z.object({
  finding: text(600),
  relevance_to_cover: text(600),
  source_url: httpUrl,
  published_on: z.string().trim().regex(/^\d{4}(-\d{2}(-\d{2})?)?$/).nullish().transform((v) => v ?? null),
})
export type AreaFinding = z.infer<typeof AreaFinding>

export const AreaResearch = z.object({
  findings: z.array(z.unknown()).max(20).default([]),
  localities: z.array(z.string().trim().min(2).max(80)).max(40).default([]),
  summary: z.string().trim().max(1200).nullish().transform((v) => v ?? null),
})

export const Candidate = z.object({
  business_name: text(160),
  website: httpUrl.nullish().transform((v) => v ?? null),
  source_url: httpUrl.nullish().transform((v) => v ?? null),
  locality: optionalText(80),
  address: optionalText(240),
})
export type Candidate = z.infer<typeof Candidate>

/** The model's reading of the fetched pages for one business. Quotes are checked against the page text afterwards. */
export const Verification = z.object({
  matches_filters: z.boolean(),
  reason: z.string().trim().max(400).nullish().transform((v) => v ?? null),
  business_name: optionalText(160),
  email: email.nullish().transform((v) => v ?? null),
  email_source_url: httpUrl.nullish().transform((v) => v ?? null),
  address: optionalText(240),
  locality: optionalText(80),
  location_quote: optionalText(400),
  location_source_url: httpUrl.nullish().transform((v) => v ?? null),
  business_function: optionalText(160),
  activity_quote: optionalText(400),
  activity_source_url: httpUrl.nullish().transform((v) => v ?? null),
  category: optionalText(120),
  industry: optionalText(120),
  cover_fit: optionalText(500),
  phone: optionalText(40),
})
export type Verification = z.infer<typeof Verification>

/** One saved business, in the shape the brief asks for (plus the evidence the checks relied on). */
export const Lead = z.object({
  business_name: text(160),
  email,
  area: text(160),
  address: optionalText(240),
  website: httpUrl.nullish().transform((v) => v ?? null),
  phone: optionalText(40),
  business_function: text(160),
  category: optionalText(120),
  industry: optionalText(120),
  cover_fit: text(500),
  email_source_url: httpUrl,
  location_source_url: httpUrl,
  activity_source_url: httpUrl,
  activity_quote: text(400),
  location_basis: z.enum(['locality_match', 'area_named']),
  retrieved_at: z.string().datetime(),
  research: z.object({
    observed_activity: text(400),
    location_quote: text(400),
    assets: z.literal('unknown'),
    current_insurance: z.literal('unknown'),
    purchasing_intent: z.literal('unknown'),
    candidate_source_url: httpUrl.nullable(),
  }),
})
export type Lead = z.infer<typeof Lead>

export const Budget = z.object({
  max_seconds: z.number().int().min(30).max(1800),
  max_searches: z.number().int().min(1).max(50),
  max_page_fetches: z.number().int().min(5).max(400),
  max_cost_usd: z.number().min(0.05).max(10),
})
export type Budget = z.infer<typeof Budget>

export const CreateRun = z.object({
  category: z.enum(['sample', 'live']),
  prompt: z.string().trim().max(4000).default(''),
  filters: Filters,
  idempotency_key: z.string().trim().min(8).max(120),
  budget: Budget.partial().optional(),
})

export const StepRequest = z.object({ category: z.enum(['sample', 'live']), worker: z.string().trim().min(8).max(80) })

/** Pulls the first JSON object out of a model reply (Sonar models cannot be forced into JSON mode). */
export function parseJsonObject(content: string): unknown {
  const cleaned = content.replace(/```(?:json)?/gi, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start < 0 || end <= start) return null
    try {
      return JSON.parse(cleaned.slice(start, end + 1))
    } catch {
      return null
    }
  }
}
