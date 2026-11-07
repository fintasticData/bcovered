import type { Json } from '../../db/schema'
import type { TwinSnapshot } from '../../db/commercialSchema'
import type { Repo } from '../../db/store'
import { coverLabel } from './coverClasses'
import { compactRand } from './format'

/** A frozen copy of the records a Twin version was built from. */
export function twinSnapshot(repo: Repo, profileId: string): TwinSnapshot {
  const p = repo.require('business_profiles', profileId)
  const of = <T extends { business_profile_id: string }>(rows: T[]) => rows.filter((r) => r.business_profile_id === profileId)
  return {
    profile: {
      registered_name: p.registered_name,
      trading_name: p.trading_name,
      annual_turnover: p.annual_turnover,
      employee_count: p.employee_count,
      operating_regions: [...p.operating_regions],
      existing_cover: p.existing_cover ? { ...p.existing_cover } : null,
      loss_history: p.loss_history ? { ...p.loss_history } : null,
    },
    locations: of(repo.list('business_locations')).map((l) => ({
      id: l.id,
      name: l.name,
      occupancy: l.occupancy,
      ownership: l.ownership,
      fire_protection: [...l.fire_protection],
      security: [...l.security],
      backup_power: l.backup_power,
    })),
    activities: of(repo.list('business_activities')).map((a) => ({ id: a.id, kind: a.kind, name: a.name, share_of_revenue: a.share_of_revenue })),
    assets: of(repo.list('commercial_assets')).map((a) => ({
      id: a.id,
      asset_class: a.asset_class,
      description: a.description,
      quantity: a.quantity,
      declared_value: a.declared_value,
      value_basis: a.value_basis,
      location_id: a.location_id,
    })),
    policy_sections: of(repo.list('policy_sections')).map((s) => ({ id: s.id, cover_class: s.cover_class, sum_insured: s.sum_insured, limit_of_indemnity: s.limit_of_indemnity })),
    exposure_count: 0,
  }
}

export interface ChangeDraft {
  entity_table: string
  entity_id: string | null
  change_type: 'added' | 'removed' | 'changed'
  field: string | null
  label: string
  before: Json
  after: Json
  finding: string
  /** Broker review task to create, if the change needs one. */
  task: { title: string; detail: string } | null
}

const NUMBER_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten']
const count = (n: number) => NUMBER_WORDS[n] ?? String(n)
const money = (v: number | null) => (v === null ? 'not recorded' : compactRand(v))

