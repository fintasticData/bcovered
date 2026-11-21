import type { ReactNode } from 'react'
import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { RUSS_AVATAR_URL, RUSS_NAME, RUSS_TITLE } from './russIdentity'

/** Compact copilot observation beside a decision. Defaults to Russ identity. */
export function CopilotNudge({
  name = RUSS_NAME,
  title = RUSS_TITLE,
  children,
  action,
  className,
  avatarUrl = RUSS_AVATAR_URL,
}: {
  name?: string
  title?: string
  children: ReactNode
  action?: ReactNode
  className?: string
  avatarUrl?: string | null
}) {
  return (
    <aside
      className={cn(
        'flex gap-3 rounded-2xl border border-brand-200/80 bg-gradient-to-br from-brand-50 to-white px-3.5 py-3 shadow-sm',
        className,
      )}
      aria-label={`${name} suggestion`}
    >
      <div className="shrink-0">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover ring-2 ring-brand-100" />
        ) : (
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand-700 text-white">
            <Sparkles className="h-4 w-4" aria-hidden />
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold tracking-wide text-brand-700 uppercase">
          {name}
          {title ? <span className="font-medium text-navy-500"> · {title}</span> : null}
        </p>
        <div className="mt-1 text-sm text-navy-800">{children}</div>
        {action ? <div className="mt-2.5 flex flex-wrap gap-2">{action}</div> : null}
      </div>
    </aside>
  )
}
