import { Navigate } from 'react-router-dom'
import { usePortalBasePath } from '@/pages/my/CustomerLayout'

/**
 * @deprecated Absorbed into My Business Page (`/my/business`).
 * Kept as a thin redirect so older links and imports keep working.
 */
export function BusinessCoverView(_props?: { onAskRuss?: () => void }) {
  const base = usePortalBasePath()
  return <Navigate to={`${base}/business?view=fintastic`} replace />
}
