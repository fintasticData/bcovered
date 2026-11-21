import { useEffect, useMemo, useRef, useState } from 'react'
import { ExternalLink, FileText, ImageIcon, Loader2, Trash2, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  newKey,
  policyClaimsApi,
  usePolicyClaimsMutation,
  type ClaimDetail,
  type ClaimEvidenceAttachment,
} from '@/copilot/policyClaimsApi'
import { useSalesProfile } from '@/copilot/salesApi'
import { resolveMediaUrl, uploadMediaMany, type MediaBucket } from '@/lib/supabase/media'
import { cn } from '@/lib/utils'

const ACCEPT = 'image/*,.pdf,.doc,.docx,.txt,.rtf,.xls,.xlsx'
const MAX_BYTES = 25 * 1024 * 1024

type EvidenceRow = ClaimDetail['evidence'][number]

function statusClass(status: string) {
  if (status === 'received') return 'text-emerald-700 bg-emerald-50'
  if (status === 'waived') return 'text-navy-600 bg-navy-50'
  return 'text-amber-800 bg-amber-50'
}

function isImage(att: ClaimEvidenceAttachment) {
  return att.kind === 'image' || (att.mime_type?.startsWith('image/') ?? false) || att.bucket === 'media-images'
}

function useAttachmentUrls(attachments: ClaimEvidenceAttachment[]) {
  const key = useMemo(
    () => attachments.map((a) => `${a.id}:${a.public_url ?? a.storage_path}`).join('|'),
    [attachments],
  )
  const [urls, setUrls] = useState<Record<string, string | null>>({})

  useEffect(() => {
    let cancelled = false
    void Promise.all(
      attachments.map(async (att) => {
        if (att.public_url) return [att.id, att.public_url] as const
        const resolved = await resolveMediaUrl(att.bucket as MediaBucket, att.storage_path)
        return [att.id, resolved] as const
      }),
    ).then((pairs) => {
      if (!cancelled) setUrls(Object.fromEntries(pairs))
    })
    return () => {
      cancelled = true
    }
  }, [key, attachments])

  return urls
}

