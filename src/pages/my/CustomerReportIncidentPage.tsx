import { Navigate, useSearchParams } from 'react-router-dom'
import { usePortalBasePath } from '@/pages/my/CustomerLayout'

/** Deep-link fallback: open My Page Cover with ReportClaimSlideout. */
export default function CustomerReportIncidentPage() {
  const [params] = useSearchParams()
  const basePath = usePortalBasePath()
  const next = new URLSearchParams()
  next.set('reportClaim', '1')
  const policyId = params.get('policyId')
  const itemId = params.get('itemId')
  if (policyId) next.set('policyId', policyId)
  if (itemId) next.set('itemId', itemId)
  return <Navigate to={`${basePath}?${next.toString()}`} replace />
}
