import { useState } from 'react'
import { Check, Copy, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatDateTime } from '@/lib/utils'

function absUrl(pathOrUrl: string) {
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) return pathOrUrl
  return `${window.location.origin}${pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`}`
}

function whatsappShareUrl(text: string) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}

/** Copy + WhatsApp share for invitation and referral links. */
export function ShareInvite({
  url,
  title = 'Share this link',
  hint,
  expiresAt,
  whatsappText,
  onRevoke,
  revokeLabel = 'Revoke',
}: {
  url: string
  title?: string
  hint?: string
  expiresAt?: string | null
  whatsappText?: string
  onRevoke?: () => void
  revokeLabel?: string
}) {
  const full = absUrl(url)
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard?.writeText(full)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      /* ignore */
    }
  }
  const message = whatsappText ?? `You are invited to B-Covered: ${full}`

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900" role="status">
      <p className="font-semibold">{title}</p>
      {hint && <p className="mt-1 text-emerald-800">{hint}</p>}
      <p className="mt-2 break-all font-mono text-[11px] text-emerald-950">{full}</p>
      {expiresAt && <p className="mt-1 text-emerald-800">Expires {formatDateTime(expiresAt)}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" type="button" onClick={() => void copy()}>
          {copied ? <Check /> : <Copy />} {copied ? 'Copied' : 'Copy link'}
        </Button>
        <Button size="sm" variant="outline" type="button" asChild>
          <a href={whatsappShareUrl(message)} target="_blank" rel="noreferrer">
            <MessageCircle /> WhatsApp
          </a>
        </Button>
        {onRevoke && (
          <button type="button" className="cursor-pointer text-xs font-semibold text-red-700 underline" onClick={onRevoke}>
            {revokeLabel}
          </button>
        )}
      </div>
    </div>
  )
}
