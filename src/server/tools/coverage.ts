import { z } from 'zod'
import type { CoverageFinding, TwinUpdateProposal } from '../db/commercialSchema'
import type { Json } from '../db/schema'
import type { Repo } from '../db/store'
import { matchCoverage } from '../domain/commercial/coverage'
import { getFixture, guessDocumentType, type ExtractedAsset, type ExtractedSection } from '../domain/commercial/documentFixtures'
import { compactRand } from '../domain/commercial/format'
import { ToolError } from '../lib/errors'
import { refreshOpenAssessments } from './assessment'
import { defineTool, STAFF, type ToolDef } from './registry'

const COVERAGE = ['confirmed_covered', 'confirmed_excluded', 'potentially_covered', 'unknown', 'awaiting_broker_review'] as const
const DOC_TYPES = ['policy_schedule', 'policy_wording', 'asset_register', 'financial_summary', 'business_description', 'risk_survey', 'vehicle_schedule', 'lease', 'contract', 'other'] as const

/** Records a proposed coverage finding unless a broker has already decided this exposure. Agents never confirm cover. */
export function proposeCoverage(repo: Repo, exposureId: string, agent: string | null): CoverageFinding {
  const e = repo.require('risk_exposures', exposureId)
  const prior = repo.list('coverage_findings', (f) => f.exposure_id === e.id).sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0]
  if (prior?.reviewed_by) return prior
  const policies = repo.list('insurance_policies', (p) => p.business_profile_id === e.business_profile_id)
  const sections = repo.list('policy_sections', (s) => s.business_profile_id === e.business_profile_id)
  const m = matchCoverage(e, policies, sections)
  const values = {
    policy_section_id: m.section?.id ?? null,
    status: m.status,
    insurer: m.policy?.insurer ?? null,
    section_name: m.section?.section_name ?? null,
    clause_ref: m.clause_ref,
    page_ref: m.page_ref,
    document_id: m.section?.document_id ?? null,
    rationale: m.rationale,
    proposed_by_agent: agent,
  }
  const finding = prior
    ? repo.update('coverage_findings', prior.id, values)
    : repo.insert('coverage_findings', { ...values, business_profile_id: e.business_profile_id, exposure_id: e.id, reviewed_by: null, reviewed_at: null, review_note: null })
  repo.update('risk_exposures', e.id, { coverage_status: m.status })
  return finding
}

/** Re-checks every exposure on the current Twin against the policy evidence, then refreshes open assessments. */
export function refreshCoverageEvidence(repo: Repo, profileId: string): number {
  const rp = repo.find('business_risk_profiles', (r) => r.business_profile_id === profileId && r.status === 'current')
  if (!rp) return 0
  const exposures = repo.list('risk_exposures', (e) => e.risk_profile_id === rp.id)
  exposures.forEach((e) => proposeCoverage(repo, e.id, 'coverage_analyst'))
  refreshOpenAssessments(repo, profileId)
  return exposures.length
}

