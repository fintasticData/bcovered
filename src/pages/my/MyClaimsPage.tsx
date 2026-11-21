import { Navigate, useLocation } from 'react-router-dom'
import { usePortalBasePath } from '@/pages/my/CustomerLayout'

/** @deprecated Claims live on My Page `?tab=claims` — keep route for old links (except /claims/new). */
export default function MyClaimsPage() {
  const basePath = usePortalBasePath()
  const { search } = useLocation()
  const params = new URLSearchParams(search)
  params.set('tab', 'claims')
  const qs = params.toString()
  return <Navigate to={`${basePath}?${qs}`} replace />
}
