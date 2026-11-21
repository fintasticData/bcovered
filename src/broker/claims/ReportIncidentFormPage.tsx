import { Navigate, useSearchParams } from 'react-router-dom'

/**
 * Deep-link fallback for /broker/claims/new.
 * With personId → Customer Area claims tab (Incident form in-context).
 * Without → Claims queue with report slideout (prompts to pick a client).
 */
export default function ReportIncidentFormPage() {
  const [params] = useSearchParams()
  const personId = params.get('personId')
  const policyId = params.get('policyId')
  const itemId = params.get('itemId')

  if (personId) {
    const next = new URLSearchParams()
    next.set('rtab', 'claims')
    next.set('reportClaim', '1')
    if (policyId) next.set('policyId', policyId)
    if (itemId) next.set('itemId', itemId)
    return <Navigate to={`/broker/customers/people/${personId}?${next.toString()}`} replace />
  }

  const next = new URLSearchParams()
  next.set('reportClaim', '1')
  if (policyId) next.set('policyId', policyId)
  return <Navigate to={`/broker/claims?${next.toString()}`} replace />
}
