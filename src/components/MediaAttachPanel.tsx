import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileUp, ImageIcon, Loader2, Paperclip } from 'lucide-react'
import {
  listMediaAssets,
  resolveMediaUrl,
  uploadMediaMany,
  type MediaAssetRow,
  type MediaBucket,
  type MediaUploadResult,
} from '@/lib/supabase/media'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export const MEDIA_ACCEPT_DEFAULT = 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document'

const MAX_BYTES = 25 * 1024 * 1024

/** Multi-file upload (images, PDFs, docs) to the BCovered media bucket, bound to an owner. */
export function MediaAttachPanel({
  tenantId,
  purpose,
  ownerTable,
  ownerId,
  label = 'Documents & photos',
  hint = 'Upload one or more images, PDFs or documents. Stored in the BCovered media bucket.',
  accept = MEDIA_ACCEPT_DEFAULT,
  compact = false,
  className,
  onUploaded,
}: {
  tenantId: string | null | undefined
  purpose: string
  ownerTable?: string | null
  ownerId?: string | null
  label?: string
  hint?: string
  accept?: string
  compact?: boolean
  className?: string
  onUploaded?: (files: MediaUploadResult[]) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [localFiles, setLocalFiles] = useState<MediaUploadResult[]>([])
  const [links, setLinks] = useState<Record<string, string | null>>({})

  const listKey = ['media-assets', tenantId, ownerTable, ownerId, purpose]
  const docs = useQuery({
    queryKey: listKey,
    queryFn: () =>
      listMediaAssets({
        tenantId: tenantId!,
        ownerTable: ownerTable ?? undefined,
        ownerId: ownerId ?? undefined,
      }),
    enabled: Boolean(tenantId && ownerId),
  })

  const rows: Array<MediaAssetRow | MediaUploadResult> = [
    ...(docs.data ?? []).filter((r) => !purpose || r.purpose === purpose || r.purpose.startsWith(`${purpose}:`)),
    ...localFiles.filter((f) => !(docs.data ?? []).some((d) => d.id === f.id)),
  ]

  useEffect(() => {
    let cancelled = false
    void Promise.all(
      rows.map(async (row) => {
        const id = row.id
        const direct =
          'url' in row && typeof row.url === 'string' && row.url
            ? row.url
            : 'signed_url' in row && typeof row.signed_url === 'string'
              ? row.signed_url
              : 'public_url' in row
                ? row.public_url
                : null
        const resolved =
          direct ||
          (row.bucket && row.storage_path
            ? await resolveMediaUrl(row.bucket as MediaBucket, row.storage_path)
            : null)
        return [id, resolved ?? null] as const
      }),
    ).then((pairs) => {
      if (cancelled) return
      setLinks(Object.fromEntries(pairs))
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh when listed assets change
  }, [docs.data, localFiles])

  const pick = async (fileList: FileList | null) => {
    const files = Array.from(fileList ?? [])
    if (!files.length || !tenantId) return
    setBusy(true)
    setError(null)
    try {
      const tooBig = files.filter((f) => f.size > MAX_BYTES)
      if (tooBig.length) {
        throw new Error(`Each file must be under 25 MB (${tooBig.map((f) => f.name).join(', ')})`)
      }
      const { uploaded, errors } = await uploadMediaMany({
        tenantId,
        files,
        purpose,
        ownerTable: ownerTable ?? undefined,
        ownerId: ownerId ?? undefined,
      })
      if (uploaded.length) {
        setLocalFiles((prev) => [...uploaded, ...prev])
        onUploaded?.(uploaded)
        void qc.invalidateQueries({ queryKey: ['media-assets', tenantId] })
      }
      if (errors.length) {
        setError(errors.map((e) => `${e.file}: ${e.message}`).join(' · '))
      } else if (!uploaded.length) {
        setError('No files were uploaded')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  if (!tenantId) {
    return (
      <p className={cn('rounded-xl border border-dashed border-navy-800/20 px-3 py-2 text-xs text-navy-500', className)}>
        Media upload needs your brokerage link. Refresh if this stays empty.
      </p>
    )
  }

  return (
    <div className={cn('rounded-xl border border-navy-800/10 bg-white p-3', className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-navy-800">{label}</p>
          {!compact && hint && <p className="mt-0.5 text-[11px] text-navy-500">{hint}</p>}
        </div>
        <Paperclip className="h-4 w-4 shrink-0 text-navy-400" aria-hidden />
      </div>

      {rows.length > 0 && (
        <ul className="mt-3 space-y-2">
          {rows.map((row) => {
            const name = 'file_name' in row ? row.file_name : 'file'
            const kind = 'kind' in row ? row.kind : 'document'
            const href = links[row.id]
            const isImage = kind === 'image'
            return (
              <li
                key={row.id}
                className="flex items-center gap-2 rounded-lg border border-navy-800/10 bg-mist/40 px-2 py-1.5 text-xs"
              >
                {isImage && href ? (
                  <img src={href} alt="" className="h-9 w-9 rounded object-cover ring-1 ring-navy-800/10" />
                ) : (
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded bg-white text-navy-400 ring-1 ring-navy-800/10">
                    {isImage ? <ImageIcon className="h-4 w-4" /> : <FileUp className="h-4 w-4" />}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  {href ? (
                    <a href={href} target="_blank" rel="noreferrer" className="truncate font-medium text-brand-700 hover:underline">
                      {name}
                    </a>
                  ) : (
                    <p className="truncate font-medium text-navy-800">{name}</p>
                  )}
                  <p className="text-[10px] uppercase tracking-wide text-navy-500">{kind}</p>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          accept={accept}
          multiple
          disabled={busy || !ownerId}
          onChange={(e) => void pick(e.target.files)}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy || !ownerId}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? <Loader2 className="animate-spin" /> : <FileUp />}
          {rows.length ? 'Add more files' : 'Upload files'}
        </Button>
        {!ownerId && (
          <span className="text-[11px] text-navy-500">Focus a record to attach files.</span>
        )}
      </div>
      {error && (
        <p className="mt-2 text-xs text-red-600" role="alert">
          {error}
          <button
            type="button"
            className="ml-2 cursor-pointer font-semibold underline"
            onClick={() => setError(null)}
          >
            Dismiss
          </button>
        </p>
      )}
    </div>
  )
}
