import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { ChevronDown, Mail, Menu, X } from 'lucide-react'
import { brand, MIGRATION_BASE, nav } from '../content/site'

type Props = {
  /** Transparent navy-friendly header for homepage hero */
  overHero?: boolean
}

export function MigrationHeader({ overHero = false }: Props) {
  const { pathname } = useLocation()
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [solutionsOpen, setSolutionsOpen] = useState(false)
  const [mobileSolutions, setMobileSolutions] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    setMobileOpen(false)
    setSolutionsOpen(false)
    setMobileSolutions(false)
  }, [pathname])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!dropdownRef.current?.contains(e.target as Node)) setSolutionsOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const heroMode = overHero && !scrolled && !mobileOpen
  const logoSrc = heroMode ? '/migration/logo-dark.png' : '/migration/logo-light.png'

  return (
    <header className={`mig-header${heroMode ? ' is-hero' : ''}${scrolled || mobileOpen ? ' is-scrolled' : ''}`}>
      <div className="mig-wrap mig-header-inner">
        <Link to={MIGRATION_BASE} className="mig-logo" aria-label={`${brand.name} home`}>
          <img src={logoSrc} alt={brand.name} />
        </Link>

        <nav className="mig-nav" aria-label="Primary">
          {nav.map((item) => {
            if (item.children) {
              return (
                <div
                  key={item.label}
                  className={`mig-nav-dropdown${solutionsOpen ? ' is-open' : ''}`}
                  ref={dropdownRef}
                >
                  <button
                    type="button"
                    className="mig-nav-btn"
                    aria-expanded={solutionsOpen}
                    onClick={() => setSolutionsOpen((v) => !v)}
                  >
                    {item.label}
                    <ChevronDown size={16} style={{ marginLeft: 4, display: 'inline' }} />
                  </button>
                  <div className="mig-nav-menu" role="menu">
                    {item.children.map((child) => (
                      <Link key={child.to} to={child.to} role="menuitem">
                        {child.label}
                      </Link>
                    ))}
                  </div>
                </div>
              )
            }
            return (
              <NavLink
                key={item.label}
                to={item.to}
                end={item.to === MIGRATION_BASE}
                className={({ isActive }) => `mig-nav-link${isActive ? ' is-active' : ''}`}
              >
                {item.label}
              </NavLink>
            )
          })}
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <a className="mig-mail-btn" href={`mailto:${brand.email}`} aria-label="Email us">
            <Mail size={18} />
          </a>
          <button
            type="button"
            className="mig-burger"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      <div className={`mig-mobile-panel${mobileOpen ? ' is-open' : ''}`}>
        <div className="mig-wrap">
          {nav.map((item) => {
            if (item.children) {
              return (
                <div key={item.label}>
                  <button type="button" onClick={() => setMobileSolutions((v) => !v)}>
                    {item.label}
                  </button>
                  {mobileSolutions && (
                    <div className="mig-mobile-sub">
                      {item.children.map((child) => (
                        <Link key={child.to} to={child.to}>
                          {child.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )
            }
            return (
              <Link key={item.label} to={item.to}>
                {item.label}
              </Link>
            )
          })}
        </div>
      </div>
    </header>
  )
}
