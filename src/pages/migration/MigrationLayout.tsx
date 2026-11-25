import { Outlet, useLocation } from 'react-router-dom'
import { MessageCircle } from 'lucide-react'
import { MigrationHeader } from './components/MigrationHeader'
import { MigrationFooter } from './components/MigrationFooter'
import { CookieBanner } from './components/CookieBanner'
import { MIGRATION_BASE, brand } from './content/site'
import './migration.css'

export default function MigrationLayout() {
  const { pathname } = useLocation()
  const isHome = pathname === MIGRATION_BASE || pathname === `${MIGRATION_BASE}/`

  return (
    <div data-site="bcovered-public" className="mig-shell">
      <MigrationHeader overHero={isHome} />
      <main className="mig-main">
        <Outlet />
      </main>
      <MigrationFooter />
      <CookieBanner />
      <a className="mig-chat" href={`mailto:${brand.email}?subject=Chat%20with%20BCovered`}>
        <MessageCircle size={16} />
        Chat with us
      </a>
    </div>
  )
}