function proposalsFor(repo: Repo, documentId: string): TwinUpdateProposal[] {
  const doc = repo.require('business_documents', documentId)
  const fixture = doc.fixture_key ? getFixture(doc.fixture_key) : undefined
  if (!fixture) return []
  const base = { business_profile_id: doc.business_profile_id, document_id: doc.id, status: 'pending' as const, decided_by: null, decided_at: null }
  const out: TwinUpdateProposal[] = []
  if (fixture.policy) {
    const existing = repo.find('insurance_policies', (p) => p.business_profile_id === doc.business_profile_id && p.policy_number === fixture.policy!.policy_number)
    out.push(
      repo.insert('twin_update_proposals', {
        ...base,
        kind: 'add_policy',
        target_id: existing?.id ?? null,
        label: `${fixture.policy.insurer} policy ${fixture.policy.policy_number} with ${fixture.policy.sections.length} sections`,
        current: existing ? ({ insurer: existing.insurer, policy_number: existing.policy_number } as Json) : null,
        suggested: fixture.policy as unknown as Json,
        page_ref: fixture.policy.page_ref,
        conflict: existing ? 'This policy is already on file. Applying replaces its sections with the ones read from this document.' : null,
      }),
    )
  }
  fixture.assets?.forEach((x) => {
    const current = x.asset_id ? repo.get('commercial_assets', x.asset_id) : undefined
    if (current) {
      const same = current.quantity === x.quantity && current.declared_value === x.declared_value && current.value_basis === x.value_basis
      if (same) return
      out.push(
        repo.insert('twin_update_proposals', {
          ...base,
          kind: 'update_asset',
          target_id: current.id,
          label: current.description,
          current: { quantity: current.quantity, declared_value: current.declared_value, value_basis: current.value_basis, source: current.source },
          suggested: { quantity: x.quantity, declared_value: x.declared_value, value_basis: x.value_basis },
          page_ref: x.page_ref,
          conflict:
            current.source === 'verified'
              ? 'The current value was verified by a broker. Applying replaces a verified value, so check the document first.'
              : current.quantity !== x.quantity
                ? `The document lists ${x.quantity}; the records show ${current.quantity}.`
                : null,
        }),
      )
    } else {
      out.push(
        repo.insert('twin_update_proposals', {
          ...base,
          kind: 'add_asset',
          target_id: null,
          label: x.description,
          current: null,
          suggested: x as unknown as Json,
          page_ref: x.page_ref,
          conflict: null,
        }),
      )
    }
  })
  return out
}

function applyProposal(repo: Repo, p: TwinUpdateProposal) {
  const doc = repo.require('business_documents', p.document_id)
  if (p.kind === 'add_policy') {
    const policy = p.suggested as unknown as { insurer: string; policy_number: string; inception_date: string; renewal_date: string; sections: ExtractedSection[] }
    const existing = p.target_id ? repo.get('insurance_policies', p.target_id) : undefined
    const row = existing
      ? repo.update('insurance_policies', existing.id, { document_id: doc.id, source: 'extracted', renewal_date: policy.renewal_date, inception_date: policy.inception_date })
      : repo.insert('insurance_policies', {
          business_profile_id: doc.business_profile_id,
          insurer: policy.insurer,
          policy_number: policy.policy_number,
          inception_date: policy.inception_date,
          renewal_date: policy.renewal_date,
          source: 'extracted',
          document_id: doc.id,
        })
    repo.list('policy_sections', (s) => s.policy_id === row.id).forEach((s) => repo.remove('policy_sections', s.id))
    policy.sections.forEach((s) => repo.insert('policy_sections', { ...s, business_profile_id: doc.business_profile_id, policy_id: row.id, source: 'extracted', document_id: doc.id }))
    refreshCoverageEvidence(repo, doc.business_profile_id)
    return
  }
  if (p.kind === 'update_asset' && p.target_id) {
    const s = p.suggested as { quantity: number; declared_value: number | null; value_basis: 'replacement' | 'market' | 'book' | 'unknown' }
    repo.update('commercial_assets', p.target_id, { quantity: s.quantity, declared_value: s.declared_value, value_basis: s.value_basis, source: 'extracted' })
    return
  }
  if (p.kind === 'add_asset') {
    const a = p.suggested as unknown as ExtractedAsset
    const loc = repo.list('business_locations', (l) => l.business_profile_id === doc.business_profile_id)[0]
    repo.insert('commercial_assets', {
      business_profile_id: doc.business_profile_id,
      location_id: loc?.id ?? null,
      asset_class: a.asset_class,
      description: a.description,
      quantity: a.quantity,
      declared_value: a.declared_value,
      value_basis: a.value_basis,
      valuation_date: null,
      source: 'extracted',
    })
  }
}

