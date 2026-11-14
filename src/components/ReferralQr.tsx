import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const OPTIONS = { errorCorrectionLevel: 'M' as const, margin: 2, color: { dark: '#0b1f3a', light: '#ffffff' } }

function download(href: string, filename: string) {
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/** A QR code for a customer referral link, with PNG (print) and SVG (signage) downloads. */
export function ReferralQr({ url, label, filename, size = 168, className, downloads = true }: {
  url: string
  label?: string
  filename: string
  size?: number
  className?: string
  downloads?: boolean
}) {
  const [png, setPng] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    QRCode.toDataURL(url, { ...OPTIONS, width: 640 })
      .then((d) => live && setPng(d))
      .catch((e: Error) => live && setError(e.message))
    return () => {
      live = false
    }
  }, [url])

  const saveSvg = async () => {
    const svg = await QRCode.toString(url, { ...OPTIONS, type: 'svg' })
    const href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
    download(href, `${filename}.svg`)
    window.setTimeout(() => URL.revokeObjectURL(href), 1000)
  }

  return (
    <figure className={cn('flex flex-col items-center gap-2', className)}>
      <div className="rounded-xl border border-navy-800/10 bg-white p-2" style={{ width: size, height: size }}>
        {png ? <img src={png} alt={`QR code for ${label ?? url}`} width={size - 16} height={size - 16} className="h-full w-full" /> : (
          <div className="grid h-full w-full place-items-center text-[11px] text-navy-500">{error ?? 'Preparing QR code…'}</div>
        )}
      </div>
      {label && <figcaption className="max-w-[16rem] text-center text-[11px] text-navy-600">{label}</figcaption>}
      {downloads && (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={!png} onClick={() => png && download(png, `${filename}.png`)}>
            <Download /> PNG
          </Button>
          <Button size="sm" variant="outline" onClick={() => void saveSvg()}>
            <Download /> SVG
          </Button>
        </div>
      )}
    </figure>
  )
}
