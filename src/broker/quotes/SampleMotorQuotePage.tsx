import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { deepFreeze } from '@/data/qe/freeze'
import { SAMPLE_MOTOR_REQUEST } from '@/data/qe/sampleMotorRequest'
import { buildMotorRequest, formFromRequest, getSampleQuotes, validateMotorForm } from '@/lib/qe/sampleQuotes'
import type { MotorFormErrors, MotorQuoteForm, QeMotorRequest, QeResult } from '@/lib/qe/types'
import { PageHeader } from '../PageHeader'
import { MotorRequestForm } from './MotorRequestForm'
import { QeOfferDialog } from './QeOfferDialog'
import { QeQuoteComparison, SubmittedRequestSummary } from './QeQuoteComparison'
import { DemoSampleBadge } from './shared'

interface Submission {
  request: Readonly<QeMotorRequest>
  result: QeResult
}

/** Browser-only private motor demo: everything lives in component state and resets on refresh. */
export default function SampleMotorQuotePage() {
  const [draft, setDraft] = useState<MotorQuoteForm>(() => formFromRequest(SAMPLE_MOTOR_REQUEST))
  const [errors, setErrors] = useState<MotorFormErrors>({})
  const [submission, setSubmission] = useState<Submission | null>(null)
  const [view, setView] = useState<'request' | 'results'>('request')
  const [openQuoteID, setOpenQuoteID] = useState<number | null>(null)
  const top = useRef<HTMLDivElement>(null)

  useEffect(() => top.current?.scrollIntoView({ block: 'start' }), [view])

  const change = (field: keyof MotorQuoteForm, value: string) => {
    setDraft((d) => ({ ...d, [field]: value }))
    setErrors((e) => {
      if (!e[field]) return e
      const next = { ...e }
      delete next[field]
      return next
    })
  }

  const getQuotes = () => {
    const found = validateMotorForm(draft)
    setErrors(found)
    const firstInvalid = Object.keys(found)[0]
    if (firstInvalid) {
      document.getElementById(`qe-${firstInvalid}`)?.focus()
      return
    }
    const request = deepFreeze(structuredClone(buildMotorRequest(draft)))
    setSubmission({ request, result: getSampleQuotes(request) })
    setOpenQuoteID(null)
    setView('results')
  }

  const closeOffer = useCallback(() => setOpenQuoteID(null), [])
  const openQuote = submission?.result.quotes?.find((q) => q.quoteID === openQuoteID)
  const client = submission && view === 'results' ? submission.request.policyholder : null

  return (
    <div ref={top} className="mx-auto max-w-7xl scroll-mt-4 p-4 sm:p-6">
      <Link to="/broker/leads" className="mb-4 inline-flex items-center gap-1 text-xs font-semibold text-brand-600">
        <ArrowLeft className="h-3.5 w-3.5" /> All leads
      </Link>
      <PageHeader
        title={client ? `${client.name} ${client.surname} · Private motor quotes` : 'Private motor quote'}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <DemoSampleBadge />
            {view === 'request'
              ? 'Sample client with one policyholder and one private vehicle. Edit the details, then get quotes.'
              : 'Comparison of fixed sample results for the request below.'}{' '}
            <Link to="/broker/routes" className="font-semibold text-brand-600 underline">Run as a Route for a Sample client</Link>
          </span>
        }
      />

      {view === 'request' || !submission ? (
        <MotorRequestForm form={draft} errors={errors} starter={SAMPLE_MOTOR_REQUEST} onChange={change} onSubmit={getQuotes} />
      ) : (
        <div className="space-y-4">
          <SubmittedRequestSummary request={submission.request} onEdit={() => setView('request')} />
          <QeQuoteComparison result={submission.result} request={submission.request} onOpen={setOpenQuoteID} />
        </div>
      )}

      {openQuote && submission && view === 'results' && <QeOfferDialog quote={openQuote} request={submission.request} onClose={closeOffer} />}
    </div>
  )
}
