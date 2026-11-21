import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { ExternalLink, MessageSquare, Plus, ShieldAlert } from 'lucide-react'
import type { CustomerPageDto } from '@/api/customerPage'
import { useServiceJobsForClaim } from '@/api/serviceProviders'
import { CUSTOMER_CLAIM_STATUS } from '@/broker/claims/claimLabels'
import {
  claimHeadline,
  claimItemCardTitle,
  claimProviderCardTitle,
  claimQuotesUnlocked,
  primaryProviderFromJobs,
} from '@/broker/claims/claimServiceQuotes'
import { DataGrid } from '@/broker/shared/DataGrid'
import { RightSlideout } from '@/broker/shared/RightSlideout'
import {
  RowActionsButton,
  RowContextMenu,
  type ContextMenuItem,
  type ContextMenuState,
} from '@/broker/shared/RowContextMenu'
import { Button } from '@/components/ui/button'
import {
  ActionCard,
  ActiveStepClaimView,
  buildClaimTimelineSteps,
  useLayoutView,
  ViewModeToggle,
  withBookedSlot,
} from '@/fintastic-ux'
import type { CustomerPagePanelMode } from '@/pages/your-page/CustomerPageQuotesPanel'

type ClaimRow = CustomerPageDto['claims'][number]

/** Claims from customer_page_get — shared by My Page and broker Customer Area. */
export function CustomerPageClaimsPanel({
  dto,
  mode,
  basePath = '/my',
  onAskAva,
  onWorkingOn,
  onReportClaim,
  compact = false,
}: {
  dto: CustomerPageDto
  mode: CustomerPagePanelMode
  basePath?: '/my' | '/demo/my'
  onAskAva?: (ctx?: { itemIds?: string[]; label: string }) => void
  onWorkingOn?: (label: string | null) => void
  /** Open ReportClaimSlideout in the host (stays on Cover / Customer Area). */
  onReportClaim?: () => void
  compact?: boolean
}) {
  const readOnly = mode === 'preview'
  const [, setParams] = useSearchParams()
  const [selected, setSelected] = useState<ClaimRow | null>(null)
  const [rowMenu, setRowMenu] = useState<ContextMenuState>(null)
  const [bookedSlot, setBookedSlot] = useState<string | null>(null)
  const [statusNote, setStatusNote] = useState<string | null>(null)
  const { view, setView, isFintastic } = useLayoutView('fintastic')

  const claims = dto.claims ?? []

  const openClaim = (row: ClaimRow) => {
    setSelected(row)
    setBookedSlot(null)
    setStatusNote(null)
    onWorkingOn?.(row.reference)
  }

  const closeClaim = () => {
    setSelected(null)
    setBookedSlot(null)
    setStatusNote(null)
    onWorkingOn?.(null)
  }

  const menuFor = (row: ClaimRow): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [
      {
        id: 'open',
        label: 'Open claim',
        icon: ShieldAlert,
        onSelect: () => openClaim(row),
      },
    ]
    if (mode === 'broker') {
      items.push({
        id: 'desk',
        label: 'Open in claims desk',
        icon: ExternalLink,
        onSelect: () => {
          window.location.assign(`/broker/claims/${row.id}?view=fintastic`)
        },
      })
    }
    if (mode === 'customer') {
      items.push({
        id: 'message',
        label: 'Message about this claim',
        icon: MessageSquare,
        onSelect: () => {
          onWorkingOn?.(row.reference)
          setParams(
            (prev) => {
              const next = new URLSearchParams(prev)
              next.set('tab', 'comms')
              next.set('thread', 'concierge')
              next.set('claimId', row.id)
              next.delete('quoteRequestId')
              return next
            },
            { replace: false },
          )
        },
      })
      if (onAskAva) {
        items.push({
          id: 'ava',
          label: 'Ask Ava about this',
          icon: MessageSquare,
          onSelect: () => {
            onWorkingOn?.(row.reference)
            onAskAva({ label: row.reference })
          },
        })
      }
    }
    return items
  }

  const columns = useMemo<ColumnDef<ClaimRow, unknown>[]>(
    () => [
      {
        id: 'ref',
        accessorFn: (r) => r.reference,
        header: 'Reference',
        cell: ({ row }) => (
          <button type="button" className="text-left" onClick={() => openClaim(row.original)}>
            <p className="font-mono text-sm font-semibold text-navy-900">{row.original.reference}</p>
            <p className="text-xs capitalize text-navy-500">
              {row.original.incident_type.replace(/_/g, ' ')}
            </p>
          </button>
        ),
      },
      {
        id: 'status',
        accessorFn: (r) => r.status,
        header: 'Status',
        cell: ({ row }) => (
          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold uppercase text-sky-900">
            {CUSTOMER_CLAIM_STATUS[row.original.status] ?? row.original.status}
          </span>
        ),
      },
      {
        id: 'next',
        accessorFn: (r) => r.next_action ?? '',
        header: 'Next step',
        cell: ({ row }) => (
          <span className="text-xs text-navy-700">
            {row.original.next_action || row.original.customer_update || '—'}
          </span>
        ),
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }) => <RowActionsButton items={menuFor(row.original)} onOpen={setRowMenu} />,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, isFintastic],
  )

  const coveredItemLabel =
    dto.items.find((i) => i.policy_id && i.customer_status === 'covered')?.display_label ??
    dto.items[0]?.display_label

  const jobsQuery = useServiceJobsForClaim(selected?.id)
  const jobs = jobsQuery.data ?? []
  const quotesUnlocked = claimQuotesUnlocked({ status: selected?.status }) || jobs.length > 0
  const primaryProvider = primaryProviderFromJobs(jobs)
  const quotesHref = selected
    ? `/broker/concierge/providers?claimId=${selected.id}&personId=${dto.person_id}&job=1`
    : '/broker/concierge/providers'

  const claimView = selected ? (
    <ActiveStepClaimView
      layout={isFintastic && mode !== 'broker' ? 'page' : 'panel'}
      role={mode === 'broker' ? 'broker' : 'customer'}
      headline={claimHeadline({
        incidentType: selected.incident_type,
        statusLabel: CUSTOMER_CLAIM_STATUS[selected.status] ?? selected.status,
        reference: selected.reference,
      })}
      subhead={`Hi ${dto.greeting_name || 'there'}, here’s the latest on ${selected.reference} and what to do next.`}
      steps={withBookedSlot(
        buildClaimTimelineSteps({
          status: selected.status,
          incidentAt: selected.incident_at,
          nextAction: selected.next_action,
          booked: Boolean(bookedSlot),
          incidentType: selected.incident_type,
          quotesUnlocked,
          hasQuotes: jobs.length > 0,
        }),
        bookedSlot,
      )}
      proposedSlotLabel={
        quotesUnlocked
          ? primaryProvider
            ? `${primaryProvider.name} — ${primaryProvider.lines[1] ?? 'quote on file'}`
            : 'Insurer accepted — your team can collect repair quotes.'
          : 'Waiting for insurer acceptance before repair quotes open.'
      }
      bookedSlotLabel={bookedSlot}
      onConfirm={
        quotesUnlocked
          ? (slot) => {
              setBookedSlot(slot)
              setStatusNote(`Booking confirmed for ${slot} (demo).`)
            }
          : undefined
      }
      onChooseOther={() => setStatusNote('Choose another available slot, then confirm.')}
      vehicleCard={{
        title: claimItemCardTitle(selected.incident_type),
        lines: [coveredItemLabel, dto.full_name, selected.reference].filter(Boolean) as string[],
      }}
      repairerCard={
        quotesUnlocked
          ? {
              title: claimProviderCardTitle(selected.incident_type),
              badge: primaryProvider ? 'Quote on file' : 'Ready for quotes',
              lines: primaryProvider
                ? primaryProvider.lines
                : [selected.next_action || 'Awaiting provider quotes'],
            }
          : {
              title: claimProviderCardTitle(selected.incident_type),
              badge: 'Waiting for insurer',
              lines: ['Service providers appear after insurer acceptance', selected.next_action || 'Awaiting decision'],
            }
      }
      documents={[
        { name: 'Claim form.pdf', meta: 'On file' },
        { name: 'Incident photos', meta: selected.customer_update ? 'Uploaded' : 'Pending' },
      ]}
      roleActions={
        mode === 'broker' ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" asChild>
              <Link to={`/broker/claims/${selected.id}?view=fintastic`}>Open claims desk</Link>
            </Button>
            {quotesUnlocked ? (
              <Button size="sm" variant="accent" asChild>
                <Link to={quotesHref}>Get repair quotes</Link>
              </Button>
            ) : (
              <Button size="sm" variant="outline" asChild>
                <Link to={`/broker/concierge/providers?personId=${dto.person_id}`}>Service providers</Link>
              </Button>
            )}
          </div>
        ) : mode === 'customer' ? (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="accent"
              type="button"
              onClick={() => {
                onWorkingOn?.(selected.reference)
                setParams(
                  (prev) => {
                    const next = new URLSearchParams(prev)
                    next.set('tab', 'comms')
                    next.set('thread', 'concierge')
                    next.set('claimId', selected.id)
                    next.delete('quoteRequestId')
                    return next
                  },
                  { replace: false },
                )
              }}
            >
              <MessageSquare /> Message about this claim
            </Button>
            {onAskAva ? (
              <Button
                size="sm"
                variant="outline"
                type="button"
                onClick={() => onAskAva({ label: selected.reference })}
              >
                Ask Ava about this claim
              </Button>
            ) : null}
          </div>
        ) : null
      }
    />
  ) : null

  return (
    <div className="space-y-3">
      {!compact && (
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-navy-900">
              {mode === 'broker' ? 'As on My Page' : 'Claims'}
            </h2>
            <p className="text-xs text-navy-600">
              {mode === 'broker'
                ? 'Customer-visible claim progress from the same customer_page book.'
                : 'Track open claims. Start a new report from a covered item on Items & cover.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {mode !== 'broker' && <ViewModeToggle view={view} onChange={setView} />}
            {!readOnly && onReportClaim && (
              <Button size="sm" variant={mode === 'broker' ? 'outline' : 'accent'} type="button" onClick={onReportClaim}>
                <Plus /> {mode === 'broker' ? 'Incident form' : 'Report a claim'}
              </Button>
            )}
          </div>
        </div>
      )}

      {statusNote && (
        <p className="rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-900" role="status">
          {statusNote}
        </p>
      )}

      {isFintastic && mode !== 'broker' && selected && (
        <div className="mb-2">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-navy-500">
              Working on <span className="text-navy-900">{selected.reference}</span>
            </p>
            <Button size="sm" variant="ghost" type="button" onClick={closeClaim}>
              Close claim
            </Button>
          </div>
          {claimView}
        </div>
      )}

      <DataGrid
        data={claims}
        columns={columns}
        getRowId={(r) => r.id}
        storageKey={mode === 'broker' ? 'broker-customer-page-claims' : 'customer-portal-claims'}
        searchPlaceholder="Search claims…"
        searchText={(r) => `${r.reference} ${r.incident_type} ${r.status}`}
        getRowContextMenu={(row) => menuFor(row)}
        minWidth={compact ? 520 : 640}
        empty={
          <div className="rounded-xl border border-dashed border-navy-800/20 bg-white px-4 py-8 text-center">
            <ShieldAlert className="mx-auto h-8 w-8 text-navy-300" />
            <p className="mt-3 text-sm font-semibold text-navy-900">No claims yet</p>
            {!readOnly && onReportClaim && (
              <Button size="sm" variant="accent" className="mt-4" type="button" onClick={onReportClaim}>
                <Plus /> Report a claim
              </Button>
            )}
          </div>
        }
      />

      {/* Classic customer, or broker mirror: claim progress in right slide-out */}
      {((!isFintastic && mode !== 'broker') || mode === 'broker') && (
        <RightSlideout
          open={Boolean(selected)}
          onClose={closeClaim}
          title={selected?.reference ?? 'Claim'}
          subtitle={selected ? selected.incident_type.replace(/_/g, ' ') : undefined}
          size="wide"
          headerActions={
            mode === 'broker' && selected ? (
              <Button size="sm" variant="outline" asChild>
                <Link to={`/broker/claims/${selected.id}?view=fintastic`}>
                  <ExternalLink className="h-3.5 w-3.5" /> Desk
                </Link>
              </Button>
            ) : undefined
          }
          footer={
            mode === 'broker' && selected ? (
              <Button size="sm" variant="accent" asChild>
                <Link to={`/broker/claims/${selected.id}?view=fintastic`}>Open in claims desk</Link>
              </Button>
            ) : (
              <Button size="sm" variant="outline" asChild>
                <Link to={`${basePath}?tab=items`}>View items & cover</Link>
              </Button>
            )
          }
        >
          {claimView}
        </RightSlideout>
      )}

      {isFintastic ? (
        <ActionCard state={rowMenu} onClose={() => setRowMenu(null)} />
      ) : (
        <RowContextMenu state={rowMenu} onClose={() => setRowMenu(null)} />
      )}
    </div>
  )
}
