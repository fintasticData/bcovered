/** Client-side mirror of pc_resolve_policy_version (effective inclusive, superseded exclusive). */

export type PolicyVersionForResolve = {
  id: string
  version_no: number
  effective_at: string
  superseded_at: string | null
  terms?: Record<string, unknown> | null
  items?: Array<{ id: string; display_label: string; item_type: string; item_terms?: Record<string, unknown> | null }>
}

export type CoverOnLossDate =
  | {
      review_needed: false
      version_id: string
      excess: number | null
      item_labels: string[]
      effective_at: string
      superseded_at: string | null
    }
  | {
      review_needed: true
      version_id: null
      excess: null
      item_labels: string[]
      reason: string
    }

function dayBounds(iso: string) {
  const d = new Date(iso)
  const start = new Date(d)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { start, end, at: d }
}

export function resolveCoverOnLossDate(
  versions: PolicyVersionForResolve[],
  incidentAtIso: string,
  timeUnknown: boolean,
): CoverOnLossDate | null {
  if (!versions.length || !incidentAtIso) return null
  const { start, end, at } = dayBounds(incidentAtIso)

  if (timeUnknown) {
    const sameDayChange = versions.some((v) => {
      const eff = new Date(v.effective_at)
      return eff >= start && eff < end
    })
    if (sameDayChange) {
      return {
        review_needed: true,
        version_id: null,
        excess: null,
        item_labels: [],
        reason: 'Incident time missing and cover changed on the same day — broker must link the applicable policy version.',
      }
    }
  }

  const matches = versions
    .filter((v) => {
      const eff = new Date(v.effective_at)
      const sup = v.superseded_at ? new Date(v.superseded_at) : null
      return eff <= at && (sup == null || sup > at)
    })
    .sort((a, b) => new Date(b.effective_at).getTime() - new Date(a.effective_at).getTime())

  const v = matches[0]
  if (!v) {
    return {
      review_needed: true,
      version_id: null,
      excess: null,
      item_labels: [],
      reason: 'Schedule review required',
    }
  }

  const excessRaw = v.terms?.excess
  const excess = excessRaw == null || excessRaw === '' ? null : Number(excessRaw)

  return {
    review_needed: false,
    version_id: v.id,
    excess: Number.isFinite(excess as number) ? (excess as number) : null,
    item_labels: (v.items ?? []).map((i) => i.display_label),
    effective_at: v.effective_at,
    superseded_at: v.superseded_at,
  }
}
