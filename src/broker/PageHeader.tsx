import type { ReactNode } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col justify-between gap-3 md:flex-row md:items-end">
      <div>
        <h1 className="text-2xl font-semibold text-navy-900">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-navy-600">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-16 text-sm text-navy-600" role="status">
      <Loader2 className="h-4 w-4 animate-spin" /> {label}
    </div>
  )
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="panel flex items-start gap-3 border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {message}
    </div>
  )
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="panel border-dashed p-8 text-center">
      <p className="text-sm font-semibold text-navy-800">{title}</p>
      {children && <div className="mt-1 text-xs text-navy-600">{children}</div>}
    </div>
  )
}
