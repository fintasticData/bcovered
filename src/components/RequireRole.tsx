import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, ShieldAlert } from 'lucide-react'
import { useMe } from '@/api/hooks'
import type { Role } from '@/server/db/schema'
import { RoleSwitcher } from './RoleSwitcher'

export function RequireRole({ roles, area, children }: { roles: Role[]; area: string; children: ReactNode }) {
  const { data: me, isLoading } = useMe()
  if (isLoading) {
    return (
      <div className="grid min-h-[50vh] place-items-center text-navy-600">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }
  const role: Role = me?.role ?? 'visitor'
  if (roles.includes(role)) return <>{children}</>
  return (
    <div className="grid min-h-[60vh] place-items-center px-5">
      <div className="panel max-w-md p-8 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-amber-500" />
        <h1 className="mt-4 text-xl font-semibold text-navy-900">{area} needs a different role</h1>
        <p className="mt-2 text-sm text-navy-600">
          You are viewing the demo as <strong>{me?.full_name ?? 'a public visitor'}</strong>. Access is checked by the service
          layer too, so switching here is required to see this data.
        </p>
        <div className="mt-6 flex flex-col items-center gap-3">
          <RoleSwitcher align="left" />
          <Link to="/" className="text-xs font-semibold text-brand-600 underline">
            Back to the public site
          </Link>
        </div>
      </div>
    </div>
  )
}
