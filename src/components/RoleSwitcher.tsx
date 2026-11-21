import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, ChevronDown, ChevronRight, LogOut, Search, UserCircle2 } from 'lucide-react'
import { clearPersistentConversations } from '@/api/conversations'
import { session } from '@/api/client'
import { useIdentities, useMe, useSignOut } from '@/api/hooks'
import { supabaseAuth } from '@/lib/supabase/client'
import { identity } from '@/server/db/store'
import type { DemoIdentity } from '@/server/api'
import { PLATFORM_ROLE_LABEL, ROLE_LABEL } from '@/server/onboarding/config'
import { humanise } from './StatusBadge'
import { cn } from '@/lib/utils'

const VIP_DEMO_EMAILS = new Set([
  'naledi.vip@example.demo',
  'thandi.walkthrough@example.demo',
  'lerato.mokoena@bcovered.demo',
  'protea.desk@bcovered.demo',
  'karoo.desk@bcovered.demo',
])

type MenuPlacement = 'below' | 'above' | 'aside'

type IdentityBranch = { group: string; people: DemoIdentity[] }

function groupIdentities(list: DemoIdentity[]): IdentityBranch[] {
  const branches: IdentityBranch[] = []
  const index = new Map<string, IdentityBranch>()
  for (const i of list) {
    let branch = index.get(i.group)
    if (!branch) {
      branch = { group: i.group, people: [] }
      index.set(i.group, branch)
      branches.push(branch)
    }
    branch.people.push(i)
  }
  return branches
}

