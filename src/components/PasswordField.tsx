import { useId, useState, type InputHTMLAttributes } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label: string
  hint?: string
}

/** Password input with show/hide eye toggle. */
export function PasswordField({ label, hint, id, className, ...rest }: Props) {
  const autoId = useId()
  const inputId = id ?? autoId
  const [visible, setVisible] = useState(false)
  return (
    <div>
      <label htmlFor={inputId} className="field-label">{label}</label>
      <div className="relative">
        <input
          {...rest}
          id={inputId}
          type={visible ? 'text' : 'password'}
          className={cn('field pr-12', className)}
        />
        <button
          type="button"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-ink/50 hover:bg-sand hover:text-ink"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          tabIndex={0}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {hint && <p className="mt-1 text-xs text-ink/60">{hint}</p>}
    </div>
  )
}
