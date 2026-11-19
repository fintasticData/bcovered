import { useRef, useState } from 'react'
import { FileUp, ImageIcon, Loader2, Trash2, Video } from 'lucide-react'
import { uploadMedia, type MediaKind } from '@/lib/supabase/media'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** Upload to Supabase Storage, then push the returned URL into a form field. */
export function MediaField({
  label,
  hint,
  tenantId,
  purpose,
  kind,
  value,
  previewUrl,
  disabled,
  accept,
  ownerTable = 'organisations',
  ownerId,
  onChange,
  onUploaded,
}: {
  label: string
  hint?: string
  tenantId: string
  purpose: string
  kind?: MediaKind
  value: string | null
  previewUrl?: string | null
  disabled?: boolean
  accept: string
  ownerTable?: string
  ownerId?: string
  onChange: (url: string | null) => void
  onUploaded?: (url: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const display = previewUrl || (value && /^https?:\/\//i.test(value) ? value : null)
  const iconKind = kind ?? 'document'

  const pick = async (file: File | null) => {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const uploaded = await uploadMedia({
        tenantId,
        file,
        purpose,
        kind,
        ownerTable,
        ownerId: ownerId ?? tenantId,
      })
      onChange(uploaded.url)
      onUploaded?.(uploaded.url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="rounded-xl border border-navy-800/10 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-navy-800">{label}</p>
          {hint && <p className="mt-0.5 text-[11px] text-navy-500">{hint}</p>}
        </div>
        {iconKind === 'image' ? <ImageIcon className="h-4 w-4 text-navy-400" /> : iconKind === 'video' ? <Video className="h-4 w-4 text-navy-400" /> : <FileUp className="h-4 w-4 text-navy-400" />}
      </div>

      {(iconKind === 'image' || (!kind && display)) && display && (
        <img src={display} alt="" className="mt-3 h-20 w-20 rounded-lg object-cover ring-1 ring-navy-800/10" />
      )}
      {iconKind !== 'image' && value && (
        <p className="mt-2 truncate text-[11px] text-navy-600" title={value}>
          Saved: {value}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          accept={accept}
          disabled={disabled || busy}
          onChange={(e) => void pick(e.target.files?.[0] ?? null)}
        />
        <Button type="button" size="sm" variant="outline" disabled={disabled || busy} onClick={() => inputRef.current?.click()}>
          {busy ? <Loader2 className="animate-spin" /> : <FileUp />}
          {value ? 'Replace' : 'Upload'}
        </Button>
        {value && (
          <Button type="button" size="sm" variant="ghost" disabled={disabled || busy} onClick={() => onChange(null)}>
            <Trash2 /> Clear
          </Button>
        )}
      </div>
      {error && <p className={cn('mt-2 text-xs text-red-600')}>{error}</p>}
    </div>
  )
}
