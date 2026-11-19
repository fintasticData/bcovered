import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SAMPLE_MOTOR_REQUEST } from '@/data/qe/sampleMotorRequest'
import { generateAiSampleQuote, generateFixedSampleQuote } from '@/lib/quotes/generateSampleQuote'
import { quoteSourceBadge, type QuoteSource } from '@/lib/quotes/sources'
import { buildMotorRequest, formFromRequest, validateMotorForm } from '@/lib/qe/sampleQuotes'
import type { MotorFormErrors, MotorQuoteForm, QeMotorRequest, QeResult } from '@/lib/qe/types'
import { cn } from '@/lib/utils'
import { MotorRequestForm } from './MotorRequestForm'
import { QeOfferDialog } from './QeOfferDialog'
import { QeQuoteComparison, SubmittedRequestSummary } from './QeQuoteComparison'
import { QuoteSourcePicker } from './QuoteSourcePicker'
import { DemoSampleBadge } from './shared'
import { ManualQuoteForm } from './ManualQuoteForm'

type Step = 'source' | 'request' | 'results' | 'manual'

interface Submission {
  request: QeMotorRequest
  result: QeResult
  source: QuoteSource
  model?: string
  cost_usd?: number
  fallback_reason?: string
}

/** Structured quote path: SAMPLE (fixed or fal AI), Manual capture, Live shown disabled. */
export function QuoteFlowPanel({
  personId,
  onBack,
  compact = false,
}: {
  personId?: string | null
  onBack?: () => void
  compact?: boolean
}) {
  const [source, setSource] = useState<QuoteSource>('sample_ai')
  const [step, setStep] = useState<Step>('source')
  const [draft, setDraft] = useState<MotorQuoteForm>(() => formFromRequest(SAMPLE_MOTOR_REQUEST))
  const [errors, setErrors] = useState<MotorFormErrors>({})
  const [submission, setSubmission] = useState<Submission | null>(null)
  const [busy, setBusy] = useState(false)
  const [openQuoteID, setOpenQuoteID] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const change = (field: keyof MotorQuoteForm, value: string) => {
    setDraft((d) => ({ ...d, [field]: value }))
    setErrors((e) => {
      if (!e[field]) return e
      const next = { ...e }
      delete next[field]
      return next
    })
  }

  const continueFromSource = () => {
    setError(null)
    if (source === 'manual') setStep('manual')
    else if (source === 'live') setError('Live insurer quotes are not enabled in this build. Use Sample or Manual.')
    else setStep('request')
  }

  const runSample = useCallback(async () => {
    const found = validateMotorForm(draft)
    setErrors(found)
    if (Object.keys(found)[0]) {
      document.getElementById(`qe-${Object.keys(found)[0]}`)?.focus()
      return
    }
    const request = structuredClone(buildMotorRequest(draft))
    setBusy(true)
    setError(null)
    try {
      const generated =
        source === 'sample_ai' ? await generateAiSampleQuote(request) : generateFixedSampleQuote(request)
      setSubmission({
        request,
        result: generated.result,
        source: generated.source,
        model: generated.model,
        cost_usd: generated.cost_usd,
        fallback_reason: generated.fallback_reason,
      })
      setOpenQuoteID(null)
      setStep('results')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate SAMPLE quotes')
    } finally {
      setBusy(false)
    }
  }, [draft, source])

  const badge = quoteSourceBadge(submission?.source ?? source)
  const openQuote = submission?.result.quotes?.find((q) => q.quoteID === openQuoteID)

  return (
    <div className={cn('space-y-4', !compact && 'mx-auto max-w-7xl')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {onBack && (
            <button type="button" onClick={onBack} className="mb-1 inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-brand-600">
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>
          )}
          <h2 className="text-base font-semibold text-navy-900">Quotes · private motor</h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-navy-600">
            <DemoSampleBadge />
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
                badge.tone === 'sample' && 'bg-amber-50 text-amber-900 ring-1 ring-amber-200',
                badge.tone === 'manual' && 'bg-navy-50 text-navy-800 ring-1 ring-navy-200',
                badge.tone === 'live' && 'bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200',
              )}
            >
              {badge.label}
            </span>
            {personId && <span className="font-mono text-navy-500">client {personId.slice(0, 8)}…</span>}
          </p>
        </div>
        {step !== 'source' && (
          <Button size="sm" variant="outline" onClick={() => { setStep('source'); setSubmission(null) }}>
            Change source
          </Button>
        )}
      </div>

      {error && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

      {step === 'source' && (
        <div className="panel space-y-4 p-4">
          <QuoteSourcePicker value={source} onChange={setSource} />
          <div className="flex flex-wrap gap-2">
            <Button variant="accent" onClick={continueFromSource}>
              Continue
            </Button>
            <Button variant="ghost" asChild>
              <Link to="/broker/routes">Or run as a Route</Link>
            </Button>
          </div>
        </div>
      )}

      {step === 'request' && (
        <div className="space-y-3">
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {source === 'sample_ai' ? (
              <>
                <Sparkles className="mr-1 inline h-3.5 w-3.5" /> Russ will ask fal for a full SAMPLE comparison. Figures are fictional and labelled SAMPLE.
              </>
            ) : (
              <>Fixed SAMPLE premiums do not change when you edit the request — they demonstrate the comparison layout only.</>
            )}
          </p>
          <MotorRequestForm form={draft} errors={errors} starter={SAMPLE_MOTOR_REQUEST} onChange={change} onSubmit={() => void runSample()} />
          {busy && (
            <p className="flex items-center gap-2 text-sm text-navy-600">
              <Loader2 className="h-4 w-4 animate-spin" /> Generating SAMPLE quotes…
            </p>
          )}
        </div>
      )}

      {step === 'results' && submission && (
        <div className="space-y-4">
          {submission.fallback_reason && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{submission.fallback_reason}</p>
          )}
          {submission.source === 'sample_ai' && submission.model && (
            <p className="text-[11px] text-navy-500">
              Generated via {submission.model}
              {typeof submission.cost_usd === 'number' ? ` · ~$${submission.cost_usd.toFixed(4)}` : ''}
            </p>
          )}
          <SubmittedRequestSummary request={submission.request} onEdit={() => setStep('request')} />
          <QeQuoteComparison result={submission.result} request={submission.request} onOpen={setOpenQuoteID} />
          <p className="text-xs text-navy-600">
            Next: create a <strong>manual or sample-linked offer</strong> on the client record (Quotes &amp; decisions → Create offer). Cover is only confirmed after acceptance and sale recording.
          </p>
        </div>
      )}

      {step === 'manual' && (
        <ManualQuoteForm
          personId={personId ?? null}
          onDone={() => onBack?.()}
        />
      )}

      {openQuote && submission && (
        <QeOfferDialog quote={openQuote} request={submission.request} onClose={() => setOpenQuoteID(null)} />
      )}
    </div>
  )
}