function EvidenceRequirementCard({
  claimId,
  tenantId,
  row,
  onChanged,
}: {
  claimId: string
  tenantId: string
  row: EvidenceRow
  onChanged: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const attach = usePolicyClaimsMutation(policyClaimsApi.attachClaimEvidence)
  const remove = usePolicyClaimsMutation(policyClaimsApi.removeClaimEvidenceAttachment)
  const setStatus = usePolicyClaimsMutation(policyClaimsApi.setClaimEvidenceStatus)
  const attachments = row.attachments ?? []
  const urls = useAttachmentUrls(attachments)
  const images = attachments.filter(isImage)
  const docs = attachments.filter((a) => !isImage(a))

  const uploadFiles = async (fileList: FileList | File[] | null) => {
    const files = Array.from(fileList ?? [])
    if (!files.length) return
    setBusy(true)
    setError(null)
    setProgress(`Uploading 0 / ${files.length}…`)
    try {
      const tooBig = files.filter((f) => f.size > MAX_BYTES)
      if (tooBig.length) {
        throw new Error(`Each file must be under 25 MB (${tooBig.map((f) => f.name).join(', ')})`)
      }
      const { uploaded, errors } = await uploadMediaMany({
        tenantId,
        files,
        purpose: `claim_evidence:${row.label}`,
        ownerTable: 'claim_evidence_requirements',
        ownerId: row.id,
      })
      if (uploaded.length) {
        setProgress(`Linking ${uploaded.length} file(s)…`)
        await attach.mutateAsync({
          requirement_id: row.id,
          media_asset_ids: uploaded.map((u) => u.id),
          key: newKey(),
        })
        onChanged()
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
      setProgress(null)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const onRemove = (attachmentId: string) => {
    remove.mutate(
      { attachment_id: attachmentId, key: newKey() },
      { onSuccess: () => onChanged() },
    )
  }

  const waive = () => {
    setStatus.mutate(
      { requirement_id: row.id, status: 'waived', key: newKey() },
      { onSuccess: () => onChanged() },
    )
  }

  return (
    <li className="rounded-xl border border-navy-800/10 bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-navy-900">{row.label}</p>
          <p className="mt-0.5 text-[11px] text-navy-500">
            Multi-select photos, PDFs or reports · stored in media buckets with URLs
          </p>
        </div>
        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', statusClass(row.status))}>
          {row.status}
        </span>
      </div>

      {images.length > 0 && (
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {images.map((att) => {
            const url = urls[att.id]
            return (
              <li key={att.id} className="group relative overflow-hidden rounded-lg border border-navy-800/10 bg-navy-50/40">
                <button
                  type="button"
                  className="block w-full"
                  onClick={() => url && setPreview({ url, name: att.file_name })}
                  disabled={!url}
                >
                  {url ? (
                    <img src={url} alt={att.file_name} className="aspect-square w-full object-cover" />
                  ) : (
                    <div className="flex aspect-square items-center justify-center text-navy-400">
                      <ImageIcon className="h-6 w-6" />
                    </div>
                  )}
                </button>
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-navy-950/70 px-1.5 py-1 text-[10px] text-white opacity-0 transition group-hover:opacity-100">
                  <span className="truncate">{att.file_name}</span>
                  <button type="button" className="shrink-0 rounded p-0.5 hover:bg-white/20" onClick={() => onRemove(att.id)} title="Remove">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {docs.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {docs.map((att) => {
            const url = urls[att.id]
            return (
              <li key={att.id} className="flex items-center justify-between gap-2 rounded-lg border border-navy-800/10 px-2.5 py-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-navy-400" />
                  <span className="truncate font-medium text-navy-900">{att.file_name}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  {url && (
                    <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">
                      Open <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  <button type="button" className="rounded p-1 text-navy-400 hover:bg-navy-50 hover:text-red-600" onClick={() => onRemove(att.id)} title="Remove">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </span>
              </li>
            )
          })}
        </ul>
      )}

      <div
        className={cn(
          'mt-3 rounded-xl border border-dashed px-3 py-4 text-center transition',
          dragOver ? 'border-brand-500 bg-brand-50/60' : 'border-navy-800/15 bg-navy-50/30',
          busy && 'opacity-70',
        )}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          void uploadFiles(e.dataTransfer.files)
        }}
      >
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          accept={ACCEPT}
          multiple
          disabled={busy}
          onChange={(e) => void uploadFiles(e.target.files)}
        />
        <p className="text-xs text-navy-600">
          Drop files here or{' '}
          <button type="button" className="font-semibold text-brand-700 underline" disabled={busy} onClick={() => inputRef.current?.click()}>
            browse
          </button>
          {' '}· images, PDF, Word, Excel
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? <Loader2 className="animate-spin" /> : <Upload />}
            Add files
          </Button>
          {row.status !== 'waived' && (
            <Button type="button" size="sm" variant="ghost" disabled={busy || setStatus.isPending} onClick={waive}>
              Mark waived
            </Button>
          )}
        </div>
        {progress && <p className="mt-2 text-[11px] text-navy-500">{progress}</p>}
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        {(remove.error || attach.error || setStatus.error) && (
          <p className="mt-2 text-xs text-red-600">
            {(remove.error as Error | null)?.message
              ?? (attach.error as Error | null)?.message
              ?? (setStatus.error as Error | null)?.message}
          </p>
        )}
      </div>

      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/80 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setPreview(null)}
        >
          <div className="relative max-h-[90vh] max-w-4xl" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="absolute -right-2 -top-2 rounded-full bg-white p-1.5 shadow"
              onClick={() => setPreview(null)}
              aria-label="Close preview"
            >
              <X className="h-4 w-4" />
            </button>
            <img src={preview.url} alt={preview.name} className="max-h-[85vh] rounded-lg object-contain" />
            <p className="mt-2 text-center text-xs text-white">{preview.name}</p>
          </div>
        </div>
      )}

      <span className="sr-only">Claim {claimId}</span>
    </li>
  )
}

export function ClaimEvidencePanel({
  claimId,
  evidence,
  onChanged,
}: {
  claimId: string
  evidence: ClaimDetail['evidence']
  onChanged: () => void
}) {
  const profile = useSalesProfile()
  const tenantId = profile.data?.brokerage?.id ?? null

  if (!evidence?.length) {
    return <p className="text-xs text-navy-500">No evidence requirements on this claim yet.</p>
  }

  if (!tenantId) {
    return <p className="text-xs text-amber-800">Sign in to a brokerage workspace to upload evidence.</p>
  }

  return (
    <ul className="space-y-3">
      {evidence.map((row) => (
        <EvidenceRequirementCard
          key={row.id}
          claimId={claimId}
          tenantId={tenantId}
          row={row}
          onChanged={onChanged}
        />
      ))}
    </ul>
  )
}
