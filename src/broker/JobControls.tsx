import { Archive, Ban, Pause, Play, RotateCw } from 'lucide-react'
import type { JobSummary } from '@/api/client'
import { useControlJob } from '@/api/hooks'
import type { JobAction } from '@/server/api'
import { Button } from '@/components/ui/button'

const ACTIONS: Array<{ action: JobAction; label: string; icon: typeof Pause; when: JobSummary['status'][] }> = [
  { action: 'pause', label: 'Pause', icon: Pause, when: ['queued', 'running'] },
  { action: 'resume', label: 'Resume', icon: Play, when: ['paused', 'awaiting_information'] },
  { action: 'retry', label: 'Retry', icon: RotateCw, when: ['failed'] },
  { action: 'cancel', label: 'Cancel', icon: Ban, when: ['queued', 'running', 'paused', 'awaiting_approval', 'awaiting_information', 'draft'] },
  { action: 'archive', label: 'Archive', icon: Archive, when: ['completed', 'failed', 'cancelled'] },
]

export function JobControls({ job, size = 'sm' }: { job: JobSummary; size?: 'sm' | 'md' }) {
  const control = useControlJob()
  const available = ACTIONS.filter((a) => a.when.includes(job.status) && !(a.action === 'archive' && job.archived_at))

  const run = (action: JobAction) => {
    if (action === 'cancel' && !window.confirm('Cancel this job? No further steps, messages or record changes will run.')) return
    control.mutate({ jobId: job.id, action })
  }

  if (!available.length) return null
  return (
    <div className="flex flex-wrap items-center gap-2">
      {available.map(({ action, label, icon: Icon }) => (
        <Button
          key={action}
          size={size}
          variant={action === 'cancel' ? 'ghost' : 'outline'}
          className={action === 'cancel' ? 'text-red-700 hover:bg-red-50' : undefined}
          onClick={() => run(action)}
          disabled={control.isPending}
        >
          <Icon /> {label}
        </Button>
      ))}
      {control.error && <span className="text-xs text-red-600">{control.error.message}</span>}
    </div>
  )
}
