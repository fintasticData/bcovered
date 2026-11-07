import { Link } from 'react-router-dom'
import { Loader2, Network } from 'lucide-react'
import { useStartTwinBuild } from '@/api/hooks'
import { Button } from '@/components/ui/button'

/** Starts the risk_twin_build job, or links to the commercial job already running for this client. */
export function BuildTwinButton({
  profileId,
  activeJobId,
  label = 'Build Twin',
  size = 'sm',
  variant = 'accent',
}: {
  profileId: string
  activeJobId: string | null
  label?: string
  size?: 'sm' | 'md'
  variant?: 'accent' | 'outline'
}) {
  const build = useStartTwinBuild()
  if (activeJobId) {
    return (
      <Button size={size} variant="outline" asChild>
        <Link to={`/broker/jobs/${activeJobId}`} title="A job is already working on this client">
          <Loader2 className="animate-spin" /> Building · view job
        </Link>
      </Button>
    )
  }
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button size={size} variant={variant} onClick={() => build.mutate(profileId)} disabled={build.isPending}>
        {build.isPending ? <Loader2 className="animate-spin" /> : <Network />} {label}
      </Button>
      {build.error && (
        <span className="text-[11px] font-medium text-red-600" role="alert">
          {build.error.message}
        </span>
      )}
    </span>
  )
}
