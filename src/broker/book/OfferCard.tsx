import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BadgeCheck, CheckCircle2, Loader2, Mail, MessageCircle, Send, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { newKey, salesApi, useSalesMutation, whatsappUrl, type Channel, type Offer } from '@/copilot/salesApi'
import { useDataCategory } from '@/lib/supabase/category'
import { useSupabaseAuth } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { CategoryBadge, CopyButton, ErrorText, Field, OfferStatusBadge, inputClass, money, perFrequency, shortDate, today } from './bits'

type Panel = null | 'share' | 'sent' | 'accept' | 'sale'

/** One offer with the short selling sequence: share, mark sent, record acceptance, record the sale once cover is confirmed. */
export function OfferCard({ offer, highlighted, canWrite }: { offer: Offer; highlighted?: boolean; canWrite: boolean }) {
  const category = useDataCategory()
  const auth = useSupabaseAuth()
  const [chosen, setPanel] = useState<Panel>(null)
  const panel: Panel = canWrite && offer.status !== 'sold' && offer.status !== 'declined' && offer.status !== 'withdrawn' ? chosen : null
  const [keys] = useState(() => ({ sent: newKey(), accept: newKey(), sale: newKey() }))
  const [channel, setChannel] = useState<Channel>('whatsapp')
  const [note, setNote] = useState('')
  const [acceptedOn, setAcceptedOn] = useState(today())
  const [sale, setSale] = useState({ insurer_reference: '', cover_start_date: today() })
  const message = useQuery({
    queryKey: ['supabase', auth.userId, category, 'sales', 'message', offer.id, offer.status],
    queryFn: () => salesApi.message(category, offer.id),
    enabled: panel === 'share',
  })
  const opened = useSalesMutation(salesApi.shareOpened)
  const sent = useSalesMutation(salesApi.markSent)
  const accept = useSalesMutation(salesApi.accept)
  const record = useSalesMutation(salesApi.recordSale)
  const closed = offer.status === 'declined' || offer.status === 'withdrawn' || offer.status === 'sold'
  const sampleQuote = offer.from_sample_quote || offer.category === 'sample'

  const step = (s: string) => ({ draft: 0, sent: 1, accepted: 2, sold: 3 })[s] ?? -1
  const at = step(offer.status)

  return (
    <article id={`offer-${offer.id}`} className={cn('rounded-xl border bg-white p-4', highlighted ? 'border-brand-500 ring-2 ring-brand-500/20' : 'border-navy-800/10')}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-navy-900">
            {offer.insurer} · {offer.product.replace(/_/g, ' ')}
            <OfferStatusBadge status={offer.status} />
            <CategoryBadge category={offer.category} />
            {offer.from_sample_quote && <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">From a Sample quote</span>}
          </p>
          <p className="mt-0.5 text-xs text-navy-600">
            <span className="font-mono">{offer.reference}</span> · {money(offer.premium_amount)} {perFrequency(offer.premium_frequency)} · responsible: {offer.responsible?.name ?? '–'}
          </p>
        </div>
      </header>

      <ol className="mt-3 grid grid-cols-4 gap-1 text-[11px]" aria-label="Offer progress">
        {[
          ['Created', offer.created_at],
          ['Offer sent', offer.sent_at],
          ['Accepted', offer.accepted_at],
          ['Sold', offer.sale?.created_at ?? null],
        ].map(([label, when], i) => (
          <li key={label as string} className={cn('rounded-lg px-2 py-1.5', i <= at ? 'bg-emerald-50 text-emerald-800' : 'bg-navy-50 text-navy-500')}>
            <span className="block font-semibold">{label}</span>
            <span>{when ? shortDate(when as string) : '–'}</span>
          </li>
        ))}
      </ol>

      {offer.sale && (
        <p className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          <ShieldCheck className="h-4 w-4" /> Sale <span className="font-mono font-semibold">{offer.sale.reference}</span> · insurer reference{' '}
          <span className="font-mono font-semibold">{offer.sale.insurer_reference}</span> · cover from {shortDate(offer.sale.cover_start_date)}
        </p>
      )}
      {offer.status === 'accepted' && !offer.sale && (
        <p className="mt-3 rounded-lg bg-violet-50 px-3 py-2 text-xs text-violet-900">Accepted on {shortDate(offer.accepted_at)}. Waiting for the insurer to confirm cover; record the sale once you have their reference.</p>
      )}

      {canWrite && !closed && offer.status !== 'sold' && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant={panel === 'share' ? 'default' : 'outline'} onClick={() => setPanel(panel === 'share' ? null : 'share')}>
            <MessageCircle /> Share offer
          </Button>
          {offer.status === 'draft' && (
            <Button size="sm" variant={panel === 'sent' ? 'default' : 'outline'} onClick={() => setPanel(panel === 'sent' ? null : 'sent')}>
              <Send /> I sent it
            </Button>
          )}
          {(offer.status === 'draft' || offer.status === 'sent') && (
            <Button size="sm" variant={panel === 'accept' ? 'default' : 'outline'} onClick={() => setPanel(panel === 'accept' ? null : 'accept')}>
              <BadgeCheck /> Client accepted
            </Button>
          )}
          {(offer.status === 'sent' || offer.status === 'accepted') && (
            <Button size="sm" variant={panel === 'sale' ? 'default' : 'accent'} onClick={() => setPanel(panel === 'sale' ? null : 'sale')}>
              <ShieldCheck /> Record sale
            </Button>
          )}
        </div>
      )}

      {panel === 'share' && (
        <div className="mt-3 space-y-2 rounded-lg border border-navy-800/10 bg-navy-50/50 p-3">
          {message.isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-navy-500" />
          ) : message.data ? (
            <>
              {sampleQuote && <p className="text-[11px] font-semibold text-amber-800">Sample: the message is labelled as a demonstration.</p>}
              <pre className="font-sans text-xs whitespace-pre-wrap text-navy-800">{message.data.text}</pre>
              <div className="flex flex-wrap gap-2">
                <CopyButton text={message.data.text} label="Copy message" />
                <Button size="sm" variant="outline" asChild>
                  <a href={whatsappUrl(message.data.text, message.data.phone)} target="_blank" rel="noreferrer"
                    onClick={() => opened.mutate({ offer_id: offer.id, channel: 'whatsapp', key: newKey() })}>
                    <MessageCircle /> Open WhatsApp
                  </a>
                </Button>
                {message.data.email && (
                  <Button size="sm" variant="outline" asChild>
                    <a href={`mailto:${message.data.email}?subject=${encodeURIComponent(message.data.email_subject)}&body=${encodeURIComponent(message.data.text)}`}
                      onClick={() => opened.mutate({ offer_id: offer.id, channel: 'email', key: newKey() })}>
                      <Mail /> Email
                    </a>
                  </Button>
                )}
                {offer.status === 'draft' && <Button size="sm" onClick={() => setPanel('sent')}><Send /> I sent it</Button>}
              </div>
              <p className="text-[11px] text-navy-500">Opening WhatsApp or email is logged as “opened”. Confirm with “I sent it” once the message has actually gone.</p>
            </>
          ) : (
            <ErrorText error={message.error} />
          )}
        </div>
      )}

      {panel === 'sent' && (
        <form className="mt-3 space-y-2 rounded-lg border border-navy-800/10 bg-navy-50/50 p-3"
          onSubmit={(e) => { e.preventDefault(); sent.mutate({ offer_id: offer.id, channel, note, key: keys.sent }, { onSuccess: () => setPanel(null) }) }}>
          <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
            <Field label="Sent by" htmlFor={`ch-${offer.id}`}>
              <select id={`ch-${offer.id}`} className={inputClass} value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
                <option value="whatsapp">WhatsApp</option><option value="email">Email</option><option value="call">Phone call</option><option value="in_person">In person</option><option value="other">Other</option>
              </select>
            </Field>
            <Field label="Note (optional)" htmlFor={`sn-${offer.id}`}><input id={`sn-${offer.id}`} className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          </div>
          <Button size="sm" type="submit" disabled={sent.isPending}>{sent.isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Mark as Offer sent</Button>
          <ErrorText error={sent.error} />
        </form>
      )}

      {panel === 'accept' && (
        <form className="mt-3 space-y-2 rounded-lg border border-navy-800/10 bg-navy-50/50 p-3"
          onSubmit={(e) => { e.preventDefault(); accept.mutate({ offer_id: offer.id, accepted_on: acceptedOn, key: keys.accept }, { onSuccess: () => setPanel(null) }) }}>
          <Field label="Accepted on" htmlFor={`ac-${offer.id}`}><input id={`ac-${offer.id}`} type="date" className={inputClass} value={acceptedOn} max={today()} onChange={(e) => setAcceptedOn(e.target.value)} /></Field>
          <p className="text-[11px] text-navy-500">Creates a follow-up to confirm cover with {offer.insurer}.</p>
          <Button size="sm" type="submit" disabled={accept.isPending}>{accept.isPending ? <Loader2 className="animate-spin" /> : <BadgeCheck />} Record acceptance</Button>
          <ErrorText error={accept.error} />
        </form>
      )}

      {panel === 'sale' && (
        <form className="mt-3 space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3"
          onSubmit={(e) => { e.preventDefault(); record.mutate({ offer_id: offer.id, ...sale, key: keys.sale }, { onSuccess: () => setPanel(null) }) }}>
          <p className="text-xs text-emerald-900">Only record the sale once {offer.insurer} has confirmed cover. It is recorded once; repeated clicks return the same sale.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Insurer policy or confirmation reference" htmlFor={`ir-${offer.id}`}>
              <input id={`ir-${offer.id}`} className={`${inputClass} font-mono`} value={sale.insurer_reference} onChange={(e) => setSale({ ...sale, insurer_reference: e.target.value })} placeholder="SAN-MV-778812" />
            </Field>
            <Field label="Cover start date" htmlFor={`cs-${offer.id}`}>
              <input id={`cs-${offer.id}`} type="date" className={inputClass} value={sale.cover_start_date} onChange={(e) => setSale({ ...sale, cover_start_date: e.target.value })} />
            </Field>
          </div>
          <Button size="sm" variant="accent" type="submit" disabled={record.isPending || sale.insurer_reference.trim().length < 3 || !sale.cover_start_date}>
            {record.isPending ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Record sale
          </Button>
          <ErrorText error={record.error} />
        </form>
      )}
    </article>
  )
}
