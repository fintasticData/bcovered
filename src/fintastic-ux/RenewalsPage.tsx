import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { MessageSquare, Send, CheckCheck } from 'lucide-react'
import { PageHeader } from '@/broker/PageHeader'
import { RightSlideout } from '@/broker/shared/RightSlideout'
import { Page } from '@/broker/shared/ui'
import { Button } from '@/components/ui/button'
import { ChangeReviewView, type TermField } from './ChangeReviewView'
import { ViewModeToggle } from './ViewModeToggle'
import { useLayoutView } from './useLayoutView'
import { ActionCard } from './ActionCard'
import { type ContextMenuItem, type ContextMenuState } from '@/broker/shared/RowContextMenu'
import {
  RENEWAL_DEMO,
  zar,
  renewalDecisionHeadline,
  renewalRussMessage,
  type RenewalRow,
} from './renewalsDemo'
import { renewalFieldsFromRow } from './RenewalCompactPanel'
import { RenewalCompactPanel } from './RenewalCompactPanel'
import {
  WorkingQueueGrid,
  EMPTY_QUEUE_FILTERS,
  filterRenewalRows,
  type WorkingQueueFilters,
} from './WorkingQueueGrid'

const FILTER_STORAGE_KEY = 'bcovered_renewals_queue_filters_v1'

function readStoredFilters(): WorkingQueueFilters {
  try {
    const raw = sessionStorage.getItem(FILTER_STORAGE_KEY)
    if (!raw) return EMPTY_QUEUE_FILTERS
    const parsed = JSON.parse(raw) as Partial<WorkingQueueFilters>
    return {
      search: typeof parsed.search === 'string' ? parsed.search : '',
      status:
        parsed.status === 'review_excess' || parsed.status === 'review_change' || parsed.status === 'no_change'
          ? parsed.status
          : 'all',
      dateFrom: typeof parsed.dateFrom === 'string' ? parsed.dateFrom : '',
      dateTo: typeof parsed.dateTo === 'string' ? parsed.dateTo : '',
    }
  } catch {
    return EMPTY_QUEUE_FILTERS
  }
}

function writeStoredFilters(f: WorkingQueueFilters) {
  try {
    sessionStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(f))
  } catch {
    /* ignore */
  }
}

