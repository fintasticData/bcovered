// Member matching for imported rows. Strongest evidence first: ID number, then employer or fund number, then surname and
// date of birth. A second row for the same person in one file is a duplicate, never a second member.
import type { MatchStatus } from '../../db/controlsSchema'

export interface Candidate {
  person_id: string
  id_hash: string | null
  employee_number?: string | null
  member_number?: string | null
  surname: string
  date_of_birth: string | null
}

export interface MatchInput {
  id_hash: string | null
  employee_number?: string | null
  member_number?: string | null
  surname?: string | null
  date_of_birth?: string | null
}

export interface MatchResult {
  status: MatchStatus
  person_id: string | null
  confidence: number | null
  basis: string | null
}

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()

/** Lookup maps so matching stays linear for files of thousands of rows. */
export interface CandidateIndex {
  byId: Map<string, Candidate>
  byMember: Map<string, Candidate>
  byEmployee: Map<string, Candidate>
  byNameDob: Map<string, Candidate[]>
}

export function indexCandidates(candidates: Candidate[]): CandidateIndex {
  const index: CandidateIndex = { byId: new Map(), byMember: new Map(), byEmployee: new Map(), byNameDob: new Map() }
  candidates.forEach((c) => {
    if (c.id_hash && !index.byId.has(c.id_hash)) index.byId.set(c.id_hash, c)
    if (c.member_number && !index.byMember.has(norm(c.member_number))) index.byMember.set(norm(c.member_number), c)
    if (c.employee_number && !index.byEmployee.has(norm(c.employee_number))) index.byEmployee.set(norm(c.employee_number), c)
    if (c.date_of_birth) {
      const k = `${norm(c.surname)}|${c.date_of_birth}`
      index.byNameDob.set(k, [...(index.byNameDob.get(k) ?? []), c])
    }
  })
  return index
}

export function matchOne(row: MatchInput, candidates: Candidate[] | CandidateIndex): MatchResult {
  const index = Array.isArray(candidates) ? indexCandidates(candidates) : candidates
  if (row.id_hash) {
    const byId = index.byId.get(row.id_hash)
    if (byId) return { status: 'matched', person_id: byId.person_id, confidence: 1, basis: 'ID number' }
  }
  if (row.member_number) {
    const byMember = index.byMember.get(norm(row.member_number))
    if (byMember) return { status: 'matched', person_id: byMember.person_id, confidence: 0.97, basis: 'Fund member number' }
  }
  if (row.employee_number) {
    const byEmployee = index.byEmployee.get(norm(row.employee_number))
    if (byEmployee) {
      const surnameAgrees = !row.surname || norm(byEmployee.surname) === norm(row.surname)
      return surnameAgrees
        ? { status: 'matched', person_id: byEmployee.person_id, confidence: 0.95, basis: 'Employee number' }
        : { status: 'probable', person_id: byEmployee.person_id, confidence: 0.6, basis: 'Employee number (surname differs)' }
    }
  }
  if (row.surname && row.date_of_birth) {
    const byName = index.byNameDob.get(`${norm(row.surname)}|${row.date_of_birth}`) ?? []
    if (byName.length === 1) return { status: 'probable', person_id: byName[0].person_id, confidence: 0.8, basis: 'Surname and date of birth' }
  }
  return { status: 'new', person_id: null, confidence: null, basis: null }
}

/** Matches every row and marks repeats of an already matched person (or repeated keys) as duplicates. */
export function matchAll(rows: Array<MatchInput & { key: string }>, candidates: Candidate[]): MatchResult[] {
  const index = indexCandidates(candidates)
  const seenPeople = new Set<string>()
  const seenKeys = new Set<string>()
  return rows.map((row) => {
    const r = matchOne(row, index)
    const dupe = (r.person_id && seenPeople.has(r.person_id)) || (row.key && seenKeys.has(row.key))
    if (r.person_id) seenPeople.add(r.person_id)
    if (row.key) seenKeys.add(row.key)
    return dupe ? { ...r, status: 'duplicate' as const, basis: `Repeat of an earlier row (${r.basis ?? row.key})` } : r
  })
}