export function RoleSwitcher({
  dark = false,
  align = 'right',
  compact = false,
  menuPlacement = 'below',
  fullWidth = false,
}: {
  dark?: boolean
  align?: 'left' | 'right'
  compact?: boolean
  menuPlacement?: MenuPlacement
  fullWidth?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const ref = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const { data: identities = [] } = useIdentities()
  const { data: me } = useMe()
  const signOut = useSignOut()
  const navigate = useNavigate()

  const searching = query.trim().length > 0

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return identities
    return identities.filter((i) => {
      const hay = `${i.full_name} ${i.description} ${i.group} ${i.role}`.toLowerCase()
      return hay.includes(q)
    })
  }, [identities, query])

  const branches = useMemo(() => groupIdentities(filtered), [filtered])

  const currentGroup = useMemo(() => {
    const currentId = me?.id ?? null
    return identities.find((i) => i.user_id === currentId)?.group ?? identities[0]?.group ?? null
  }, [identities, me?.id])

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  useEffect(() => {
    if (!open) {
      setQuery('')
      return
    }
    const defaults = new Set<string>()
    if (currentGroup) defaults.add(currentGroup)
    else if (identities[0]?.group) defaults.add(identities[0].group)
    setExpanded(defaults)
    const t = window.setTimeout(() => searchRef.current?.focus(), 0)
    return () => window.clearTimeout(t)
  }, [open, currentGroup, identities])

  const visibleExpanded = useMemo(() => {
    if (!searching) return expanded
    return new Set(branches.map((b) => b.group))
  }, [searching, expanded, branches])

  const toggleBranch = (group: string) => {
    if (searching) return
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      return next
    })
  }

  const choose = (userId: string | null, home: string) => {
    clearPersistentConversations()
    session.set(userId)
    const local = userId ? identity.user(userId) : null
    // VIP Concierge + insurer desks need Supabase Auth immediately; bridge also follows session.
    if (local && (VIP_DEMO_EMAILS.has(local.email.toLowerCase()) || local.role === 'insurer_partner')) {
      void supabaseAuth.connectDemo(local.email)
    } else if (!userId) {
      void supabaseAuth.signOut().catch(() => undefined)
    }
    setOpen(false)
    navigate(home)
  }

  const leave = () => {
    setOpen(false)
    signOut.mutate(undefined, {
      onSuccess: () => {
        clearPersistentConversations()
        void supabaseAuth.signOut().catch(() => undefined)
        navigate('/')
      },
    })
  }

  const roleLabel = me?.platform_role ? PLATFORM_ROLE_LABEL[me.platform_role] : me?.member_role ? ROLE_LABEL[me.member_role] : me ? humanise(me.role) : ''
  const current = me ? `${me.full_name} · ${roleLabel}` : 'Public visitor'

  return (
    <div className={cn('relative', fullWidth && 'w-full')} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          'flex cursor-pointer items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition sm:py-1.5',
          fullWidth ? 'w-full max-w-none' : compact ? 'max-w-[11rem] xl:max-w-[15rem]' : 'max-w-[11rem] sm:max-w-[15rem]',
          dark ? 'border-white/20 bg-white/10 text-white hover:bg-white/15' : 'border-navy-800/15 bg-white text-navy-800 hover:border-navy-800/40',
        )}
      >
        <UserCircle2 className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left">
          <span className={cn('opacity-60', fullWidth ? 'inline' : compact ? 'hidden xl:inline' : 'hidden sm:inline')}>Signed in as </span>
          {current}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0" />
      </button>
      {open && (
        <div
          role="menu"
          className={cn(
            'panel z-50 flex max-h-[70dvh] w-[min(28rem,calc(100vw-1.5rem))] flex-col overflow-hidden p-2 shadow-xl animate-rise',
            menuPlacement === 'aside' ? 'absolute bottom-0 left-full ml-2' : menuPlacement === 'above' ? 'absolute bottom-full left-0 mb-2' : 'absolute top-11',
            menuPlacement === 'below' && (align === 'right' ? 'right-0' : 'left-0'),
          )}
        >
          <p className="px-2 pb-2 pt-1 text-[11px] leading-snug text-navy-600">
            Switch identity for the MVP. Search for Anil, Swift, or Mokoena for My Business Page.
          </p>
          <label className="relative mb-2 block px-1">
            <span className="sr-only">Search identities</span>
            <Search className="pointer-events-none absolute top-1/2 left-3.5 h-3.5 w-3.5 -translate-y-1/2 text-navy-400" />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search people or businesses…"
              className="w-full rounded-lg border border-navy-800/15 bg-white py-2 pr-3 pl-8 text-sm text-navy-900 outline-none placeholder:text-navy-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Escape') {
                  if (query) {
                    e.preventDefault()
                    setQuery('')
                  } else {
                    setOpen(false)
                  }
                }
              }}
            />
          </label>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {me && (
              <button
                role="menuitem"
                type="button"
                onClick={leave}
                disabled={signOut.isPending}
                className="mb-2 flex w-full cursor-pointer items-center gap-2 rounded-lg border border-navy-800/10 bg-navy-50 px-2 py-2.5 text-left text-sm font-semibold text-navy-900 hover:bg-navy-100"
              >
                <LogOut className="h-4 w-4 shrink-0" />
                Sign out
              </button>
            )}
            {branches.length === 0 && (
              <p className="px-2 py-4 text-center text-xs text-navy-600">No identities match “{query.trim()}”.</p>
            )}
            {branches.length > 0 && (
              <div className="px-1 pb-1" role="tree" aria-label="Demo identity organogram">
                <p className="mb-1.5 px-1 text-[10px] font-semibold tracking-[0.14em] text-navy-500 uppercase">BCovered demo</p>
                <ul className="space-y-0.5">
                  {branches.map((branch) => {
                    const isOpen = visibleExpanded.has(branch.group)
                    const branchActive = branch.people.some((p) => (me?.id ?? null) === p.user_id)
                    return (
                      <li key={branch.group} role="treeitem" aria-expanded={isOpen}>
                        <button
                          type="button"
                          onClick={() => toggleBranch(branch.group)}
                          aria-expanded={isOpen}
                          className={cn(
                            'flex w-full cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-left hover:bg-navy-50',
                            branchActive && 'bg-brand-50/60',
                            searching && 'cursor-default',
                          )}
                        >
                          <span className="flex h-4 w-4 shrink-0 items-center justify-center text-navy-500">
                            {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[11px] font-semibold tracking-[0.08em] text-navy-700 uppercase">
                              {branch.group}
                            </span>
                            <span className="block text-[10px] text-navy-500">
                              {branch.people.length} {branch.people.length === 1 ? 'identity' : 'identities'}
                            </span>
                          </span>
                        </button>
                        {isOpen && (
                          <ul className="relative ml-4 border-l border-navy-800/15" role="group">
                            {branch.people.map((i) => {
                              const active = (me?.id ?? null) === i.user_id
                              return (
                                <li key={i.user_id ?? 'visitor'} className="relative pl-3" role="none">
                                  <span
                                    aria-hidden
                                    className="pointer-events-none absolute top-5 left-0 w-3 border-t border-navy-800/15"
                                  />
                                  <button
                                    role="menuitem"
                                    type="button"
                                    onClick={() => choose(i.user_id, i.home)}
                                    className={cn(
                                      'my-0.5 flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-navy-50',
                                      active && 'bg-brand-50 ring-1 ring-brand-200',
                                    )}
                                  >
                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate text-sm font-medium text-navy-900">{i.full_name}</span>
                                      <span className="block text-[11px] text-navy-600">{i.description}</span>
                                    </span>
                                    {active && <Check className="h-4 w-4 shrink-0 text-brand-500" />}
                                  </button>
                                </li>
                              )
                            })}
                          </ul>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
