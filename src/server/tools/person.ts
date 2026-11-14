import { z } from 'zod'
import type { CustomerPerson, FactSource, FinancialProfile, Person } from '../db/lifeSchema'
import type { Repo } from '../db/store'
import { idLast4, idLookupHash, isValidSaId, normaliseIdNumber } from '../domain/life/identity'
import { ToolError } from '../lib/errors'
import { defineTool, STAFF, type ToolDef } from './registry'

export interface PersonQuery {
  first_names: string
  surname: string
  date_of_birth?: string | null
  id_number?: string | null
}

export interface Resolution {
  person: Person | null
  created: boolean
  match_basis: 'id_number' | 'name_and_date_of_birth' | 'none'
  confidence: number
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * Finds the person behind a set of identity details. An ID number match is authoritative; a name and date-of-birth match
 * is probable. Never merges or overwrites identity: it either returns an existing person or nothing.
 */
export function findPerson(repo: Repo, q: PersonQuery): Resolution {
  if (q.id_number) {
    const hash = idLookupHash(q.id_number)
    const byId = repo.find('persons', (p) => p.id_lookup_hash === hash)
    if (byId) return { person: byId, created: false, match_basis: 'id_number', confidence: 1 }
  }
  if (q.date_of_birth) {
    const candidates = repo.list('persons', (p) => p.date_of_birth === q.date_of_birth && same(p.surname, q.surname) && same(p.first_names, q.first_names))
    const compatible = candidates.filter((p) => !q.id_number || !p.id_lookup_hash)
    if (compatible.length === 1) return { person: compatible[0], created: false, match_basis: 'name_and_date_of_birth', confidence: 0.85 }
  }
  return { person: null, created: false, match_basis: 'none', confidence: 0 }
}

export function resolveOrCreatePerson(repo: Repo, q: PersonQuery, create: boolean): Resolution {
  if (q.id_number && !isValidSaId(q.id_number)) throw new ToolError('validation', 'The ID number is not a valid South African ID number')
  const found = findPerson(repo, q)
  if (found.person || !create) return found
  const person = repo.insert('persons', {
    first_names: q.first_names.trim(),
    surname: q.surname.trim(),
    preferred_name: null,
    date_of_birth: q.date_of_birth ?? null,
    gender: null,
    id_type: q.id_number ? 'sa_id' : null,
    id_lookup_hash: q.id_number ? idLookupHash(q.id_number) : null,
    id_last4: q.id_number ? idLast4(normaliseIdNumber(q.id_number)) : null,
    date_of_death: null,
    is_synthetic: true,
  })
  return { person, created: true, match_basis: 'none', confidence: 0 }
}

/** The people linked to a client account, with their role. */
export function peopleOfCustomer(repo: Repo, customerId: string): Array<CustomerPerson & { person: Person }> {
  return repo
    .list('customer_persons', (l) => l.customer_id === customerId && !l.effective_to)
    .map((l) => ({ ...l, person: repo.require('persons', l.person_id) }))
}

export const selfOf = (repo: Repo, customerId: string) => peopleOfCustomer(repo, customerId).find((l) => l.role === 'self')?.person ?? null

export const currentProfile = (repo: Repo, personId: string): FinancialProfile | undefined =>
  repo.find('financial_profiles', (f) => f.person_id === personId && f.status === 'current')

const money = z.number().min(0).max(1_000_000_000).nullable().optional()

export const personTools = [
  defineTool({
    name: 'person.resolve',
    description: 'Find a person by ID number (authoritative) or name and date of birth (probable). Creates one only when asked and nothing matches.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({
      first_names: z.string().min(1),
      surname: z.string().min(1),
      date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      id_number: z.string().min(6).nullable().optional(),
      create_if_missing: z.boolean().default(false),
    }),
    run: ({ repo }, { create_if_missing, ...q }) => resolveOrCreatePerson(repo, q, create_if_missing),
    auditEntity: (r) => (r.created && r.person ? { table: 'persons', id: r.person.id } : null),
  }),

  defineTool({
    name: 'person.link_customer',
    description: 'Link a person to a client account as self, spouse, dependant, contact or director. Idempotent.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({
      customer_id: z.uuid(),
      person_id: z.uuid(),
      role: z.enum(['self', 'spouse', 'dependant', 'contact', 'director']),
      is_primary: z.boolean().default(false),
    }),
    run: ({ repo }, { customer_id, person_id, role, is_primary }) => {
      repo.require('customers', customer_id)
      repo.require('persons', person_id)
      const existing = repo.find('customer_persons', (l) => l.customer_id === customer_id && l.person_id === person_id && l.role === role && !l.effective_to)
      if (existing) return existing
      if (role === 'self') {
        const other = repo.find('customer_persons', (l) => l.customer_id === customer_id && l.role === 'self' && !l.effective_to)
        if (other) throw new ToolError('conflict', 'This client account already has a different person as “self”')
      }
      return repo.insert('customer_persons', { customer_id, person_id, role, is_primary, effective_from: new Date().toISOString().slice(0, 10), effective_to: null })
    },
    auditEntity: (r) => ({ table: 'customer_persons', id: r.id }),
  }),

  defineTool({
    name: 'profile.capture_financial',
    description: 'Record a new version of a person’s financial profile. The previous version is kept as superseded. Agents cannot mark values verified.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({
      person_id: z.uuid(),
      occupation: z.string().max(120).nullable().optional(),
      employment_status: z.enum(['employed', 'self_employed', 'unemployed', 'retired', 'student', 'other']).nullable().optional(),
      gross_monthly_income: money,
      net_monthly_income: money,
      monthly_obligations: money,
      outstanding_debt: money,
      objectives: z.array(z.string().max(200)).max(10).optional(),
      source: z.enum(['verified', 'declared', 'extracted', 'inferred']).default('declared'),
    }),
    run: ({ repo, actor, jobId }, { person_id, source, ...fields }) => {
      if (actor.type === 'agent' && source === 'verified') throw new ToolError('forbidden', 'Agents cannot mark financial information as verified')
      repo.require('persons', person_id)
      const current = currentProfile(repo, person_id)
      const merged = { ...(current ?? {}), ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)) } as Partial<FinancialProfile>
      const field_sources: Record<string, FactSource> = { ...(current?.field_sources ?? {}) }
      Object.keys(fields).forEach((k) => {
        if ((fields as Record<string, unknown>)[k] !== undefined) field_sources[k] = source
      })
      if (current) repo.update('financial_profiles', current.id, { status: 'superseded' } as Partial<FinancialProfile>)
      return repo.insert('financial_profiles', {
        person_id,
        version: (current?.version ?? 0) + 1,
        status: 'current',
        occupation: merged.occupation ?? null,
        employment_status: merged.employment_status ?? null,
        gross_monthly_income: merged.gross_monthly_income ?? null,
        net_monthly_income: merged.net_monthly_income ?? null,
        monthly_obligations: merged.monthly_obligations ?? null,
        outstanding_debt: merged.outstanding_debt ?? null,
        objectives: merged.objectives ?? [],
        risk_profile: merged.risk_profile ?? null,
        field_sources,
        captured_by: actor.type === 'user' ? actor.id : null,
        job_id: jobId ?? null,
      })
    },
    auditEntity: (r) => ({ table: 'financial_profiles', id: r.id }),
  }),
] as unknown as ToolDef[]
