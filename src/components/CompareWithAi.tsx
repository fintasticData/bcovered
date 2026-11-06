import { useState, type FormEvent } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { useAskQuote } from '@/api/hooks'
import type { QuoteAnswer } from '@/server/domain/quotes'
import { Button } from '@/components/ui/button'

const SUGGESTED = ['Which option has the lowest excess?', 'Which is cheapest per month?', 'Which options include a courtesy vehicle?', 'Compare windscreen cover']

export function CompareWithAi({ quoteId, onHighlight }: { quoteId: string; onHighlight?: (optionLabel: string | null) => void }) {
  const ask = useAskQuote(quoteId)
  const [question, setQuestion] = useState('')
  const [history, setHistory] = useState<Array<{ q: string; a: QuoteAnswer }>>([])

  const run = async (q: string) => {
    if (!q.trim()) return
    const a = await ask.mutateAsync(q)
    setHistory((h) => [{ q, a }, ...h].slice(0, 5))
    setQuestion('')
    onHighlight?.(a.citations.length === 1 ? a.citations[0].option_label : null)
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void run(question)
  }

  return (
    <section className="panel p-4" aria-label="Compare with AI">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-navy-900">
        <Sparkles className="h-4 w-4 text-brand-500" /> Compare with AI
      </h3>
      <p className="mt-1 text-xs text-navy-600">Answers come only from the structured option fields above, with the fields cited.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {SUGGESTED.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => void run(s)}
            className="cursor-pointer rounded-full border border-navy-800/10 px-3 py-1 text-xs text-navy-700 hover:border-brand-500"
          >
            {s}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="mt-3 flex gap-2">
        <label htmlFor={`ask-${quoteId}`} className="sr-only">
          Ask about these options
        </label>
        <input
          id={`ask-${quoteId}`}
          className="field flex-1 py-2"
          placeholder="Ask about premiums, excess or benefits"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <Button type="submit" variant="accent" disabled={ask.isPending || !question.trim()}>
          {ask.isPending ? <Loader2 className="animate-spin" /> : 'Ask'}
        </Button>
      </form>
      {ask.error && <p className="mt-2 text-xs text-red-600">{ask.error.message}</p>}
      <div className="mt-3 space-y-3">
        {history.map(({ q, a }, i) => (
          <div key={`${q}-${i}`} className="rounded-xl bg-mist p-3">
            <p className="text-xs font-semibold text-navy-700">{q}</p>
            <p className="mt-1 text-sm text-navy-900">{a.answer}</p>
            {a.citations.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {a.citations.map((c) => (
                  <li key={`${c.option_label}-${c.field}`} className="rounded-md bg-white px-2 py-0.5 text-[11px] text-navy-600">
                    {c.option_label} · {c.field}: <strong>{c.value}</strong>
                  </li>
                ))}
              </ul>
            )}
            {!a.grounded && <p className="mt-1 text-[11px] font-medium text-amber-700">Not answerable from quote data; a broker can help.</p>}
          </div>
        ))}
      </div>
    </section>
  )
}
