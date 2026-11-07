import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { ArrowRight, Building2, ChevronDown, Menu, Phone, Sparkles, User, X } from 'lucide-react'
import Logo from './Logo'
import { RoleSwitcher } from './RoleSwitcher'
import { personalProducts } from '../data/products'
import { BUSINESS_COVER_AREAS, BUSINESS_INDUSTRY_GROUPS, coverAreaHref, industryHref } from '../data/business'
import { useMe } from '@/api/hooks'

const navLink =
  (extra = '') =>
  ({ isActive }: { isActive: boolean }) =>
    `whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium transition ${extra} ${
      isActive ? 'text-brand-800 bg-brand-50' : 'text-ink/70 hover:text-brand-800'
    }`

type MenuKey = 'personal' | 'business'

function MenuButton({
  label,
  identity,
  active,
  open,
  onClick,
}: {
  label: string
  identity: MenuKey
  active: boolean
  open: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-haspopup="true"
      data-identity={identity}
      className={`flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold whitespace-nowrap transition ${
        active || open ? 'bg-brand-50 text-brand-800 ring-1 ring-brand-500/30' : 'text-ink/80 hover:text-brand-800'
      }`}
    >
      <span className="h-2 w-2 rounded-full bg-brand-500" aria-hidden />
      {label} <ChevronDown className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} />
    </button>
  )
}