export default function RenewalsPage() {
  const { view, setView, isFintastic } = useLayoutView('fintastic')
  const [params, setParams] = useSearchParams()
  const [focusedId, setFocusedId] = useState(RENEWAL_DEMO[0].id)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [showAllTerms, setShowAllTerms] = useState(false)
  const [actionMenu, setActionMenu] = useState<ContextMenuState>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [draftOpen, setDraftOpen] = useState(false)
  const [draftSubject, setDraftSubject] = useState('')
  const [draftBody, setDraftBody] = useState('')
  const [draftSentFor, setDraftSentFor] = useState<string | null>(null)
  const [gridExpanded, setGridExpanded] = useState(false)
  const [filters, setFilters] = useState<WorkingQueueFilters>(() => readStoredFilters())
  const [policyDrawerRow, setPolicyDrawerRow] = useState<RenewalRow | null>(null)
  const [focusHiddenBanner, setFocusHiddenBanner] = useState(false)

  /** Deep-link: ?focus= keeps focus; restore filters from session unless URL clears them. */
  useEffect(() => {
    const focus = params.get('focus')
    if (focus && RENEWAL_DEMO.some((r) => r.id === focus)) {
      setFocusedId(focus)
    }

    const q = params.get('q')
    const status = params.get('status')
    const dateFrom = params.get('from')
    const dateTo = params.get('to')
    if (q != null || status != null || dateFrom != null || dateTo != null) {
      const next: WorkingQueueFilters = {
        search: q ?? '',
        status:
          status === 'review_excess' || status === 'review_change' || status === 'no_change' ? status : 'all',
        dateFrom: dateFrom ?? '',
        dateTo: dateTo ?? '',
      }
      setFilters(next)
      writeStoredFilters(next)
    }
  }, [params])

  useEffect(() => {
    writeStoredFilters(filters)
  }, [filters])

  const filtered = useMemo(() => filterRenewalRows(RENEWAL_DEMO, filters), [filters])

  useEffect(() => {
    const focus = params.get('focus') ?? focusedId
    const inFiltered = filtered.some((r) => r.id === focus)
    setFocusHiddenBanner(Boolean(focus) && !inFiltered && filtered.length !== RENEWAL_DEMO.length)
  }, [filtered, focusedId, params])

  const focused = RENEWAL_DEMO.find((r) => r.id === focusedId) ?? RENEWAL_DEMO[0]
  const fields: TermField[] = renewalFieldsFromRow(focused)

  const setFocus = (id: string) => {
    setFocusedId(id)
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('focus', id)
        if (!next.get('view')) next.set('view', 'fintastic')
        return next
      },
      { replace: true },
    )
  }

  const toggleCheck = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleCheckAll = (ids: string[], select: boolean) => {
    setChecked((prev) => {
      const next = new Set(prev)
      for (const id of ids) {
        if (select) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }

  const notify = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 3200)
  }

  const openDiscussDraft = (row: RenewalRow) => {
    setFocus(row.id)
    const delta = row.proposedExcess - row.expiringExcess
    setDraftSubject(`Renewal discussion — ${row.client} (${row.policyNumber})`)
    setDraftBody(
      delta !== 0
        ? `Hi,\n\nOn the proposed renewal for ${row.client}, the excess moves from ${zar(row.expiringExcess)} to ${zar(row.proposedExcess)} (${delta > 0 ? 'up' : 'down'} ${zar(Math.abs(delta))}). Annual premium would be ${zar(row.proposedPremium)}.\n\nShall we discuss options before we confirm?\n\nRuss · B-Covered`
        : `Hi,\n\nThe proposed renewal for ${row.client} (${row.policyNumber}) has no material excess change. Premium ${zar(row.proposedPremium)}.\n\nHappy to walk through the terms.\n\nRuss · B-Covered`,
    )
    setDraftOpen(true)
  }

  const menuFor = (row: RenewalRow): ContextMenuItem[] => [
    {
      id: 'discuss',
      label: 'Discuss',
      icon: MessageSquare,
      onSelect: () => openDiscussDraft(row),
    },
    {
      id: 'send',
      label: 'Send proposal',
      icon: Send,
      onSelect: () => notify(`Send renewal proposal · ${row.policyNumber} (demo)`),
    },
    {
      id: 'mark',
      label: 'Mark reviewed',
      icon: CheckCheck,
      onSelect: () => notify(`Marked reviewed · ${row.client} (demo)`),
    },
  ]

  const checkedHidden = [...checked].filter((id) => !filtered.some((r) => r.id === id)).length
  const decision = renewalDecisionHeadline(focused)
  const russExplain = renewalRussMessage(focused)

  const compactStar = gridExpanded && isFintastic

  return (
    <Page>
      <PageHeader
        title="Renewals"
        description="Review proposed terms, discuss changes with clients, and progress renewals."
        actions={<ViewModeToggle view={view} onChange={setView} />}
      />

      {toast && (
        <p className="mb-3 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-900" role="status">
          {toast}
        </p>
      )}

      {focusHiddenBanner && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <span>
            Current filters hide the focused renewal ({focused.client} · {focused.policyNumber}).
          </span>
          <Button
            size="sm"
            variant="outline"
            type="button"
            onClick={() => {
              setFilters(EMPTY_QUEUE_FILTERS)
              setFocusHiddenBanner(false)
            }}
          >
            Show this renewal
          </Button>
        </div>
      )}

      {isFintastic && !compactStar && (
        <div className="mb-6">
          <ChangeReviewView
            clientLabel={`${focused.client} · ${decision}`}
            changeHeadline={`${focused.policyNumber} · ${focused.coverType}`}
            russMessage={russExplain}
            changeFrom={zar(focused.expiringExcess)}
            changeTo={zar(focused.proposedExcess)}
            fields={fields}
            primaryActionLabel="Discuss renewal"
            onPrimaryAction={() => openDiscussDraft(focused)}
            bulkCount={checked.size}
            bulkActionLabel={checked.size > 1 ? `Review ${checked.size} selected renewals` : undefined}
            onBulkAction={() => notify(`Review ${checked.size} selected renewals (demo · checked only)`)}
            showAllTerms={showAllTerms}
            onToggleAllTerms={() => setShowAllTerms((v) => !v)}
          />
          {draftSentFor === focused.id && (
            <p className="mt-2 text-xs font-semibold text-emerald-800">
              Draft discussion marked sent for {focused.client}.
            </p>
          )}
        </div>
      )}

      {isFintastic && compactStar && (
        <div className="mb-3 rounded-xl border border-brand-200/80 bg-brand-50/40 px-3 py-2.5">
          <p className="text-sm font-semibold text-navy-900">
            {focused.client} · {decision}
          </p>
          <p className="text-xs text-navy-600">
            {focused.policyNumber} · Excess {zar(focused.expiringExcess)} → {zar(focused.proposedExcess)}
          </p>
          <Button size="sm" variant="accent" className="mt-2" type="button" onClick={() => openDiscussDraft(focused)}>
            <MessageSquare /> Discuss renewal
          </Button>
        </div>
      )}

      {!isFintastic && (
        <p className="mb-3 text-sm text-navy-600">
          Switch to Fintastic view for change review above the renewal queue.
        </p>
      )}

      <WorkingQueueGrid
        rows={RENEWAL_DEMO}
        focusedId={focused.id}
        onFocus={setFocus}
        checkedIds={checked}
        onToggleCheck={toggleCheck}
        onToggleCheckAll={toggleCheckAll}
        filters={filters}
        onFiltersChange={setFilters}
        expanded={gridExpanded}
        onExpandedChange={setGridExpanded}
        menuFor={menuFor}
        onActionMenu={setActionMenu}
        onPolicyClick={(row) => {
          setFocus(row.id)
          setPolicyDrawerRow(row)
        }}
      />

      {checked.size > 0 && (
        <div className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 flex-wrap items-center gap-2 rounded-2xl border border-navy-800/20 bg-navy-900 px-4 py-2.5 text-sm text-white shadow-xl">
          <span className="font-semibold">
            {checked.size} selected
            {checkedHidden > 0 ? ` · ${checkedHidden} hidden by filters` : ''}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="border-white/20 bg-transparent text-white hover:bg-white/10"
            onClick={() => notify(`Discuss with clients · ${checked.size} selected (demo)`)}
          >
            Discuss with clients
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="border-white/20 bg-transparent text-white hover:bg-white/10"
            onClick={() => notify(`Send renewal proposals · ${checked.size} selected (demo)`)}
          >
            Send renewal proposals
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="border-white/20 bg-transparent text-white hover:bg-white/10"
            onClick={() => notify(`Mark as reviewed · ${checked.size} selected (demo)`)}
          >
            Mark as reviewed
          </Button>
        </div>
      )}

      <RightSlideout
        open={draftOpen}
        onClose={() => setDraftOpen(false)}
        title={`Discuss ${focused.client} renewal`}
        subtitle="Draft for the focused policyholder (demo)"
        footer={
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="accent"
              onClick={() => {
                setDraftSentFor(focused.id)
                setDraftOpen(false)
                notify(`Discussion draft sent to ${focused.client} (demo)`)
              }}
            >
              <Send /> Send draft
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDraftOpen(false)}>
              Cancel
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <label className="block text-xs font-semibold text-navy-600">
            Subject
            <input
              className="field mt-1 w-full"
              value={draftSubject}
              onChange={(e) => setDraftSubject(e.target.value)}
            />
          </label>
          <label className="block text-xs font-semibold text-navy-600">
            Message
            <textarea
              className="field mt-1 min-h-[12rem] w-full"
              value={draftBody}
              onChange={(e) => setDraftBody(e.target.value)}
            />
          </label>
        </div>
      </RightSlideout>

      <RightSlideout
        open={Boolean(policyDrawerRow)}
        onClose={() => setPolicyDrawerRow(null)}
        title={policyDrawerRow ? `Renewals · ${policyDrawerRow.client}` : 'Renewal'}
        subtitle={policyDrawerRow?.policyNumber}
      >
        {policyDrawerRow && (
          <RenewalCompactPanel
            row={policyDrawerRow}
            onClose={() => setPolicyDrawerRow(null)}
            onDiscuss={() => {
              const row = policyDrawerRow
              setPolicyDrawerRow(null)
              openDiscussDraft(row)
            }}
          />
        )}
      </RightSlideout>

      <ActionCard state={actionMenu} onClose={() => setActionMenu(null)} />
    </Page>
  )
}
