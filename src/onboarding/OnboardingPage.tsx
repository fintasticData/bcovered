import { useEffect, useState } from 'react'
import { Link, Navigate, NavLink, useNavigate, useParams } from 'react-router-dom'
import { CheckCircle2, ChevronsLeft, ChevronsRight, CircleAlert, Eye, Loader2, Maximize2, Minimize2, Send, Sparkles, X } from 'lucide-react'
import type { OnboardingView } from '@/api/client'
import { useMe, useOnboarding, useSetSection, useSubmitApplication } from '@/api/hooks'
import { RoleSwitcher } from '@/components/RoleSwitcher'
import { StatusBadge } from '@/components/StatusBadge'
import { WorkspaceSwitcher } from '@/components/WorkspaceSwitcher'
import { Button } from '@/components/ui/button'
import { cn, formatDateTime } from '@/lib/utils'
import type { OnboardingSection } from '@/server/db/onboardingSchema'
import { MODULE_LABEL, SECTION_FIELDS, SECTIONS } from '@/server/onboarding/config'
import { MobilePaneSwitch, type Pane } from '@/broker/MobilePaneSwitch'
import { RussPanel } from './RussPanel'
import { CommercialSection, DocumentsSection, FieldsSection, InsurerSection, ReadinessSection, TeamSection, type SaveState } from './sections'

const FIELD_SECTIONS: OnboardingSection[] = ['organisation', 'profile', 'products', 'migration']
const STATUS_COPY: Partial<Record<OnboardingView['application']['status'], string>> = {
  submitted: 'Submitted. A B-Covered reviewer will pick it up; you can still read everything.',
  under_review: 'Under review by B-Covered. Changes are paused until the reviewer finishes.',
  information_required: 'B-Covered asked for more information. Resolve the feedback, then resubmit.',
  approved: 'Approved. Your workspace is activated in a separate step by B-Covered.',
  declined: 'Declined. See the reason in the Review tab.',
  withdrawn: 'Withdrawn.',
  suspended: 'Suspended by B-Covered.',
}

function SectionNav({ view, collapsed }: { view: OnboardingView; collapsed: boolean }) {
  return (
    <nav aria-label="Onboarding sections" className="scroll-area flex-1 space-y-0.5 px-2 py-3">
      {SECTIONS.map((s, i) => {
        const p = view.readiness.sections.find((x) => x.key === s.key)
        const done = p && p.total > 0 && p.done === p.total && !p.errors
        const attention = p && (p.attention > 0 || p.errors > 0)
        return (
          <NavLink
            key={s.key}
            to={`/onboarding/${s.key}`}
            title={collapsed ? s.label : undefined}
            className={({ isActive }) => cn('flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition', isActive ? 'bg-white/10 text-white' : 'text-navy-200 hover:bg-white/5 hover:text-white')}
          >
            <span className={cn('grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold', done ? 'bg-emerald-400 text-navy-900' : attention ? 'bg-amber-400 text-navy-900' : 'bg-white/10 text-white')}>
              {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : attention ? <CircleAlert className="h-3.5 w-3.5" /> : i + 1}
            </span>
            {!collapsed && (
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{s.label}</span>
                {p && p.total > 0 && (
                  <span className="block text-[10px] text-navy-300">
                    {p.done}/{p.total}
                    {p.attention ? ` · ${p.attention} to fix` : ''}
                  </span>
                )}
              </span>
            )}
          </NavLink>
        )
      })}
    </nav>
  )
}

