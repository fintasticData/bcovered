import { MessageSquare, PanelRightOpen } from 'lucide-react'
import { cn } from '@/lib/utils'

export type Pane = 'chat' | 'work'

/** Below the lg breakpoint the Copilot and its results share the screen one at a time. */
export function MobilePaneSwitch({ pane, onChange, workLabel = 'Results' }: { pane: Pane; onChange: (p: Pane) => void; workLabel?: string }) {
  const item = (p: Pane, label: string, Icon: typeof MessageSquare) => (
    <button
      type="button"
      role="tab"
      aria-selected={pane === p}
      onClick={() => onChange(p)}
      className={cn(
        'flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition',
        pane === p ? 'bg-white text-navy-900 shadow-sm' : 'text-navy-600',
      )}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  )
  return (
    <div className="px-3 pt-3 lg:hidden">
      <div role="tablist" aria-label="Workspace panes" className="flex gap-1 rounded-xl bg-navy-100/70 p-1">
        {item('chat', 'Copilot', MessageSquare)}
        {item('work', workLabel, PanelRightOpen)}
      </div>
    </div>
  )
}
