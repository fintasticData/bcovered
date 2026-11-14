import { useState, type FormEvent } from 'react'
import { CheckCircle2, Loader2, MessageCircle, Search, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  newKey,
  referralApi,
  referralPathFor,
  referralUrl,
  salesApi,
  shareText,
  useBookGrid,
  useClientRecord,
  useSalesMutation,
  whatsappUrl,
  type Frequency,
  type MemberRef,
} from '@/copilot/salesApi'
import { useDataCategory } from '@/lib/supabase/category'
import { CategoryBadge, CopyButton, Dialog, ErrorText, Field, inputClass, money } from './bits'

export const PRODUCTS = [
  { id: 'motor', label: 'Motor' },
  { id: 'home', label: 'Home (buildings)' },
  { id: 'household_contents', label: 'Household contents' },
  { id: 'life', label: 'Life cover' },
  { id: 'funeral', label: 'Funeral cover' },
  { id: 'business', label: 'Business cover' },
  { id: 'other', label: 'Other' },
]

// ------------------------------------------------------------------ Add client / capture an enquiry

export function AddClientDialog({ onClose, onCreated, team, me, canAssign }: {
  onClose: () => void
  onCreated: (personId: string) => void
  team: MemberRef[]
  me: MemberRef | null
  canAssign: boolean
}) {
  const category = useDataCategory()
  const [key] = useState(newKey)
  const [f, setF] = useState({ first_names: '', surname: '', phone: '', email: '', interest: 'motor', note: '', referral_code: '', assign_member_id: '' })
  const [code, setCode] = useState<{ state: 'idle' | 'checking' | 'valid' | 'invalid'; text?: string }>({ state: 'idle' })
  const [matches, setMatches] = useState<Array<Record<string, unknown>> | null>(null)
  const capture = useSalesMutation(salesApi.capture)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }))

  const checkCode = async () => {
    const value = f.referral_code.trim()
    if (!value) return setCode({ state: 'idle' })
    setCode({ state: 'checking' })
    try {
      const r = await referralApi.resolve(value)
      setCode(r.valid ? { state: 'valid', text: `Referred by ${r.referrer_name} (${r.role_label}) · ${r.brokerage}` } : { state: 'invalid', text: r.reason })
    } catch (e) {
      setCode({ state: 'invalid', text: (e as Error).message })
    }
  }

  const submit = (extra: { link_person_id?: string; force_new?: boolean } = {}) =>
    capture.mutate(
      { ...f, interest: PRODUCTS.find((p) => p.id === f.interest)?.label ?? f.interest, assign_member_id: f.assign_member_id || undefined, referral_code: f.referral_code.trim() || undefined, key, ...extra },
      {
        onSuccess: (r) => {
          if (r.outcome === 'needs_input') return setMatches(r.choices ?? [])
          const id = (r.person_id as string) ?? (r.client_id as string)
          if (id) onCreated(id)
          onClose()
        },
      },
    )

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (code.state === 'invalid') return
    submit()
  }
  const valid = f.first_names.trim() && f.surname.trim() && (f.phone.trim() || f.email.trim())

  return (
    <Dialog title="Add client or enquiry" onClose={onClose}
      footer={
        matches ? null : (
          <>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" form="add-client" variant="accent" disabled={!valid || capture.isPending || code.state === 'invalid' || code.state === 'checking'}>
              {capture.isPending ? <Loader2 className="animate-spin" /> : <UserPlus />} Save as prospect
            </Button>
          </>
        )
      }
    >
      {matches ? (
        <div className="space-y-3">
          <p className="text-sm text-navy-800">
            <strong>{f.first_names} {f.surname}</strong> may already be in your brokerage. Link this enquiry to the existing record (their assignment and original referrer stay as they are), or confirm this is a new person.
          </p>
          <ul className="space-y-2">
            {matches.map((m) => (
              <li key={String(m.id)} className="flex items-center justify-between gap-3 rounded-lg border border-navy-800/10 p-3">
                <span className="min-w-0 text-sm">
                  <span className="block font-medium text-navy-900">{String(m.name)} <span className="font-mono text-xs text-navy-500">{String(m.number)}</span></span>
                  <span className="block text-xs text-navy-500">{String(m.detail ?? '')}</span>
                </span>
                <Button size="sm" disabled={capture.isPending} onClick={() => submit({ link_person_id: String(m.id) })}>Link to this record</Button>
              </li>
            ))}
          </ul>
          <div className="flex justify-between gap-2 pt-1">
            <Button variant="ghost" onClick={() => setMatches(null)}>Back</Button>
            <Button variant="outline" disabled={capture.isPending} onClick={() => submit({ force_new: true })}>This is a new person</Button>
          </div>
          <ErrorText error={capture.error} />
        </div>
      ) : (
        <form id="add-client" onSubmit={onSubmit} className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-navy-600">
            Saved as a <strong>Prospect</strong> in <CategoryBadge category={category} />. The same record becomes a Client when their first sale is recorded.
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="First names" htmlFor="ac-first"><input id="ac-first" className={inputClass} value={f.first_names} onChange={set('first_names')} autoFocus /></Field>
            <Field label="Surname" htmlFor="ac-surname"><input id="ac-surname" className={inputClass} value={f.surname} onChange={set('surname')} /></Field>
            <Field label="Mobile" htmlFor="ac-phone"><input id="ac-phone" className={inputClass} value={f.phone} onChange={set('phone')} inputMode="tel" placeholder="082 555 0101" /></Field>
            <Field label="Email" htmlFor="ac-email"><input id="ac-email" type="email" className={inputClass} value={f.email} onChange={set('email')} /></Field>
          </div>
          <Field label="Interested in" htmlFor="ac-interest">
            <select id="ac-interest" className={inputClass} value={f.interest} onChange={set('interest')}>
              {PRODUCTS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </Field>
          <Field label="Referral code (optional)" htmlFor="ac-code"
            hint={code.state === 'valid' ? <span className="font-semibold text-emerald-700">{code.text}</span> : code.state === 'invalid' ? <span className="font-semibold text-red-700">{code.text} Correct it or clear it.</span> : 'For a phone enquiry where the customer quotes a code. Leave blank to load it against yourself.'}>
            <div className="flex gap-2">
              <input id="ac-code" className={`${inputClass} font-mono uppercase`} value={f.referral_code} onChange={(e) => { set('referral_code')(e); setCode({ state: 'idle' }) }} onBlur={() => void checkCode()} placeholder="LERATO-QSA4" />
              <Button type="button" variant="outline" onClick={() => void checkCode()} disabled={!f.referral_code.trim() || code.state === 'checking'}>
                {code.state === 'checking' ? <Loader2 className="animate-spin" /> : <Search />} Check
              </Button>
            </div>
          </Field>
          {canAssign && (
            <Field label="Assign to" htmlFor="ac-assign" hint="Defaults to the referring person, or to you.">
              <select id="ac-assign" className={inputClass} value={f.assign_member_id} onChange={set('assign_member_id')}>
                <option value="">{f.referral_code ? 'The referring person' : `Me${me ? ` (${me.name})` : ''}`}</option>
                {team.filter((m) => m.member_id !== me?.member_id).map((m) => <option key={m.member_id} value={m.member_id}>{m.name} · {m.role_label}</option>)}
              </select>
            </Field>
          )}
          <Field label="Note (optional)" htmlFor="ac-note"><textarea id="ac-note" rows={2} className={inputClass} value={f.note} onChange={set('note')} placeholder="What they asked for" /></Field>
          <ErrorText error={capture.error} />
        </form>
      )}
    </Dialog>
  )
}

