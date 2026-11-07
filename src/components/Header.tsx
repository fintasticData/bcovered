import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { ChevronDown, Menu, Phone, Sparkles, X } from 'lucide-react'
import Logo from './Logo'
import { RoleSwitcher } from './RoleSwitcher'
import { products } from '../data/products'
import { useMe } from '@/api/hooks'

const navLink = ({ isActive }: { isActive: boolean }) =>
  `rounded-full px-3 py-2 text-sm font-medium transition ${
    isActive ? 'text-brand-800 bg-brand-50' : 'text-ink/70 hover:text-brand-800'
  }`

export default function Header() {
  const [open, setOpen] = useState(false)
  const [menu, setMenu] = useState(false)
  const { pathname } = useLocation()
  const menuRef = useRef<HTMLDivElement>(null)
  const { data: me } = useMe()
  const workspace =
    me?.role === 'customer'
      ? { to: '/portal', label: 'My portal' }
      : me && ['broker', 'manager', 'admin'].includes(me.role)
        ? { to: '/broker', label: 'Broker workspace' }
        : null

  useEffect(() => {
    setOpen(false)
    setMenu(false)
  }, [pathname])

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  return (
    <header className="sticky top-0 z-40 border-b border-brand-800/10 bg-sand/90 backdrop-blur">
      <div className="container-x flex h-18 items-center justify-between gap-6 py-3">
        <Logo />

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenu((m) => !m)}
              aria-expanded={menu}
              className="flex cursor-pointer items-center gap-1 rounded-full px-3 py-2 text-sm font-medium text-ink/70 hover:text-brand-800"
            >
              Insurance <ChevronDown className={`h-4 w-4 transition ${menu ? 'rotate-180' : ''}`} />
            </button>
            {menu && (
              <div className="card absolute left-0 top-12 grid w-[560px] grid-cols-2 gap-1 p-3 shadow-xl animate-rise">
                {products.map((p) => (
                  <Link
                    key={p.slug}
                    to={`/insurance/${p.slug}`}
                    className="flex gap-3 rounded-2xl p-3 transition hover:bg-brand-50"
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
                      <p.icon className="h-5 w-5" />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-brand-900">{p.name}</span>
                      <span className="block text-xs text-ink/60">{p.short}</span>
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
          <NavLink to="/business" className={navLink}>Business</NavLink>
          <NavLink to="/claims" className={navLink}>Claims</NavLink>
          <NavLink to="/about" className={navLink}>About us</NavLink>
          <NavLink to="/demo" className={navLink}>Demo Studio</NavLink>
          <NavLink to="/help" className={navLink}>Help</NavLink>
          {workspace && <NavLink to={workspace.to} className={navLink}>{workspace.label}</NavLink>}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <RoleSwitcher />
          <Link to="/assist" className="btn-primary">
            <Sparkles className="h-4 w-4" /> Find My Cover
          </Link>
        </div>

        <button
          className="grid h-11 w-11 cursor-pointer place-items-center rounded-full border border-brand-800/15 bg-white lg:hidden"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="max-h-[calc(100vh-5rem)] overflow-y-auto border-t border-brand-800/10 bg-white lg:hidden">
          <div className="container-x space-y-1 py-4">
            <p className="eyebrow px-3 pb-1">Insurance</p>
            {products.map((p) => (
              <Link key={p.slug} to={`/insurance/${p.slug}`} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-brand-50">
                <p.icon className="h-5 w-5 text-brand-600" />
                <span className="text-sm font-medium">{p.name}</span>
              </Link>
            ))}
            <div className="my-3 border-t border-brand-800/10" />
            {[
              ['/business', 'Business insurance'],
              ['/claims', 'Claims'],
              ['/about', 'About us'],
              ['/contact', 'Contact'],
              ['/demo', 'Demo Studio'],
              ['/help', 'Help and capabilities'],
              ...(workspace ? [[workspace.to, workspace.label]] : []),
            ].map(([to, label]) => (
              <Link key={to} to={to} className="block rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-brand-50">
                {label}
              </Link>
            ))}
            <div className="px-3 pt-2">
              <RoleSwitcher align="left" />
            </div>
            <Link to="/assist" className="btn-primary mt-3 w-full">Find My Cover</Link>
            <a href="tel:0861268373" className="mt-2 flex items-center justify-center gap-2 py-2 text-sm font-semibold text-brand-800">
              <Phone className="h-4 w-4" /> 0861 COVERED
            </a>
          </div>
        </div>
      )}
    </header>
  )
}
