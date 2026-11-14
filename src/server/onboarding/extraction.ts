// Deterministic extraction for onboarding documents. Text files are parsed for labelled lines ("parsed"); other files
// get fixture values labelled "simulated", because no OCR or model runs in demo mode. Nothing here changes a record:
// every value becomes a proposal that a person applies or dismisses.
import { documentFixture, SAMPLE_FACTS } from '../db/onboardingSeed'
import type { BrokerageApplication, Document, ExtractedFieldProposal } from '../db/onboardingSchema'
import type { Json } from '../db/schema'
import type { Repo } from '../db/store'
import { fieldValue } from './domain'

/** Document label to application field. The first matching label on a line wins. */
const LABELS: Array<{ pattern: RegExp; field: string; docs?: string[] }> = [
  { pattern: /^(enterprise name|registered name|company name)\s*:\s*(.+)$/i, field: 'organisation.legal_name', docs: ['doc_cipc'] },
  { pattern: /^registration number\s*:\s*(.+)$/i, field: 'organisation.registration_number' },
  { pattern: /^registered address\s*:\s*(.+)$/i, field: 'organisation.registered_address' },
  { pattern: /^address\s*:\s*(.+)$/i, field: 'organisation.registered_address', docs: ['doc_fica'] },
  { pattern: /^fsp number\s*:\s*(.+)$/i, field: 'profile.fsp_number' },
  { pattern: /^key individual\s*:\s*(.+)$/i, field: 'profile.key_individual' },
  { pattern: /^compliance officer\s*:\s*(.+)$/i, field: 'profile.compliance_officer' },
]

export function decodeText(base64: string | null, mime: string | null): string | null {
  if (!base64) return null
  if (mime && !/^text\/|json|csv/.test(mime)) return null
  try {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  } catch {
    return null
  }
}

interface Found {
  field: string
  value: string
  excerpt: string
  line: number
}

export function parseLabelledLines(docType: string, text: string): Found[] {
  const out: Found[] = []
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim()
    for (const l of LABELS) {
      if (l.docs && !l.docs.includes(docType)) continue
      const m = line.match(l.pattern)
      if (!m) continue
      const value = m[m.length - 1].trim()
      if (value && !out.some((f) => f.field === l.field)) out.push({ field: l.field, value, excerpt: line, line: i + 1 })
      break
    }
  })
  return out
}

/** Creates proposals for values that differ from the draft. Returns only the new proposals. */
export function proposeFromDocument(repo: Repo, app: BrokerageApplication, doc: Document, text: string | null): ExtractedFieldProposal[] {
  let found: Found[]
  let method: ExtractedFieldProposal['method']
  if (text !== null) {
    found = parseLabelledLines(doc.doc_type, text)
    method = 'parsed'
  } else {
    const fixture = documentFixture(doc.doc_type, SAMPLE_FACTS)
    found = fixture ? parseLabelledLines(doc.doc_type, fixture.text) : []
    method = 'simulated'
  }
  const created: ExtractedFieldProposal[] = []
  for (const f of found) {
    const current = fieldValue(app, f.field) ?? null
    if (current !== null && String(current).trim().toLowerCase() === f.value.toLowerCase()) continue
    const pending = repo.find('extracted_field_proposals', (p) => p.target_field === f.field && p.status === 'suggested' && p.suggested_value === f.value)
    if (pending) continue
    created.push(
      repo.insert('extracted_field_proposals', {
        document_id: doc.id,
        target_table: 'brokerage_applications',
        target_field: f.field,
        current_value: current as Json,
        suggested_value: f.value,
        source_page: method === 'parsed' ? `line ${f.line}` : null,
        source_excerpt: method === 'parsed' ? f.excerpt : `Simulated extraction (no text could be read from ${doc.file_name} in demo mode)`,
        confidence: method === 'parsed' ? 0.95 : 0.4,
        method,
        status: 'suggested',
        decided_by: null,
        decided_at: null,
      }),
    )
  }
  return created
}