export const coverageTools = [
  defineTool({
    name: 'risk.coverage_find_evidence',
    description: 'Find policy sections on file that relate to an exposure, with document and page references.',
    allow: ['agent', ...STAFF],
    sideEffect: false,
    input: z.object({ exposure_id: z.uuid() }),
    run: ({ repo }, { exposure_id }) => {
      const e = repo.require('risk_exposures', exposure_id)
      const policies = repo.list('insurance_policies', (p) => p.business_profile_id === e.business_profile_id)
      return {
        sections: repo
          .list('policy_sections', (s) => s.business_profile_id === e.business_profile_id && e.potential_classes.includes(s.cover_class))
          .map((s) => ({ ...s, insurer: policies.find((p) => p.id === s.policy_id)?.insurer ?? null, policy_number: policies.find((p) => p.id === s.policy_id)?.policy_number ?? null })),
        findings: repo.list('coverage_findings', (f) => f.exposure_id === e.id),
      }
    },
  }),

  defineTool({
    name: 'risk.coverage_compare_exposure',
    description: 'Propose a coverage finding for an exposure from the policy evidence. Never confirms cover; a broker decides.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({ exposure_id: z.uuid() }),
    run: ({ repo, actor }, { exposure_id }) => proposeCoverage(repo, exposure_id, actor.type === 'agent' ? actor.id : 'industry_risk_analyst'),
    auditEntity: (r) => ({ table: 'coverage_findings', id: r.id }),
  }),

  defineTool({
    name: 'risk.coverage_review_finding',
    description: 'A broker records the coverage conclusion for an exposure, citing the wording.',
    allow: STAFF,
    sideEffect: true,
    input: z.object({ finding_id: z.uuid(), status: z.enum(COVERAGE), note: z.string().max(1000).nullable().optional() }),
    run: ({ repo, actor }, { finding_id, status, note }) => {
      if (actor.type !== 'user') throw new ToolError('forbidden', 'Only a person can confirm or exclude cover')
      if ((status === 'confirmed_covered' || status === 'confirmed_excluded') && !note?.trim()) {
        throw new ToolError('validation', 'Cite the clause or wording that supports this conclusion')
      }
      const f = repo.update('coverage_findings', finding_id, { status, reviewed_by: actor.id, reviewed_at: new Date().toISOString(), review_note: note?.trim() || null })
      repo.update('risk_exposures', f.exposure_id, { coverage_status: status })
      refreshOpenAssessments(repo, f.business_profile_id)
      return f
    },
    auditEntity: (r) => ({ table: 'coverage_findings', id: r.id }),
  }),

  defineTool({
    name: 'document.register',
    description: 'Record an uploaded business document. Sample documents carry a simulated extraction.',
    allow: STAFF,
    sideEffect: true,
    input: z.object({
      profile_id: z.uuid(),
      file_name: z.string().trim().min(1).max(200).optional(),
      file_size: z.number().int().nonnegative().nullable().optional(),
      doc_type: z.enum(DOC_TYPES).optional(),
      fixture_key: z.string().optional(),
    }),
    run: ({ repo, actor }, input) => {
      repo.require('business_profiles', input.profile_id)
      const fixture = input.fixture_key ? getFixture(input.fixture_key) : undefined
      if (input.fixture_key && (!fixture || fixture.profile_id !== input.profile_id)) throw new ToolError('not_found', 'That sample document does not belong to this business')
      if (!fixture && !input.file_name) throw new ToolError('validation', 'A file name is required')
      if (fixture) {
        const existing = repo.find('business_documents', (d) => d.business_profile_id === input.profile_id && d.fixture_key === fixture.key && d.status !== 'rejected')
        if (existing) return existing
      }
      return repo.insert('business_documents', {
        business_profile_id: input.profile_id,
        file_name: fixture?.file_name ?? input.file_name!,
        doc_type: fixture?.doc_type ?? input.doc_type ?? guessDocumentType(input.file_name!),
        page_count: fixture?.page_count ?? null,
        file_size: input.file_size ?? null,
        status: 'uploaded',
        is_simulated: Boolean(fixture),
        fixture_key: fixture?.key ?? null,
        extraction_note: null,
        uploaded_by: actor.type === 'user' ? actor.id : null,
      })
    },
    auditEntity: (r) => ({ table: 'business_documents', id: r.id }),
  }),

  defineTool({
    name: 'document.extract_business_facts',
    description: 'Identify the document type and extract relevant fields with page references.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({ document_id: z.uuid() }),
    run: ({ repo }, { document_id }) => {
      const doc = repo.require('business_documents', document_id)
      const fixture = doc.fixture_key ? getFixture(doc.fixture_key) : undefined
      if (!fixture) {
        const updated = repo.update('business_documents', doc.id, {
          extraction_note: 'Stored for manual review. Automatic extraction needs the server-side document model, which is not connected in this demo.',
        })
        return { document: updated, extracted: false, policy: null, assets: [] }
      }
      const updated = repo.update('business_documents', doc.id, {
        status: 'extracted',
        extraction_note: `Simulated extraction from a synthetic sample: ${fixture.summary}`,
      })
      return { document: updated, extracted: true, policy: fixture.policy ?? null, assets: fixture.assets ?? [] }
    },
    auditEntity: (r) => ({ table: 'business_documents', id: r.document.id }),
  }),

  defineTool({
    name: 'document.propose_twin_updates',
    description: 'Match extracted facts to the Twin and propose additions or changes, flagging conflicts. Nothing is applied.',
    allow: ['agent', ...STAFF],
    sideEffect: true,
    input: z.object({ document_id: z.uuid() }),
    run: ({ repo }, { document_id }) => {
      const prior = repo.list('twin_update_proposals', (p) => p.document_id === document_id)
      if (prior.length) return prior
      return proposalsFor(repo, document_id)
    },
    auditEntity: (r) => (r[0] ? { table: 'twin_update_proposals', id: r[0].id } : null),
  }),

  defineTool({
    name: 'document.apply_proposal',
    description: 'A broker applies or rejects a proposed update from a document. Conflicting values need explicit confirmation.',
    allow: STAFF,
    sideEffect: true,
    input: z.object({ proposal_id: z.uuid(), decision: z.enum(['apply', 'reject']), confirm_conflict: z.boolean().optional() }),
    run: ({ repo, actor }, { proposal_id, decision, confirm_conflict }) => {
      if (actor.type !== 'user') throw new ToolError('forbidden', 'Only a person can apply document updates')
      const p = repo.require('twin_update_proposals', proposal_id)
      if (p.status !== 'pending') throw new ToolError('conflict', `This proposal is already ${p.status}`)
      if (decision === 'apply' && p.conflict && !confirm_conflict) throw new ToolError('approval_required', `Confirm the conflict first: ${p.conflict}`)
      if (decision === 'apply') applyProposal(repo, p)
      const updated = repo.update('twin_update_proposals', p.id, { status: decision === 'apply' ? 'applied' : 'rejected', decided_by: actor.id, decided_at: new Date().toISOString() })
      if (!repo.find('twin_update_proposals', (x) => x.document_id === p.document_id && x.status === 'pending')) {
        repo.update('business_documents', p.document_id, { status: 'reviewed' })
      }
      return updated
    },
    auditEntity: (r) => ({ table: 'twin_update_proposals', id: r.id }),
  }),
] as unknown as ToolDef[]

/** One-line description of a proposal's change, for lists and replies. */
export function describeProposal(p: TwinUpdateProposal): { current: string; suggested: string } {
  if (p.kind === 'add_policy') {
    const s = p.suggested as unknown as { insurer: string; policy_number: string; sections: ExtractedSection[] }
    return { current: p.current ? 'Policy already on file' : 'No policy on file', suggested: `${s.insurer} ${s.policy_number}: ${s.sections.map((x) => x.section_name).join(', ')}` }
  }
  const fmt = (v: unknown) => {
    const x = v as { quantity?: number; declared_value?: number | null; value_basis?: string } | null
    if (!x) return 'Not recorded'
    return `${x.quantity ?? 1} × ${x.declared_value != null ? compactRand(x.declared_value) : 'no value'} (${x.value_basis ?? 'unknown'})`
  }
  return { current: fmt(p.current), suggested: fmt(p.suggested) }
}
