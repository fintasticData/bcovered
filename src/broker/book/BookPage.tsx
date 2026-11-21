import { Navigate, useParams, useSearchParams } from 'react-router-dom'

/**
 * Legacy My workspace routes redirect into Customer Area (single broker client home).
 * Maps Book query tabs onto Customer Area `desk` / `tab` params.
 */
export default function BookPage() {
  const { personId } = useParams()
  const [params] = useSearchParams()
  const next = new URLSearchParams(params)

  const bookTab = next.get('tab')
  next.delete('tab')
  if (bookTab === 'team' || bookTab === 'referrals') {
    next.set('desk', bookTab)
    next.set('tab', 'customers')
  } else if (bookTab === 'clients' || !bookTab) {
    next.set('tab', 'customers')
  } else if (bookTab === 'customers' || bookTab === 'businesses') {
    next.set('tab', bookTab)
  } else {
    next.set('tab', 'customers')
  }

  const search = next.toString()
  const to = personId
    ? { pathname: `/broker/customers/people/${personId}`, search }
    : { pathname: '/broker/customers', search }

  return <Navigate to={to} replace />
}
