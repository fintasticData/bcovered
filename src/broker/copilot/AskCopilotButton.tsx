import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useDataCategory } from '@/lib/supabase/category'
import { COPILOTS } from './identity'

/** Opens Ava or Russ beside this record: the copilot starts with the record's verified ID and category. */
export function AskCopilotButton({ copilot, kind, id, size = 'sm' }: { copilot: 'ava' | 'russ'; kind: 'client' | 'account' | 'policy'; id: string; size?: 'sm' | 'md' }) {
  const category = useDataCategory()
  const c = COPILOTS[copilot]
  const q = new URLSearchParams({ copilot, ctx: `${kind}:${id}`, cat: category })
  return (
    <Button size={size} variant="outline" asChild>
      <Link to={`/broker/workspace?${q.toString()}`} title={`Ask ${c.name} about this ${kind}`}>
        <c.icon /> Ask {c.name}
      </Link>
    </Button>
  )
}
