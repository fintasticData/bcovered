import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { Eye, FileText, MessageSquare, Plus } from 'lucide-react'
import type { CustomerPageDto, CustomerQuoteRequest } from '@/api/customerPage'
import { DataGrid } from '@/broker/shared/DataGrid'
import { RightSlideout } from '@/broker/shared/RightSlideout'
import {
  RowActionsButton,
  RowContextMenu,
  type ContextMenuItem,
  type ContextMenuState,
} from '@/broker/shared/RowContextMenu'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { AddItemSlideout } from '@/pages/my/AddItemSlideout'
import { GetQuoteSlideout } from '@/pages/my/GetQuoteSlideout'
import { useLayoutView } from '@/fintastic-ux'
import type { DataCategory } from '@/lib/supabase/category'

const STATUS_LABEL: Record<string, string> = {
  submitted: 'Submitted',
  with_broker: 'With broker',
  offers_ready: 'Offers ready',
  accepted: 'Accepted',
  withdrawn: 'Withdrawn',
  draft: 'Draft',
  replaced: 'Replaced',
}

export type CustomerPagePanelMode = 'customer' | 'preview' | 'broker'

/** Quote requests from customer_page_get — shared by My Page and broker Customer Area. */
export function CustomerPageQuotesPanel({
  dto,
  mode,
  category = 'live',
  onRefresh,
  onAskAva,
  onWorkingOn,
  compact = false,
}: {
  dto: CustomerPageDto
  mode: CustomerPagePanelMode
  category?: DataCategory
  basePath?: '/my' | '/demo/my'
  onRefresh?: () => void
  onAskAva?: (ctx?: { itemIds?: string[]; label: string }) => void
  onWorkingOn?: (label: string | null) => void
  /** Broker embed: hide Add item / Get quote chrome that belongs on the customer desk. */
  compact?: boolean
}) {
  const readOnly = mode === 'preview' || mode === 'broker'
  const [params, setParams] = useSearchParams()
  const { isFintastic } = useLayoutView('fintastic')
  const [addOpen, setAddOpen] = useState(false)
  const [quoteOpen, setQuoteOpen] = useState(false)
  const [quotePreselect, setQuotePreselect] = useState<string[]>([])
  const [selected, setSelected] = useState<CustomerQuoteRequest | null>(null)
  const [detailTab, setDetailTab] = useState('request')
  const [rowMenu, setRowMenu] = useState<ContextMenuState>(null)

  const requests = dto.quote_requests ?? []

  useEffect(() => {
    if (readOnly) return
    if (params.get('getQuote') === '1') {
      setQuoteOpen(true)
      const next = new URLSearchParams(params)
      next.delete('getQuote')
      setParams(next, { replace: true })
    }
  }, [params, setParams, readOnly])

  useEffect(() => {
    const rid = params.get('request')
    if (!rid || !requests.length) return
    const found = requests.find((r) => r.id === rid)
    if (found) {
      setSelected(found)
      setDetailTab('request')
      onWorkingOn?.(found.reference)
    }
  }, [params, requests, onWorkingOn])

  const openRequest = (row: CustomerQuoteRequest) => {
    setSelected(row)
    setDetailTab('request')
    onWorkingOn?.(row.reference)
  }

  const menuFor = (row: CustomerQuoteRequest): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [
      {
        id: 'open',
        label: 'Open request',
        icon: Eye,
        onSelect: () => openRequest(row),
      },
    ]
    if (!readOnly) {
      items.push({
        id: 'again',
        label: 'Get another quote',
        icon: Plus,
        onSelect: () => {
          setQuotePreselect(row.item_ids ?? [])
          setQuoteOpen(true)
        },
      })
    }
    if (mode === 'broker') {
      items.push({
        id: 'person',
        label: 'Open customer record',
        icon: Eye,
        onSelect: () => {
          window.location.assign(`/broker/customers/people/${dto.person_id}?rtab=quotes`)
        },
      })
    } else if (mode === 'customer') {
      items.push({
        id: 'message',
        label: 'Message about this quote',
        icon: MessageSquare,
        onSelect: () => {
          onWorkingOn?.(row.reference)
          setParams(
            (prev) => {
              const next = new URLSearchParams(prev)
              next.set('tab', 'comms')
              next.set('thread', 'concierge')
              next.set('quoteRequestId', row.id)
              next.delete('claimId')
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

  const columns = useMemo<ColumnDef<CustomerQuoteRequest, unknown>[]>(
    () => [
      {
        id: 'ref',
        accessorFn: (r) => r.reference,
        header: 'Reference',
        cell: ({ row }) => (
          <button type="button" className="text-left" onClick={() => openRequest(row.original)}>
            <p className="font-mono text-sm font-semibold text-navy-900">{row.original.reference}</p>
            <p className="text-xs text-navy-500">
              {(row.original.items ?? []).map((i) => i.label).join(', ') || 'Items linked'}
            </p>
          </button>
        ),
      },
      {
        id: 'status',
        accessorFn: (r) => r.status,
        header: 'Status',
        cell: ({ row }) => (
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
              row.original.status === 'offers_ready' ? 'bg-sky-100 text-sky-900' : 'bg-amber-100 text-amber-900',
            )}
          >
            {STATUS_LABEL[row.original.status] ?? row.original.status}
          </span>
        ),
      },
      {
        id: 'cover',
        accessorFn: (r) => r.cover_requested ?? '',
        header: 'Cover',
        cell: ({ row }) => row.original.cover_requested || '—',
      },
      {
        id: 'next',
        accessorFn: (r) => r.next_step,
        header: 'Next step',
        cell: ({ row }) => <span className="text-xs text-navy-700">{row.original.next_step}</span>,
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }) => <RowActionsButton items={menuFor(row.original)} onOpen={setRowMenu} />,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- menu closes over latest handlers
    [mode, readOnly],
  )

  return (
    <div className="space-y-3">
      {!compact && (
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-navy-900">
              {mode === 'broker' ? 'Customer quote requests' : 'Quotes'}
            </h2>
            <p className="text-xs text-navy-600">
              {mode === 'broker'
                ? 'What the customer sees on My Page — offers stay under Quotes & decisions.'
                : 'Track quote requests and review offers when your broker releases them.'}
            </p>
          </div>
          {!readOnly && (
            <Button
              size="sm"
              variant="accent"
              onClick={() => {
                setQuotePreselect([])
                setQuoteOpen(true)
              }}
            >
              <Plus /> Get a quote
            </Button>
          )}
        </div>
      )}

      {compact && mode === 'broker' && (
        <p className="text-xs text-navy-600">
          Customer requests from My Page ({requests.length}). Broker offers remain in Quotes & decisions above.
        </p>
      )}

      {!readOnly && quoteOpen && isFintastic && (
        <GetQuoteSlideout
          open={quoteOpen}
          onClose={() => setQuoteOpen(false)}
          dto={dto}
          category={category}
          preselectedIds={quotePreselect}
          variant="journey"
          onAskAva={onAskAva ? () => onAskAva({ label: 'Quote request' }) : undefined}
          onDone={(id) => {
            onRefresh?.()
            setQuoteOpen(false)
            setParams((prev) => {
              const next = new URLSearchParams(prev)
              next.set('tab', 'quotes')
              next.set('view', 'fintastic')
              next.set('request', id)
              return next
            }, { replace: true })
          }}
        />
      )}

      <DataGrid
        data={requests}
        columns={columns}
        getRowId={(r) => r.id}
        storageKey={mode === 'broker' ? 'broker-customer-page-quotes' : 'customer-portal-quotes'}
        searchPlaceholder="Search quotes…"
        searchText={(r) =>
          `${r.reference} ${r.cover_requested ?? ''} ${(r.items ?? []).map((i) => i.label).join(' ')}`
        }
        getRowContextMenu={(row) => menuFor(row)}
        minWidth={compact ? 560 : 680}
        empty={
          <div className="rounded-xl border border-dashed border-navy-800/20 bg-white px-4 py-8 text-center">
            <FileText className="mx-auto h-8 w-8 text-navy-300" />
            <p className="mt-3 text-sm font-semibold text-navy-900">
              {mode === 'broker' ? 'No customer quote requests yet' : 'You haven’t requested a quote yet'}
            </p>
            {!readOnly && (
              <Button
                size="sm"
                variant="accent"
                className="mt-4"
                onClick={() => {
                  setQuotePreselect([])
                  setQuoteOpen(true)
                }}
              >
                <Plus /> Get a quote
              </Button>
            )}
          </div>
        }
      />

      {!readOnly && (
        <>
          <AddItemSlideout
            open={addOpen}
            onClose={() => setAddOpen(false)}
            dto={dto}
            category={category}
            onDone={() => onRefresh?.()}
            onSavedAndQuote={(itemId) => {
              setAddOpen(false)
              setQuotePreselect([itemId])
              setQuoteOpen(true)
              onRefresh?.()
            }}
          />
          {!isFintastic && (
            <GetQuoteSlideout
              open={quoteOpen}
              onClose={() => setQuoteOpen(false)}
              dto={dto}
              category={category}
              preselectedIds={quotePreselect}
              variant="slideout"
              onDone={(id) => {
                onRefresh?.()
                setQuoteOpen(false)
                setParams((prev) => {
                  const next = new URLSearchParams(prev)
                  next.set('tab', 'quotes')
                  next.set('request', id)
                  return next
                }, { replace: true })
              }}
            />
          )}
        </>
      )}

      <RightSlideout
        open={Boolean(selected)}
        onClose={() => {
          setSelected(null)
          onWorkingOn?.(null)
        }}
        title={selected?.reference ?? 'Quote request'}
        subtitle={selected?.cover_requested ?? undefined}
        size="wide"
        footer={
          selected && !readOnly ? (
            <Button
              size="sm"
              variant="accent"
              onClick={() => {
                setQuotePreselect(selected.item_ids ?? [])
                setSelected(null)
                setQuoteOpen(true)
              }}
            >
              Get another quote
            </Button>
          ) : mode === 'broker' && selected ? (
            <Button size="sm" variant="outline" asChild>
              <Link to={`/broker/customers/people/${dto.person_id}/your-page`}>Preview My Page</Link>
            </Button>
          ) : null
        }
      >
        {selected && (
          <Tabs value={detailTab} onValueChange={setDetailTab}>
            <TabsList>
              <TabsTrigger value="request">Request</TabsTrigger>
              <TabsTrigger value="offers">Offers</TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
            </TabsList>
            <TabsContent value="request" className="mt-4 space-y-3 text-sm">
              <dl className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-[10px] font-bold tracking-wide text-navy-500 uppercase">Status</dt>
                  <dd className="mt-0.5 font-semibold text-navy-900">
                    {STATUS_LABEL[selected.status] ?? selected.status}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold tracking-wide text-navy-500 uppercase">Next step</dt>
                  <dd className="mt-0.5 text-navy-800">{selected.next_step}</dd>
                </div>
              </dl>
              <div>
                <p className="text-[10px] font-bold tracking-wide text-navy-500 uppercase">Items</p>
                <ul className="mt-1 space-y-1">
                  {(selected.items ?? []).map((i) => (
                    <li key={i.id} className="font-semibold text-navy-900">
                      {i.label}
                    </li>
                  ))}
                </ul>
              </div>
              {selected.notes && <p className="text-navy-700">{selected.notes}</p>}
            </TabsContent>
            <TabsContent value="offers" className="mt-4 space-y-3 text-sm">
              {selected.status === 'offers_ready' && selected.released_quote_id ? (
                <div className="space-y-2">
                  <p className="rounded-lg bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-950">
                    Sample offers available — demo mode.
                  </p>
                  <Button size="sm" variant="outline" asChild>
                    <Link to={`/portal/proposals/${selected.released_quote_id}`}>Open comparison</Link>
                  </Button>
                </div>
              ) : (
                <p className="text-navy-700">Waiting on your broker. Offers will appear here when released.</p>
              )}
            </TabsContent>
            <TabsContent value="documents" className="mt-4 text-sm text-navy-700">
              No documents attached to this request yet.
            </TabsContent>
            <TabsContent value="activity" className="mt-4 text-sm text-navy-700">
              Submitted {selected.created_at ? new Date(selected.created_at).toLocaleString('en-ZA') : '—'}.
            </TabsContent>
          </Tabs>
        )}
      </RightSlideout>

      <RowContextMenu state={rowMenu} onClose={() => setRowMenu(null)} />
    </div>
  )
}
