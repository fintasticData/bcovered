import { Eye, FileText, MessageSquare, Plus, ShieldAlert } from 'lucide-react'
import type { CustomerItemStatus, CustomerPageItem } from '@/api/customerPage'
import type { ContextMenuItem } from '@/broker/shared/RowContextMenu'

export function itemStatus(item: CustomerPageItem): CustomerItemStatus {
  return (item.customer_status || 'awaiting_cover') as CustomerItemStatus
}

/** Right-click / ⋯ actions for a customer portal item row. */
export function buildPortalItemMenu(
  item: CustomerPageItem,
  opts: {
    basePath: '/my' | '/demo/my'
    readOnly?: boolean
    onOpen: (item: CustomerPageItem, tab?: string) => void
    onAskAva?: () => void
    /** @deprecated use onAskAva */
    onAskRuss?: () => void
    onRequestQuote?: (item: CustomerPageItem) => void
    onReportClaim?: (item: CustomerPageItem) => void
  },
): ContextMenuItem[] {
  const status = itemStatus(item)
  const askAva = opts.onAskAva ?? opts.onAskRuss
  const items: ContextMenuItem[] = []

  if (status === 'covered') {
    items.push({
      id: 'cover',
      label: 'View cover',
      icon: Eye,
      onSelect: () => opts.onOpen(item, 'cover'),
    })
    items.push({
      id: 'docs',
      label: 'View policy documents',
      icon: FileText,
      onSelect: () => opts.onOpen(item, 'documents'),
    })
  } else {
    items.push({
      id: 'open',
      label: 'Open details',
      icon: Eye,
      onSelect: () => opts.onOpen(item, 'overview'),
    })
  }

  if (!opts.readOnly) {
    if (status === 'view_quote' || item.quote_id) {
      items.push({
        id: 'quote',
        label: 'View quote',
        icon: FileText,
        onSelect: () => opts.onOpen(item, 'quote'),
      })
    }

    if (status !== 'covered' && opts.onRequestQuote) {
      items.unshift({
        id: 'get-quote',
        label: 'Get a quote',
        icon: Plus,
        onSelect: () => opts.onRequestQuote?.(item),
      })
    } else if (status === 'covered' && opts.onRequestQuote) {
      items.push({
        id: 're-quote',
        label: 'Get another quote for this item',
        icon: Plus,
        onSelect: () => opts.onRequestQuote?.(item),
      })
    }

    if (status === 'covered' && item.policy_id && opts.onReportClaim) {
      items.push({
        id: 'claim',
        label: 'Report a claim',
        icon: ShieldAlert,
        onSelect: () => opts.onReportClaim?.(item),
      })
    }

    if (askAva) {
      items.push({ type: 'separator', id: 'sep-ava' })
      items.push({
        id: 'ava',
        label:
          item.item_type === 'vehicle'
            ? 'Ask Ava about this vehicle'
            : 'Ask Ava about this',
        icon: MessageSquare,
        onSelect: askAva,
      })
    }
  }

  return items
}
