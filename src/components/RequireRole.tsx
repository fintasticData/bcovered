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
  const isVisitor = !me || me.role === 'visitor'
  return (
    <div className="grid min-h-[60vh] place-items-center px-5">
      <div className="panel max-w-md p-8 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-amber-500" />
        <h1 className="mt-4 text-xl font-semibold text-navy-900">{area} needs a Client or Broker identity</h1>
        <p className="mt-2 text-sm text-navy-600">
          You are currently <strong>{me?.full_name ?? 'a public visitor'}</strong>
          {isVisitor ? ' (visitor)' : ''}. Enter Client zone or Broker zone from the home page, or pick a seeded demo identity below.
        </p>
        <div className="mt-6 flex flex-col items-center gap-3">
          <RoleSwitcher align="left" />
          <div className="flex flex-wrap justify-center gap-3 text-xs font-semibold">
            <Link to="/#zones" className="text-brand-600 underline">
              Choose a zone
            </Link>
            <Link to="/sign-in?mode=sign_up&zone=client" className="text-brand-600 underline">
              Create client account
            </Link>
            <Link to="/" className="text-navy-500 underline">
              Public site
            </Link>
          </div>
          <p className="max-w-sm text-[11px] leading-snug text-navy-500">
            Tip: Demo as <strong>Johan van der Merwe</strong> for Client zone, or <strong>Thabo Nkosi</strong> for Broker zone. Accounts created only in this browser are not listed under Supabase Auth Users.
          </p>
        </div>
      </div>
    </div>
  )
}
