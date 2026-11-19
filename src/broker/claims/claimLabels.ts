/** Plain-language claim statuses shown to customers. */
export const CUSTOMER_CLAIM_STATUS: Record<string, string> = {
  reported: 'Reported to B-Covered',
  in_review: 'Your broker is reviewing',
  awaiting_evidence: 'Waiting for documents from you',
  submitted_to_insurer: 'Submitted to insurer',
  under_assessment: 'Insurer is assessing',
  awaiting_insurer_update: 'Waiting for an insurer update',
  decision_received: 'Decision received',
  closed: 'Closed',
}

export const INCIDENT_TYPES = [
  { value: 'motor_accident', label: 'Motor accident' },
  { value: 'vehicle_theft', label: 'Vehicle theft / hijacking' },
  { value: 'burglary', label: 'Burglary / theft at home' },
  { value: 'water_damage', label: 'Water damage' },
  { value: 'storm_hail', label: 'Storm / hail' },
  { value: 'other', label: 'Other' },
] as const
