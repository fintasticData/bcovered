import { useState } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { newKey, salesApi, useClientRecord, useSalesMutation, type Frequency } from '@/copilot/salesApi'
import { Field, ErrorText, inputClass, money } from '../book/bits'

const PRODUCTS = [
  { id: 'motor', label: 'Private motor' },
  { id: 'contents', label: 'Home contents' },
  { id: 'buildings', label: 'Buildings' },
  { id: 'portable', label: 'Portable electronics' },
  { id: 'commercial', label: 'Commercial' },
]

/** Broker types insurer / premium without an insurer API — the Manual quote path. */
export function ManualQuoteForm({ personId, onDone }: { personId: string | null; onDone?: () => void }) {
  const record = useClientRecord(personId)
  const [key] = useState(newKey)
  const [f, setF] = useState({
    insurer_name: '',
    product: 'motor',
    premium_amount: '',
    premium_frequency: 'monthly' as Frequency,
    notes: '',
  })
  const create = useSalesMutation(salesApi.createOffer)
  const valid = Boolean(personId && f.insurer_name.trim() && f.product && Number(f.premium_amount) > 0)

  if (!personId) {
    return (
      <div className="panel space-y-3 p-4 text-sm text-navy-700">
        <p className="font-semibold text-navy-900">Manual quote needs a customer</p>
        <p className="text-xs text-navy-600">Open a client from the queue first, then use Quotes &amp; decisions → Create offer, or return here with a client selected.</p>
        {onDone && (
          <Button size="sm" variant="outline" onClick={onDone}>
            Back to workbench
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="panel space-y-4 p-4">
      <div>
        <h3 className="text-sm font-semibold text-navy-900">Manual offer capture</h3>
        <p className="mt-0.5 text-xs text-navy-600">
          For {record.data ? `${record.data.name} (${record.data.client_number})` : 'this client'}. You enter what the insurer quoted outside B-Covered.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Insurer" htmlFor="mq-insurer">
          <input id="mq-insurer" className={inputClass} value={f.insurer_name} onChange={(e) => setF({ ...f, insurer_name: e.target.value })} placeholder="e.g. Santam" />
        </Field>
        <Field label="Product" htmlFor="mq-product">
          <select id="mq-product" className={inputClass} value={f.product} onChange={(e) => setF({ ...f, product: e.target.value })}>
            {PRODUCTS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Premium (R)" htmlFor="mq-premium">
          <input
            id="mq-premium"
            className={inputClass}
            inputMode="decimal"
            value={f.premium_amount}
            onChange={(e) => setF({ ...f, premium_amount: e.target.value.replace(/[^0-9.]/g, '') })}
            placeholder="865.50"
          />
        </Field>
        <Field label="Payment frequency" htmlFor="mq-frequency">
          <select
            id="mq-frequency"
            className={inputClass}
            value={f.premium_frequency}
            onChange={(e) => setF({ ...f, premium_frequency: e.target.value as Frequency })}
          >
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="annually">Annually</option>
            <option value="single">Once-off</option>
          </select>
        </Field>
      </div>
      <Field label="Notes (optional)" htmlFor="mq-notes">
        <textarea id="mq-notes" rows={2} className={inputClass} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Source: email from insurer / portal screenshot…" />
      </Field>
      {Number(f.premium_amount) > 0 && (
        <p className="text-xs text-navy-600">
          Preview: {money(Number(f.premium_amount))} {f.premium_frequency === 'monthly' ? '/ month' : f.premium_frequency}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="accent"
          disabled={!valid || create.isPending}
          onClick={() =>
            create.mutate(
              {
                person_id: personId,
                insurer_name: f.insurer_name.trim(),
                product: f.product,
                premium_amount: Number(f.premium_amount),
                premium_frequency: f.premium_frequency,
                notes: f.notes ? `Manual quote · ${f.notes}` : 'Manual quote capture',
                key,
              },
              {
                onSuccess: (r) => {
                  if (r.outcome === 'saved') onDone?.()
                },
              },
            )
          }
        >
          {create.isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Save as draft offer
        </Button>
        {onDone && (
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        )}
      </div>
      <ErrorText error={create.error} />
      <p className="text-[11px] text-navy-500">Draft offers are not cover. Mark Offer sent, then Accepted, then record the sale when the insurer confirms.</p>
    </div>
  )
}
