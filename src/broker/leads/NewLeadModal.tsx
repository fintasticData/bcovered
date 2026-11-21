import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCaptureLead } from '@/api/hooks'
import { Button } from '@/components/ui/button'

const COVER_OPTIONS = [
  { value: '', label: 'Not sure yet' },
  { value: 'motor', label: 'Motor' },
  { value: 'household_contents', label: 'Home contents' },
  { value: 'home', label: 'Buildings' },
  { value: 'business_property', label: 'Commercial property' },
  { value: 'Commercial property', label: 'Commercial property (Russ)' },
]

export function NewLeadModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const capture = useCaptureLead()
  const navigate = useNavigate()
  const [kind, setKind] = useState<'person' | 'business'>('person')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [website, setWebsite] = useState('')
  const [region, setRegion] = useState('')
  const [notes, setNotes] = useState('')
  const [cover, setCover] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const reset = () => {
    setKind('person')
    setFullName('')
    setPhone('')
    setEmail('')
    setWebsite('')
    setRegion('')
    setNotes('')
    setCover('')
    setError(null)
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!fullName.trim()) {
      setError('Add a name.')
      return
    }
    const hasContact = Boolean(phone.trim() || email.trim() || (kind === 'business' && website.trim()))
    if (!hasContact) {
      setError(kind === 'business' ? 'Add a phone, email or website.' : 'Add a phone or email.')
      return
    }
    setError(null)
    const noteParts = [notes.trim(), website.trim() ? `Website: ${website.trim()}` : ''].filter(Boolean)
    capture.mutate(
      {
        kind,
        full_name: fullName.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        region: region.trim() || undefined,
        notes: noteParts.join('\n') || undefined,
        product_category: cover || undefined,
      },
      {
        onSuccess: (r) => {
          reset()
          onClose()
          navigate(`/broker/leads/${r.lead.id}`)
        },
        onError: (err) => setError((err as Error).message),
      },
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy-950/40 p-4 sm:items-center" role="dialog" aria-modal aria-labelledby="new-lead-title">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close" onClick={onClose} />
      <form onSubmit={submit} className="relative z-10 w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-xl ring-1 ring-navy-800/10">
        <div>
          <h2 id="new-lead-title" className="text-base font-semibold text-navy-900">
            New lead
          </h2>
          <p className="mt-0.5 text-xs text-navy-600">
            {kind === 'person' ? 'Person: name plus phone or email. Cover is optional.' : 'Business: name plus phone, email or website. Cover is optional.'}
          </p>
        </div>

        <div className="flex gap-2" role="group" aria-label="Lead type">
          {(['person', 'business'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              aria-pressed={kind === k}
              className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-semibold capitalize ${kind === k ? 'bg-navy-800 text-white' : 'bg-mist text-navy-700 ring-1 ring-navy-800/10'}`}
            >
              {k}
            </button>
          ))}
        </div>

        <label className="block text-xs font-medium text-navy-700">
          Name
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="field mt-1" required autoFocus placeholder={kind === 'person' ? 'Lerato Mokoena' : 'Black Wolf Auto'} />
        </label>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium text-navy-700">
            Phone
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className="field mt-1" placeholder="082…" inputMode="tel" />
          </label>
          <label className="block text-xs font-medium text-navy-700">
            Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} className="field mt-1" type="email" placeholder="optional" />
          </label>
        </div>

        {kind === 'business' && (
          <label className="block text-xs font-medium text-navy-700">
            Website
            <input value={website} onChange={(e) => setWebsite(e.target.value)} className="field mt-1" placeholder="https://…" />
          </label>
        )}

        <label className="block text-xs font-medium text-navy-700">
          Area
          <input value={region} onChange={(e) => setRegion(e.target.value)} className="field mt-1" placeholder="optional" />
        </label>

        <label className="block text-xs font-medium text-navy-700">
          Cover
          <select value={cover} onChange={(e) => setCover(e.target.value)} className="field mt-1">
            {COVER_OPTIONS.map((o) => (
              <option key={o.value + o.label} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs font-medium text-navy-700">
          Notes
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="field mt-1 min-h-[4rem]" placeholder="Referral, walk-in, what they asked…" />
        </label>

        {error && <p className="text-xs text-red-700">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="accent" size="sm" disabled={capture.isPending || !fullName.trim()}>
            {capture.isPending ? 'Saving…' : 'Save lead'}
          </Button>
        </div>
      </form>
    </div>
  )
}