function PreviewDialog({ view, onClose }: { view: OnboardingView; onClose: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-navy-900/50 p-4" role="dialog" aria-modal="true" aria-label="Application preview">
      <div className="panel scroll-area max-h-[85dvh] w-full max-w-3xl p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-navy-900">What B-Covered will review</h2>
          <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close preview">
            <X />
          </Button>
        </div>
        {FIELD_SECTIONS.map((s) => (
          <section key={s} className="mt-4">
            <h3 className="text-xs font-semibold tracking-wide text-navy-500 uppercase">{SECTIONS.find((x) => x.key === s)?.label}</h3>
            <dl className="mt-1 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[14rem_1fr]">
              {(SECTION_FIELDS[s] ?? []).map((f) => {
                const v = view.application.sections[s]?.[f.key]
                const text = Array.isArray(v) ? v.map((x) => (s === 'products' ? MODULE_LABEL[x as keyof typeof MODULE_LABEL] : (f.options?.find((o) => o.value === x)?.label ?? x))).join(', ') : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : (f.options?.find((o) => o.value === v)?.label ?? v)
                return [
                  <dt key={`${f.key}-l`} className="text-navy-500">{f.label}</dt>,
                  <dd key={`${f.key}-v`} className="text-navy-900">{text || <em className="text-navy-400">not provided</em>}</dd>,
                ]
              })}
            </dl>
          </section>
        ))}
        <section className="mt-4">
          <h3 className="text-xs font-semibold tracking-wide text-navy-500 uppercase">Team, documents and insurers</h3>
          <p className="mt-1 text-sm text-navy-800">
            {view.team.members.filter((m) => m.status === 'active').length} team member(s) · {view.documents.filter((d) => d.review_status !== 'superseded').length} document(s) · {view.insurers.length} insurer relationship(s) ·{' '}
            {view.terms ? 'terms agreed' : 'terms not agreed'}
          </p>
        </section>
      </div>
    </div>
  )
}

