import { Navigate } from 'react-router-dom'
import { usePortalBasePath } from '@/pages/my/CustomerLayout'

/** @deprecated Quotes live on My Page `?tab=quotes` — keep route for old links. */
export default function MyQuotesPage() {
  const basePath = usePortalBasePath()
  return <Navigate to={`${basePath}?tab=quotes`} replace />
}
