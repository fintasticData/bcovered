import type { Repo } from '../db/store'

/** What a broker signs off for an assessment. Any change to it makes a pending sign-off stale. */
export function assessmentReviewPayload(repo: Repo, assessmentId: string) {
  const a = repo.require('risk_assessments', assessmentId)
  return {
    assessment_id: a.id,
    assessment_type: a.assessment_type,
    risk_profile_id: a.risk_profile_id,
    findings: repo
      .list('risk_assessment_findings', (f) => f.assessment_id === a.id)
      .sort((x, y) => x.rank - y.rank)
      .map((f) => ({
        rank: f.rank,
        title: f.title,
        priority: f.priority,
        priority_area: f.is_priority_area,
        status: f.status,
        fact_basis: f.fact_basis,
        coverage_status: f.coverage.status,
        broker_note: f.broker_note,
      })),
    completeness: a.completeness.map((c) => ({ key: c.key, status: c.status })),
  }
}
