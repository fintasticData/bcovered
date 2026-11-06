import { Check } from 'lucide-react'

export default function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex items-center gap-2" aria-label="Progress">
      {steps.map((s, i) => {
        const done = i < current
        const active = i === current
        return (
          <li key={s} className="flex flex-1 items-center gap-2" aria-current={active ? 'step' : undefined}>
            <span
              className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold transition ${
                done ? 'bg-brand-500 text-white' : active ? 'bg-gold-400 text-brand-900' : 'bg-brand-800/10 text-ink/50'
              }`}
            >
              {done ? <Check className="h-4 w-4" /> : i + 1}
            </span>
            <span className={`hidden text-sm font-medium sm:block ${active ? 'text-brand-900' : 'text-ink/50'}`}>{s}</span>
            {i < steps.length - 1 && <span className={`h-px flex-1 ${done ? 'bg-brand-500' : 'bg-brand-800/15'}`} />}
          </li>
        )
      })}
    </ol>
  )
}
