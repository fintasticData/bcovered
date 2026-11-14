import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowDownLeft, ArrowUpRight, Check, Copy, Mail, MessageCircle, NotebookPen, Phone, Users, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { STAGE_LABEL, type Communication, type MemberRef, type OfferStatus, type Stage } from '@/copilot/salesApi'
import { cn } from '@/lib/utils'

export { CategoryBadge } from '../copilot/identity'

const STAGE_TONE: Record<Stage, string> = {
  new_enquiry: 'border-sky-200 bg-sky-50 text-sky-800',
  offer_sent: 'border-amber-200 bg-amber-50 text-amber-800',
  accepted: 'border-violet-200 bg-violet-50 text-violet-800',
  sold: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  client: 'border-navy-800/10 bg-navy-50 text-navy-700',
}

export function StageBadge({ stage }: { stage: Stage }) {
  return <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap', STAGE_TONE[stage])}>{STAGE_LABEL[stage]}</span>
}

const OFFER_TONE: Record<OfferStatus, string> = {
  draft: 'border-navy-800/10 bg-white text-navy-700',
  sent: 'border-amber-200 bg-amber-50 text-amber-800',
  accepted: 'border-violet-200 bg-violet-50 text-violet-800',
  sold: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  declined: 'border-red-200 bg-red-50 text-red-700',
  withdrawn: 'border-navy-800/10 bg-navy-50 text-navy-500',
}
const OFFER_LABEL: Record<OfferStatus, string> = { draft: 'Draft', sent: 'Offer sent', accepted: 'Accepted', sold: 'Sold', declined: 'Declined', withdrawn: 'Withdrawn' }

export function OfferStatusBadge({ status }: { status: OfferStatus }) {
  return <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold', OFFER_TONE[status])}>{OFFER_LABEL[status]}</span>
}

export function RoleChip({ member }: { member: MemberRef }) {
  return (
    <span className="rounded-full bg-navy-100/80 px-1.5 py-0.5 text-[10px] font-semibold text-navy-700">{member.role_label}</span>
  )
}

/** "Lerato Dube · Agent" with the referral code underneath when asked. */
export function MemberLabel({ member, code = false, empty = 'Unassigned' }: { member: MemberRef | null; code?: boolean; empty?: string }) {
  if (!member) return <span className="text-navy-400">{empty}</span>
  return (
    <span className="block min-w-0">
      <span className="flex items-center gap-1.5">
        <span className="truncate font-medium text-navy-900">{member.name}</span>
        <RoleChip member={member} />
      </span>
      {code && <span className="block font-mono text-[11px] text-navy-500">{member.referral_code}</span>}
    </span>
  )
}

export const money = (n: number | null | undefined) =>
  typeof n === 'number' ? `R${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '–'
export const perFrequency = (f: string) => (f === 'monthly' ? 'per month' : f === 'quarterly' ? 'per quarter' : f === 'annually' ? 'per year' : 'once-off')
export const shortDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : '–'
export const dateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '–'
export const today = () => new Date().toISOString().slice(0, 10)

const KIND_ICON: Record<string, typeof Phone> = { call: Phone, whatsapp: MessageCircle, email: Mail, meeting: Users, note: NotebookPen, callback_request: Phone }
export const KIND_LABEL: Record<string, string> = { call: 'Call', whatsapp: 'WhatsApp', email: 'Email', meeting: 'Meeting', note: 'Note', callback_request: 'Callback request' }
export const EVENT_LABEL: Record<Communication['event'], string> = { logged: 'Logged', whatsapp_opened: 'WhatsApp opened', message_sent: 'Message sent', reply: 'Reply' }

export function CommIcon({ kind, direction }: { kind: string; direction: string }) {
  const Icon = KIND_ICON[kind] ?? NotebookPen
  return (
    <span className="relative grid h-8 w-8 shrink-0 place-items-center rounded-full bg-navy-50 text-navy-700">
      <Icon className="h-4 w-4" aria-hidden />
      {direction !== 'internal' && (
        <span className={cn('absolute -right-1 -bottom-1 grid h-4 w-4 place-items-center rounded-full text-white', direction === 'inbound' ? 'bg-emerald-600' : 'bg-brand-500')}>
          {direction === 'inbound' ? <ArrowDownLeft className="h-2.5 w-2.5" /> : <ArrowUpRight className="h-2.5 w-2.5" />}
        </span>
      )}
    </span>
  )
}

export function CopyButton({ text, label = 'Copy', size = 'sm', variant = 'outline' }: { text: string; label?: string; size?: 'sm' | 'md'; variant?: 'outline' | 'default' | 'accent' }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      onClick={() =>
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1800)
        })
      }
    >
      {copied ? <Check /> : <Copy />} {copied ? 'Copied' : label}
    </Button>
  )
}

/** Centred dialog with focus return and Escape to close, matching the quote dialogs. */
export function Dialog({ title, onClose, children, wide = false, footer }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('keydown', esc)
      opener?.focus()
    }
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-navy-900/50 sm:place-items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close" tabIndex={-1} onClick={onClose} />
      <div className={cn('panel relative flex max-h-[92dvh] w-full flex-col rounded-b-none shadow-2xl sm:max-h-[88dvh] sm:rounded-b-2xl', wide ? 'sm:max-w-2xl' : 'sm:max-w-lg')}>
        <div className="flex items-start justify-between gap-3 border-b border-navy-800/10 px-4 py-3 sm:px-5 sm:py-4">
          <h2 className="min-w-0 text-base font-semibold text-navy-900">{title}</h2>
          <Button ref={closeRef} size="icon" variant="ghost" onClick={onClose} aria-label="Close">
            <X />
          </Button>
        </div>
        <div className={cn('scroll-area flex-1 px-4 py-4 sm:px-5', !footer && 'pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-4')}>{children}</div>
        {footer && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-navy-800/10 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5 sm:pb-3 max-sm:[&>*]:flex-1">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-xs font-semibold text-navy-700">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-navy-500">{hint}</p>}
    </div>
  )
}

export const inputClass = 'w-full rounded-lg border border-navy-800/15 bg-white px-3 py-2 text-sm text-navy-900 placeholder:text-navy-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20'

export function ErrorText({ error }: { error: unknown }) {
  if (!error) return null
  return (
    <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800" role="alert">
      {(error as Error).message}
    </p>
  )
}