export default function OnboardingPage() {
  const { section: param } = useParams()
  const navigate = useNavigate()
  const { data: me, isLoading: meLoading } = useMe()
  const { data: view, isLoading, error } = useOnboarding(Boolean(me?.member_role))
  const setSection = useSetSection()
  const submit = useSubmitApplication()
  const [navCollapsed, setNavCollapsed] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [pane, setPane] = useState<Pane>('work')
  const [preview, setPreview] = useState(false)
  const [highlight, setHighlight] = useState<string | null>(null)
  const [save, setSave] = useState<SaveState>({ status: 'idle' })

  const section = (SECTIONS.find((s) => s.key === param)?.key ?? null) as OnboardingSection | null
  useEffect(() => {
    if (section && view && view.application.current_section !== section && !view.read_only) setSection.mutate(section)
  }, [section, view?.application.id])

  if (meLoading || (isLoading && me?.member_role)) {
    return (
      <div className="grid min-h-dvh place-items-center bg-mist text-navy-600">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }
  if (!me) return <Navigate to="/sign-in?next=/onboarding" replace />
  if (!me.member_role || error || !view) {
    return (
      <div className="grid min-h-dvh place-items-center bg-mist p-6">
        <div className="panel max-w-md p-8 text-center">
          <h1 className="text-lg font-semibold text-navy-900">No brokerage onboarding here</h1>
          <p className="mt-2 text-sm text-navy-600">{error?.message ?? 'You are not in a brokerage workspace. Start an application or open an invitation link.'}</p>
          <div className="mt-5 flex flex-col items-center gap-3">
            <Button variant="accent" asChild>
              <Link to="/brokers/join">Join as a broker</Link>
            </Button>
            <RoleSwitcher align="left" />
          </div>
        </div>
      </div>
    )
  }
  if (!section) return <Navigate to={`/onboarding/${view.application.current_section ?? 'organisation'}`} replace />

  const def = SECTIONS.find((s) => s.key === section)!
  const editable = ['draft', 'information_required'].includes(view.application.status)
  const canSubmit = view.capabilities.includes('submit') && view.readiness.can_submit
  const statusCopy = STATUS_COPY[view.application.status]
  const showField = (path: string) => {
    const [s] = path.split('.')
    setHighlight(path)
    setPane('work')
    navigate(`/onboarding/${s}`)
    window.setTimeout(() => setHighlight((h) => (h === path ? null : h)), 4000)
  }

  return (
    <div className="flex h-dvh bg-mist text-navy-900">
      <aside className={cn('hidden shrink-0 flex-col bg-navy-900 text-navy-100 transition-[width] lg:flex', navCollapsed ? 'w-16' : 'w-60')} aria-label="Onboarding navigation">
        <div className="flex h-14 items-center gap-2 px-4">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-500 text-white">
            <Sparkles className="h-4 w-4" />
          </span>
          {!navCollapsed && (
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-sm font-semibold text-white">{view.organisation.name}</span>
              <span className="block truncate text-[11px] text-navy-300">Brokerage onboarding</span>
            </span>
          )}
        </div>
        <SectionNav view={view} collapsed={navCollapsed} />
        <div className="border-t border-white/10 px-2 py-3">
          <Link to="/" className="block rounded-lg px-3 py-2 text-sm text-navy-200 hover:bg-white/5 hover:text-white">
            {navCollapsed ? '←' : 'Public site'}
          </Link>
          <button type="button" onClick={() => setNavCollapsed((c) => !c)} className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-navy-300 hover:bg-white/5 hover:text-white" aria-label={navCollapsed ? 'Expand navigation' : 'Collapse navigation'}>
            {navCollapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
            {!navCollapsed && 'Collapse'}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-navy-800/10 bg-white px-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-2">
            <select aria-label="Onboarding section" className="rounded-lg border border-navy-800/15 px-2 py-1.5 text-sm lg:hidden" value={section} onChange={(e) => navigate(`/onboarding/${e.target.value}`)}>
              {SECTIONS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
            <StatusBadge status={view.application.status} />
            <span className="hidden truncate text-xs text-navy-600 sm:inline">{view.organisation.is_demo ? 'Demo mode · this browser only' : ''}</span>
          </div>
          <div className="flex items-center gap-2">
            <WorkspaceSwitcher />
            <RoleSwitcher compact />
          </div>
        </header>
        {statusCopy && <p className="border-b border-amber-200 bg-amber-50 px-5 py-2 text-xs text-amber-900">{statusCopy}</p>}
        {view.read_only && <p className="border-b border-sky-200 bg-sky-50 px-5 py-2 text-xs text-sky-900">You have read-only access to this brokerage’s onboarding.</p>}

        {!expanded && <MobilePaneSwitch pane={pane} onChange={setPane} workLabel="Editor" />}
        <div className={cn('grid min-h-0 flex-1 gap-4 p-3 sm:p-4', !expanded && 'lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]')}>
          {!expanded && (
            <div className={cn('min-h-0', pane !== 'chat' && 'hidden lg:block')}>
              <RussPanel view={view} onShowField={showField} />
            </div>
          )}
          <section className={cn('panel flex min-h-0 flex-col overflow-hidden', !expanded && pane !== 'work' && 'hidden lg:flex')} aria-label={`${def.label} editor`}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-navy-800/10 px-4 py-3">
              <div className="min-w-0">
                <h1 className="text-base font-semibold text-navy-900">{def.label}</h1>
                <p className="truncate text-xs text-navy-600">{def.summary}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-navy-500" aria-live="polite">
                  {save.status === 'saving'
                    ? 'Saving…'
                    : save.status === 'error'
                      ? <span className="text-red-600">{save.message}</span>
                      : editable
                        ? `Draft saved${save.at ? ` ${formatDateTime(save.at)}` : ''} · not yet submitted`
                        : `Submitted ${view.application.submitted_at ? formatDateTime(view.application.submitted_at) : ''}`}
                </span>
                <Button size="sm" variant="outline" onClick={() => setPreview(true)}>
                  <Eye /> Preview
                </Button>
                {view.capabilities.includes('submit') && editable && (
                  <Button size="sm" variant="accent" disabled={!canSubmit || submit.isPending} title={canSubmit ? undefined : view.readiness.blockers[0]} onClick={() => submit.mutate(undefined)}>
                    <Send /> {view.application.status === 'information_required' ? 'Resubmit' : 'Submit for approval'}
                  </Button>
                )}
                <Button size="icon" variant="ghost" className="hidden lg:inline-flex" onClick={() => setExpanded((e) => !e)} aria-label={expanded ? 'Show Russ' : 'Expand editor'} title={expanded ? 'Show Russ' : 'Expand editor'}>
                  {expanded ? <Minimize2 /> : <Maximize2 />}
                </Button>
              </div>
            </div>
            {submit.error && <p className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">{submit.error.message}</p>}
            <div className="scroll-area flex-1 px-4 py-4">
              {FIELD_SECTIONS.includes(section) && <FieldsSection key={section} view={view} section={section} highlight={highlight} onSave={setSave} />}
              {section === 'team' && <TeamSection view={view} />}
              {section === 'insurer_access' && <InsurerSection view={view} />}
              {section === 'documents' && <DocumentsSection view={view} onUploaded={() => setPane('work')} />}
              {section === 'commercial' && <CommercialSection view={view} />}
              {section === 'readiness' && <ReadinessSection view={view} />}
            </div>
          </section>
        </div>
      </div>
      {preview && <PreviewDialog view={view} onClose={() => setPreview(false)} />}
    </div>
  )
}