/** Structured differences between two snapshots, each with a finding and, where it matters for cover, a review task. */
export function compareSnapshots(before: TwinSnapshot, after: TwinSnapshot): ChangeDraft[] {
  const out: ChangeDraft[] = []
  const bp = before.profile
  const ap = after.profile

  if (bp.annual_turnover !== ap.annual_turnover) {
    out.push({
      entity_table: 'business_profiles',
      entity_id: null,
      change_type: 'changed',
      field: 'annual_turnover',
      label: 'Annual turnover',
      before: bp.annual_turnover,
      after: ap.annual_turnover,
      finding: `Declared turnover changed from ${money(bp.annual_turnover)} to ${money(ap.annual_turnover)}. The business interruption sum insured may need review.`,
      task: { title: 'Review business interruption basis after turnover change', detail: `Turnover ${money(bp.annual_turnover)} → ${money(ap.annual_turnover)}.` },
    })
  }
  if (bp.employee_count !== ap.employee_count) {
    out.push({
      entity_table: 'business_profiles',
      entity_id: null,
      change_type: 'changed',
      field: 'employee_count',
      label: 'Employees',
      before: bp.employee_count,
      after: ap.employee_count,
      finding: `Employees changed from ${bp.employee_count ?? 'not recorded'} to ${ap.employee_count ?? 'not recorded'}.`,
      task: null,
    })
  }
  if ((bp.existing_cover?.insurer ?? null) !== (ap.existing_cover?.insurer ?? null) || (bp.existing_cover?.renewal_month ?? null) !== (ap.existing_cover?.renewal_month ?? null)) {
    out.push({
      entity_table: 'business_profiles',
      entity_id: null,
      change_type: 'changed',
      field: 'existing_cover',
      label: 'Current insurer and renewal',
      before: (bp.existing_cover ?? null) as unknown as Json,
      after: (ap.existing_cover ?? null) as unknown as Json,
      finding: 'The recorded insurer or renewal month changed.',
      task: { title: 'Confirm the current insurer and renewal date', detail: 'Recorded cover details changed since the last assessment.' },
    })
  }
  if ((bp.loss_history?.claims_last_5_years ?? null) !== (ap.loss_history?.claims_last_5_years ?? null)) {
    out.push({
      entity_table: 'business_profiles',
      entity_id: null,
      change_type: 'changed',
      field: 'loss_history',
      label: 'Claims in five years',
      before: bp.loss_history?.claims_last_5_years ?? null,
      after: ap.loss_history?.claims_last_5_years ?? null,
      finding: 'The recorded claims history changed and should be disclosed to insurers.',
      task: { title: 'Review the updated claims history', detail: 'Claims history changed since the last assessment.' },
    })
  }

  const byId = <T extends { id: string }>(xs: T[]) => new Map(xs.map((x) => [x.id, x]))
  const bl = byId(before.locations)
  const al = byId(after.locations)
  after.locations.filter((l) => !bl.has(l.id)).forEach((l) =>
    out.push({
      entity_table: 'business_locations',
      entity_id: l.id,
      change_type: 'added',
      field: null,
      label: l.name,
      before: null,
      after: l.occupancy,
      finding: `New location: ${l.name}. It needs a new location assessment and confirmation that it is on the schedule.`,
      task: { title: `Assess the new location: ${l.name}`, detail: 'Added since the last assessment.' },
    }),
  )
  before.locations.filter((l) => !al.has(l.id)).forEach((l) =>
    out.push({
      entity_table: 'business_locations',
      entity_id: l.id,
      change_type: 'removed',
      field: null,
      label: l.name,
      before: l.occupancy,
      after: null,
      finding: `${l.name} is no longer recorded. Confirm whether it should be removed from cover.`,
      task: { title: `Confirm removal of ${l.name}`, detail: 'Removed since the last assessment.' },
    }),
  )
  after.locations.forEach((l) => {
    const b = bl.get(l.id)
    if (!b) return
    if (b.ownership !== l.ownership || b.backup_power !== l.backup_power || b.fire_protection.join() !== l.fire_protection.join() || b.security.join() !== l.security.join()) {
      out.push({
        entity_table: 'business_locations',
        entity_id: l.id,
        change_type: 'changed',
        field: 'risk_controls',
        label: `${l.name} risk details`,
        before: { ownership: b.ownership, backup_power: b.backup_power, fire_protection: b.fire_protection, security: b.security },
        after: { ownership: l.ownership, backup_power: l.backup_power, fire_protection: l.fire_protection, security: l.security },
        finding: `Tenure or risk controls at ${l.name} changed.`,
        task: null,
      })
    }
  })

  const ba = byId(before.activities)
  const aa = byId(after.activities)
  after.activities.filter((a) => !ba.has(a.id)).forEach((a) =>
    out.push({
      entity_table: 'business_activities',
      entity_id: a.id,
      change_type: 'added',
      field: null,
      label: a.name,
      before: null,
      after: a.kind,
      finding: `New ${a.kind.replace(/_/g, ' ')}: ${a.name}.`,
      task: a.kind === 'operation' ? { title: `Review the new activity: ${a.name}`, detail: 'New activities can change liability and property exposures.' } : null,
    }),
  )
  before.activities.filter((a) => !aa.has(a.id)).forEach((a) =>
    out.push({ entity_table: 'business_activities', entity_id: a.id, change_type: 'removed', field: null, label: a.name, before: a.kind, after: null, finding: `${a.name} is no longer recorded.`, task: null }),
  )
  after.activities.forEach((a) => {
    const b = ba.get(a.id)
    if (b && b.share_of_revenue !== a.share_of_revenue) {
      const pct = (v: number | null) => (v === null ? 'not recorded' : `${Math.round(v * 100)}%`)
      out.push({
        entity_table: 'business_activities',
        entity_id: a.id,
        change_type: 'changed',
        field: 'share_of_revenue',
        label: a.name,
        before: b.share_of_revenue,
        after: a.share_of_revenue,
        finding: `${a.name} share of revenue changed from ${pct(b.share_of_revenue)} to ${pct(a.share_of_revenue)}.`,
        task: null,
      })
    }
  })

  const bs = byId(before.assets)
  const as = byId(after.assets)
  after.assets.filter((a) => !bs.has(a.id)).forEach((a) =>
    out.push({
      entity_table: 'commercial_assets',
      entity_id: a.id,
      change_type: 'added',
      field: null,
      label: a.description,
      before: null,
      after: { quantity: a.quantity, declared_value: a.declared_value },
      finding: `New asset: ${a.description}${a.declared_value !== null ? ` (${money(a.declared_value)})` : ''}. It needs to be added to the relevant section.`,
      task: { title: `Add ${a.description.toLowerCase()} to the insurance schedule`, detail: 'Asset added since the last assessment.' },
    }),
  )
  before.assets.filter((a) => !as.has(a.id)).forEach((a) =>
    out.push({
      entity_table: 'commercial_assets',
      entity_id: a.id,
      change_type: 'removed',
      field: null,
      label: a.description,
      before: { quantity: a.quantity, declared_value: a.declared_value },
      after: null,
      finding: `${a.description} is no longer recorded.`,
      task: null,
    }),
  )
  after.assets.forEach((a) => {
    const b = bs.get(a.id)
    if (!b) return
    if (b.quantity !== a.quantity) {
      const diff = a.quantity - b.quantity
      const noun = a.asset_class === 'vehicle' ? (Math.abs(diff) === 1 ? 'vehicle' : 'vehicles') : Math.abs(diff) === 1 ? 'item' : 'items'
      out.push({
        entity_table: 'commercial_assets',
        entity_id: a.id,
        change_type: 'changed',
        field: 'quantity',
        label: a.description,
        before: b.quantity,
        after: a.quantity,
        finding:
          diff > 0
            ? `${count(diff)} additional ${noun} require${diff === 1 ? 's' : ''} insurance schedule verification.`
            : `${count(-diff)} fewer ${noun} recorded; confirm they have been removed from the schedule.`,
        task: { title: `Verify ${a.description.toLowerCase()} on the insurance schedule (${b.quantity} → ${a.quantity})`, detail: `${a.description}: ${b.quantity} previously, ${a.quantity} now.` },
      })
    }
    if (b.declared_value !== a.declared_value || b.value_basis !== a.value_basis) {
      out.push({
        entity_table: 'commercial_assets',
        entity_id: a.id,
        change_type: 'changed',
        field: 'declared_value',
        label: a.description,
        before: { declared_value: b.declared_value, value_basis: b.value_basis },
        after: { declared_value: a.declared_value, value_basis: a.value_basis },
        finding: `${a.description} value changed from ${money(b.declared_value)} (${b.value_basis}) to ${money(a.declared_value)} (${a.value_basis}). Sums insured may need updating.`,
        task: { title: `Review the sum insured for ${a.description.toLowerCase()}`, detail: `${money(b.declared_value)} → ${money(a.declared_value)}.` },
      })
    }
  })

  const bsec = byId(before.policy_sections)
  const asec = byId(after.policy_sections)
  after.policy_sections.filter((s) => !bsec.has(s.id)).forEach((s) =>
    out.push({
      entity_table: 'policy_sections',
      entity_id: s.id,
      change_type: 'added',
      field: null,
      label: coverLabel(s.cover_class),
      before: null,
      after: s.sum_insured ?? s.limit_of_indemnity,
      finding: `Policy evidence added for ${coverLabel(s.cover_class)}.`,
      task: null,
    }),
  )
  before.policy_sections.filter((s) => !asec.has(s.id)).forEach((s) =>
    out.push({
      entity_table: 'policy_sections',
      entity_id: s.id,
      change_type: 'removed',
      field: null,
      label: coverLabel(s.cover_class),
      before: s.sum_insured ?? s.limit_of_indemnity,
      after: null,
      finding: `Policy evidence for ${coverLabel(s.cover_class)} is no longer on file.`,
      task: { title: `Confirm whether ${coverLabel(s.cover_class)} cover still applies`, detail: 'A policy section on file at the last assessment is no longer recorded.' },
    }),
  )
  return out
}