function PersonalMenu() {
  return (
    <div data-identity="personal" className="card absolute left-0 top-12 w-[600px] border-t-4 border-t-brand-500 p-4 shadow-xl animate-rise">
      <div className="mb-2 flex items-center justify-between px-2">
        <p className="eyebrow flex items-center gap-1.5">
          <User className="h-3.5 w-3.5" /> Personal insurance
        </p>
        <span className="text-[11px] text-ink/50">For you, your family and your home</span>
      </div>
      <div className="grid grid-cols-2 gap-1">
        {personalProducts.map((p) => (
          <Link key={p.slug} to={`/insurance/${p.slug}`} className="flex gap-3 rounded-2xl p-3 transition hover:bg-brand-50">
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
      <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-sand px-4 py-3">
        <span className="text-xs text-ink/70">Not sure what you need? Ava asks only what’s missing.</span>
        <Link to="/assist" className="btn-dark shrink-0 px-4 py-2 text-xs">
          Find my cover with Ava <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  )
}

function BusinessMenu() {
  return (
    <div
      data-identity="business"
      className="card absolute top-full left-1/2 mt-1 w-[min(900px,calc(100vw-2rem))] -translate-x-1/2 border-t-4 border-t-brand-500 p-5 shadow-xl animate-rise"
    >
      <div className="mb-3 flex items-center justify-between">
        <p className="eyebrow flex items-center gap-1.5">
          <Building2 className="h-3.5 w-3.5" /> Business insurance
        </p>
        <Link to="/business" className="text-xs font-semibold text-brand-600 hover:text-brand-800">
          Business overview <ArrowRight className="inline h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="grid grid-cols-[1fr_1fr_1fr_1.1fr] gap-5">
        {BUSINESS_INDUSTRY_GROUPS.map((g) => (
          <div key={g.title}>
            <p className="mb-1.5 px-2 text-[11px] font-semibold tracking-wide text-navy-500 uppercase">{g.title}</p>
            <ul>
              {g.industries.map((i) => (
                <li key={i.key}>
                  <Link to={industryHref(i.key)} className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm text-brand-900 transition hover:bg-brand-50">
                    <i.icon className="h-4 w-4 shrink-0 text-brand-600" /> {i.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div className="rounded-2xl bg-sand p-3">
          <p className="mb-1.5 px-1 text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Cover areas</p>
          <ul>
            {BUSINESS_COVER_AREAS.map((c) => (
              <li key={c.group}>
                <Link to={coverAreaHref(c.group)} className="flex items-center gap-2 rounded-xl px-1 py-1.5 text-sm text-brand-900 transition hover:bg-white">
                  <c.icon className="h-4 w-4 shrink-0 text-gold-500" /> {c.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-brand-900 px-4 py-3 text-white">
        <span className="text-xs text-brand-100">
          From sole traders to multi-site groups: describe how you operate and agents build your Risk Twin for a broker to review.
        </span>
        <Link to="/business/risk-review" className="btn-primary shrink-0 px-4 py-2 text-xs">
          Start a business risk review <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  )
}

export default function Header() {
  const [open, setOpen] = useState(false)
  const [menu, setMenu] = useState<MenuKey | null>(null)
  const { pathname } = useLocation()
  const navRef = useRef<HTMLElement>(null)
  const { data: me } = useMe()
  const workspace =
    me?.role === 'customer'
      ? { to: '/portal', label: 'My portal' }
      : me && ['broker', 'manager', 'admin'].includes(me.role)
        ? { to: '/broker', label: 'Broker workspace' }
        : null
  const inPersonal = pathname.startsWith('/insurance/')
  const inBusiness = pathname.startsWith('/business')

  useEffect(() => {
    setOpen(false)
    setMenu(null)
  }, [pathname])

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setMenu(null)
    }
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(null)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', escape)
    }
  }, [])

  const toggle = (key: MenuKey) => setMenu((m) => (m === key ? null : key))

  return (
    <header className="sticky top-0 z-40 border-b border-brand-800/10 bg-sand/90 backdrop-blur">
      <div className="container-x flex h-18 items-center justify-between gap-4 py-3">
        <Logo />

        <nav ref={navRef} className="hidden min-w-0 items-center gap-0.5 lg:flex xl:gap-1" aria-label="Main">
          <div className="relative">
            <MenuButton label="Personal" identity="personal" active={inPersonal} open={menu === 'personal'} onClick={() => toggle('personal')} />
            {menu === 'personal' && <PersonalMenu />}
          </div>
          <MenuButton label="Business" identity="business" active={inBusiness} open={menu === 'business'} onClick={() => toggle('business')} />
          {menu === 'business' && <BusinessMenu />}
          <span className="mx-1 h-5 w-px bg-brand-800/15" aria-hidden />
          <NavLink to="/claims" className={navLink()}>Claims</NavLink>
          <NavLink to="/about" className={navLink('hidden xl:inline-block')}>About us</NavLink>
          <NavLink to="/demo" className={navLink()}>Demo Studio</NavLink>
          <NavLink to="/help" className={navLink('hidden 2xl:inline-block')}>Help</NavLink>
          {workspace && <NavLink to={workspace.to} className={navLink()}>{workspace.label}</NavLink>}
        </nav>

        <div className="hidden shrink-0 items-center gap-3 lg:flex">
          <RoleSwitcher compact />
          <Link to="/assist" className="btn-primary whitespace-nowrap px-4 xl:px-6" aria-label="Find My Cover">
            <Sparkles className="h-4 w-4" /> <span className="hidden xl:inline">Find My Cover</span>
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
        <div className="max-h-[calc(100dvh-5rem)] overflow-y-auto border-t border-brand-800/10 bg-white lg:hidden">
          <div className="container-x space-y-1 py-4">
            <div data-identity="personal" className="space-y-1 border-l-4 border-brand-500 pl-1">
              <p className="eyebrow flex items-center gap-1.5 px-3 pb-1">
                <User className="h-3.5 w-3.5" /> Personal
              </p>
              {personalProducts.map((p) => (
                <Link key={p.slug} to={`/insurance/${p.slug}`} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-brand-50">
                  <p.icon className="h-5 w-5 text-brand-600" />
                  <span className="text-sm font-medium">{p.name}</span>
                </Link>
              ))}
            </div>

            <div className="my-3 border-t border-brand-800/10" />
            <div data-identity="business" className="space-y-1 border-l-4 border-brand-500 pl-1">
              <p className="eyebrow flex items-center gap-1.5 px-3 pb-1">
                <Building2 className="h-3.5 w-3.5" /> Business
              </p>
              {[
                ['/business', 'Business insurance overview'],
                ['/business/industries', 'Industries we cover (14)'],
                ['/business/cover', 'Cover areas and sections (25)'],
              ].map(([to, label]) => (
                <Link key={to} to={to} className="block rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-brand-50">
                  {label}
                </Link>
              ))}
              <div className="scroll-x -mx-1 flex gap-2 px-3 py-1.5">
                {BUSINESS_INDUSTRY_GROUPS.flatMap((g) => g.industries).map((i) => (
                  <Link
                    key={i.key}
                    to={industryHref(i.key)}
                    className="flex shrink-0 items-center gap-1.5 rounded-full border border-brand-800/10 bg-sand px-3 py-1.5 text-xs font-medium text-brand-900"
                  >
                    <i.icon className="h-3.5 w-3.5 text-brand-600" /> {i.label}
                  </Link>
                ))}
              </div>
              <Link to="/business/risk-review" className="btn-dark mx-3 mt-1 flex">
                Start a business risk review <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="my-3 border-t border-brand-800/10" />
            {[
              ['/claims', 'Claims'],
              ['/about', 'About us'],
              ['/contact', 'Contact'],
              ['/demo', 'Demo Studio'],
              ['/help', 'Help and capabilities'],
              ['/faq', 'FAQ'],
              ['/updates', 'System updates'],
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
