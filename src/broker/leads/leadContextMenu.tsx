import {
  CalendarClock,
  ClipboardCopy,
  ExternalLink,
  Mail,
  Phone,
  ShieldCheck,
  Sparkles,
  StepForward,
  UserRound,
  XCircle,
} from 'lucide-react'
import type { LeadRow } from '@/server/api'
import type { LeadStatus } from '@/server/db/schema'
import { LEAD_PIPELINE_STAGES } from '@/server/db/schema'
import { humanise } from '@/components/StatusBadge'
import type { ContextMenuItem } from '../shared/RowContextMenu'
import { nextPipelineStage } from './LeadProgressBar'

export type LeadMenuActions = {
  open: (lead: LeadRow) => void
  openCustomerArea: (lead: LeadRow) => void
  setStatus: (lead: LeadRow, status: LeadStatus) => void
  setFollowUp: (lead: LeadRow) => void
  assignOwner: (lead: LeadRow) => void
  close: (lead: LeadRow) => void
  askRuss: (lead: LeadRow) => void
}

function contact(lead: LeadRow) {
  return {
    phone: lead.prospect?.phone ?? lead.customer_phone ?? null,
    email: lead.prospect?.email ?? lead.customer_email ?? null,
  }
}

export function buildLeadContextMenu(lead: LeadRow, actions: LeadMenuActions): ContextMenuItem[] {
  const { phone, email } = contact(lead)
  const next = nextPipelineStage(lead.status)
  const openPipeline = !['live', 'closed'].includes(lead.status)
  const items: ContextMenuItem[] = [
    {
      id: 'open',
      label: 'Open opportunity',
      icon: ExternalLink,
      onSelect: () => actions.open(lead),
    },
    {
      id: 'customer-area',
      label: 'Open in Customer Area',
      icon: UserRound,
      onSelect: () => actions.openCustomerArea(lead),
    },
    { type: 'separator', id: 'sep-contact' },
    {
      id: 'call',
      label: phone ? `Call ${phone}` : 'Call',
      icon: Phone,
      disabled: !phone,
      disabledReason: 'No phone on this lead',
      onSelect: () => {
        if (phone) window.location.href = `tel:${phone}`
      },
    },
    {
      id: 'email',
      label: email ? `Email ${email}` : 'Email',
      icon: Mail,
      disabled: !email,
      disabledReason: 'No email on this lead',
      onSelect: () => {
        if (email) window.location.href = `mailto:${email}`
      },
    },
    {
      id: 'copy',
      label: 'Copy contact',
      icon: ClipboardCopy,
      disabled: !phone && !email,
      disabledReason: 'No contact details to copy',
      onSelect: () => {
        const text = [lead.customer_name, phone, email].filter(Boolean).join('\n')
        void navigator.clipboard.writeText(text)
      },
    },
  ]

  if (openPipeline) {
    items.push({ type: 'separator', id: 'sep-work' })
    if (next) {
      items.push({
        id: 'advance',
        label: next === 'live' ? 'Confirm cover · Mark live' : `Advance to ${humanise(next)}`,
        icon: next === 'live' ? ShieldCheck : StepForward,
        onSelect: () => actions.setStatus(lead, next),
      })
    }
    if (lead.status === 'accepted') {
      items.push({
        id: 'mark-live',
        label: 'Confirm cover · Mark live',
        icon: ShieldCheck,
        onSelect: () => actions.setStatus(lead, 'live'),
      })
    }
    items.push({
      id: 'follow-up',
      label: 'Set follow-up',
      icon: CalendarClock,
      onSelect: () => actions.setFollowUp(lead),
    })
    items.push({
      id: 'assign',
      label: 'Assign owner…',
      icon: UserRound,
      onSelect: () => actions.assignOwner(lead),
    })
  }

  items.push({ type: 'separator', id: 'sep-more' })
  items.push({
    id: 'russ',
    label: 'Ask Russ (Working on this)',
    icon: Sparkles,
    onSelect: () => actions.askRuss(lead),
  })

  if (lead.status !== 'closed') {
    items.push({
      id: 'close',
      label: 'Close opportunity',
      icon: XCircle,
      danger: true,
      onSelect: () => actions.close(lead),
    })
  }

  // Deduplicate mark-live if advance already points to live
  if (lead.status === 'accepted' && next === 'live') {
    return items.filter((i) => i.type === 'separator' || i.id !== 'mark-live')
  }

  void LEAD_PIPELINE_STAGES
  return items
}

export function isLeadOverdue(lead: LeadRow): boolean {
  if (!lead.next_action_due_at || lead.status === 'live' || lead.status === 'closed') return false
  return new Date(lead.next_action_due_at).getTime() < Date.now()
}