// ------------------------------------------------------------------ Share my referral link

export function ShareReferralDialog({ member: profileMember, onClose, live }: { member: MemberRef; onClose: () => void; live: boolean }) {
  const category = useDataCategory()
  const member = { ...profileMember, referral_path: referralPathFor(profileMember.referral_code, category) }
  const url = referralUrl(member.referral_path)
  const text = shareText(member)
  return (
    <Dialog title="Share my referral link" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-navy-700">
          Customers who open this link see that <strong>{member.name}</strong> referred them and can send an enquiry. Only a submitted enquiry creates a prospect in your grid; opening or forwarding the link does nothing.
        </p>
        <div className="rounded-xl border border-navy-800/10 bg-navy-50/60 p-3">
          <p className="text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Referral code</p>
          <p className="font-mono text-lg font-semibold text-navy-900">{member.referral_code}</p>
          <p className="mt-2 text-[11px] font-semibold tracking-wide text-navy-500 uppercase">Link</p>
          <p className="font-mono text-xs break-all text-navy-800">{url}</p>
          <div className="mt-2 flex items-center gap-2"><CategoryBadge category={category} />
            {category === 'sample' && <span className="text-[11px] text-navy-600">This link creates Sample enquiries for demonstrations.{live ? '' : ' Live enquiries open once your brokerage is activated.'}</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <CopyButton text={url} label="Copy link" variant="default" />
          <Button variant="outline" asChild>
            <a href={whatsappUrl(text)} target="_blank" rel="noreferrer"><MessageCircle /> Open WhatsApp</a>
          </Button>
          <CopyButton text={text} label="Copy message" />
        </div>
        <p className="rounded-lg bg-white p-3 text-xs whitespace-pre-line text-navy-700 ring-1 ring-navy-800/10">{text}</p>
      </div>
    </Dialog>
  )
}

// ------------------------------------------------------------------ Create offer

/** Pick a client first when the offer is started from the top of the workspace. */
function ClientPicker({ onPick }: { onPick: (id: string) => void }) {
  const [q, setQ] = useState('')
  const grid = useBookGrid({ scope: 'team', query: q.trim().length >= 2 ? q.trim() : null })
  return (
    <div className="space-y-2">
      <Field label="Client" htmlFor="co-client"><input id="co-client" className={inputClass} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, client number or phone" autoFocus /></Field>
      <ul className="max-h-64 space-y-1 overflow-y-auto">
        {(grid.data?.rows ?? []).slice(0, 12).map((r) => (
          <li key={r.id}>
            <button type="button" onClick={() => onPick(r.id)} className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-navy-800/10 px-3 py-2 text-left text-sm hover:border-brand-500">
              <span className="min-w-0 truncate"><span className="font-medium text-navy-900">{r.name}</span> <span className="font-mono text-xs text-navy-500">{r.client_number}</span></span>
              <CategoryBadge category={r.category} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function CreateOfferDialog({ personId: initial, onClose, onCreated }: { personId: string | null; onClose: () => void; onCreated?: (offerId: string, personId: string) => void }) {
  const [personId, setPersonId] = useState<string | null>(initial)
  const record = useClientRecord(personId)
  const [key] = useState(newKey)
  const [mode, setMode] = useState<'quote' | 'capture'>('quote')
  const [option, setOption] = useState<string | null>(null)
  const [f, setF] = useState({ insurer_name: '', product: 'motor', premium_amount: '', premium_frequency: 'monthly' as Frequency, notes: '' })
  const create = useSalesMutation(salesApi.createOffer)
  const quotes = record.data?.quotes ?? []
  const useQuotes = mode === 'quote' && quotes.length > 0
  const valid = useQuotes ? Boolean(option) : f.insurer_name.trim() && f.product && Number(f.premium_amount) > 0
  const submit = () =>
    personId &&
    create.mutate(
      useQuotes
        ? { person_id: personId, quote_option_id: option!, notes: f.notes, key }
        : { person_id: personId, insurer_name: f.insurer_name.trim(), product: f.product, premium_amount: Number(f.premium_amount), premium_frequency: f.premium_frequency, notes: f.notes, key },
      {
        onSuccess: (r) => {
          if (r.outcome === 'saved') {
            onCreated?.(String(r.id), personId)
            onClose()
          }
        },
      },
    )

  return (
    <Dialog title={record.data ? `Create offer for ${record.data.name} (${record.data.client_number})` : 'Create offer'} onClose={onClose} wide
      footer={personId ? (
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="accent" disabled={!valid || create.isPending} onClick={submit}>
            {create.isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Save offer
          </Button>
        </>
      ) : undefined}
    >
      {!personId ? (
        <ClientPicker onPick={setPersonId} />
      ) : record.isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-navy-500" />
      ) : (
        <div className="space-y-4">
          {quotes.length > 0 && (
            <div role="radiogroup" aria-label="Offer source" className="inline-flex gap-1 rounded-xl bg-navy-100/70 p-1">
              {(['quote', 'capture'] as const).map((m) => (
                <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)}
                  className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold ${mode === m ? 'bg-white text-navy-900 shadow-sm' : 'text-navy-600'}`}>
                  {m === 'quote' ? `Use a saved quote (${quotes.length})` : 'Capture offer details'}
                </button>
              ))}
            </div>
          )}
          {useQuotes ? (
            <ul className="space-y-2" role="radiogroup" aria-label="Saved quotes">
              {quotes.map((q) => (
                <li key={q.option_id}>
                  <label className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm ${option === q.option_id ? 'border-brand-500 bg-brand-50/50' : 'border-navy-800/10'}`}>
                    <input type="radio" name="quote" checked={option === q.option_id} onChange={() => setOption(q.option_id)} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-navy-900">{q.insurer} · {q.product.replace(/_/g, ' ')}</span>
                      <span className="block text-xs text-navy-600">{q.label} · {money(q.monthly_premium)} per month</span>
                    </span>
                    {q.is_sample && <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">Sample quote</span>}
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Insurer" htmlFor="co-insurer"><input id="co-insurer" className={inputClass} value={f.insurer_name} onChange={(e) => setF({ ...f, insurer_name: e.target.value })} placeholder="e.g. Santam" /></Field>
              <Field label="Product" htmlFor="co-product">
                <select id="co-product" className={inputClass} value={f.product} onChange={(e) => setF({ ...f, product: e.target.value })}>
                  {PRODUCTS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </Field>
              <Field label="Premium (R)" htmlFor="co-premium"><input id="co-premium" className={inputClass} inputMode="decimal" value={f.premium_amount} onChange={(e) => setF({ ...f, premium_amount: e.target.value.replace(/[^0-9.]/g, '') })} placeholder="865.50" /></Field>
              <Field label="Payment frequency" htmlFor="co-frequency">
                <select id="co-frequency" className={inputClass} value={f.premium_frequency} onChange={(e) => setF({ ...f, premium_frequency: e.target.value as Frequency })}>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="annually">Annually</option>
                  <option value="single">Once-off</option>
                </select>
              </Field>
            </div>
          )}
          <Field label="Notes (optional)" htmlFor="co-notes"><textarea id="co-notes" rows={2} className={inputClass} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
          <p className="text-xs text-navy-600">Saved as a draft against the client and their responsible team member. You share it next and mark it <strong>Offer sent</strong> once it has gone out.</p>
          <ErrorText error={create.error} />
        </div>
      )}
    </Dialog>
  )
}
