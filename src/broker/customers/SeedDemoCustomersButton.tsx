import { useState } from 'react'
import { FlaskConical, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRefreshSales } from '@/copilot/salesApi'
import { useDataCategory } from '@/lib/supabase/category'
import { DEMO_CUSTOMERS, seedDemoCustomers } from './demoCustomers'

export function SeedDemoCustomersButton({
  onDone,
  size = 'sm',
  variant = 'outline',
}: {
  onDone?: (firstPersonId: string | null) => void
  size?: 'sm' | 'md'
  variant?: 'outline' | 'accent' | 'ghost'
}) {
  const category = useDataCategory()
  const refresh = useRefreshSales()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const result = await seedDemoCustomers()
      refresh()
      const n = result.created.length
      setMessage(
        result.switchedToDemo
          ? `Switched to Demo and created ${n} demo clients.`
          : `Created ${n} demo clients (sample).`,
      )
      onDone?.(result.created[0]?.personId ?? null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-1">
      <Button size={size} variant={variant} disabled={busy} onClick={() => void run()}>
        {busy ? <Loader2 className="animate-spin" /> : <FlaskConical />}
        {busy ? 'Creating demo clients…' : `Create ${DEMO_CUSTOMERS.length} demo clients`}
      </Button>
      {category !== 'sample' && !message && (
        <p className="text-[11px] text-amber-800">Will switch the workspace to Demo so records stay marked as demo clients.</p>
      )}
      {message && <p className="text-[11px] font-semibold text-emerald-800">{message}</p>}
      {error && <p className="text-[11px] font-semibold text-red-700">{error}</p>}
    </div>
  )
}
