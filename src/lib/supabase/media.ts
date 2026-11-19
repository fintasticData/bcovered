/** Upload images / videos / docs to Supabase Storage, register media_assets, return URL for forms. */
import { supabase } from './client'

export type MediaBucket = 'media-images' | 'media-videos' | 'media-docs'
export type MediaKind = 'image' | 'video' | 'document'

export interface MediaUploadResult {
  id: string
  bucket: MediaBucket
  kind: MediaKind
  purpose: string
  file_name: string
  storage_path: string
  public_url: string | null
  /** Prefer this in form fields: public URL for images, storage path for private buckets. */
  url: string
  signed_url?: string | null
}

const BUCKET_FOR: Record<MediaKind, MediaBucket> = {
  image: 'media-images',
  video: 'media-videos',
  document: 'media-docs',
}

function safeName(name: string) {
  return name.replace(/[^\w.\- ()]+/g, '_').slice(0, 120) || 'file'
}

function inferKind(file: File, kind?: MediaKind): MediaKind {
  if (kind) return kind
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  return 'document'
}

/** Build tenant-scoped object path: {tenantId}/{yyyy}/{uuid}-{filename} */
export function mediaObjectPath(tenantId: string, fileName: string) {
  const year = new Date().getUTCFullYear()
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}`
  return `${tenantId}/${year}/${id}-${safeName(fileName)}`
}

/** Upload a file, register it, and return a URL suitable for saving on a form / DB column. */
export async function uploadMedia(a: {
  tenantId: string
  file: File
  purpose: string
  kind?: MediaKind
  ownerTable?: string
  ownerId?: string
}): Promise<MediaUploadResult> {
  if (!supabase) throw new Error('Supabase is not configured in this build.')
  const kind = inferKind(a.file, a.kind)
  const bucket = BUCKET_FOR[kind]
  const storagePath = mediaObjectPath(a.tenantId, a.file.name)

  const { error: uploadError } = await supabase.storage.from(bucket).upload(storagePath, a.file, {
    cacheControl: '3600',
    upsert: false,
    contentType: a.file.type || undefined,
  })
  if (uploadError) throw new Error(uploadError.message)

  let publicUrl: string | null = null
  let signedUrl: string | null = null
  if (bucket === 'media-images') {
    publicUrl = supabase.storage.from(bucket).getPublicUrl(storagePath).data.publicUrl
  } else {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(storagePath, 60 * 60 * 24 * 7)
    if (error) throw new Error(error.message)
    signedUrl = data.signedUrl
  }

  const { data, error } = await supabase.rpc('register_media_asset', {
    p_tenant_id: a.tenantId,
    p_bucket: bucket,
    p_kind: kind,
    p_purpose: a.purpose,
    p_file_name: a.file.name,
    p_mime_type: a.file.type || null,
    p_file_size: a.file.size,
    p_storage_path: storagePath,
    p_public_url: publicUrl,
    p_owner_table: a.ownerTable ?? null,
    p_owner_id: a.ownerId ?? null,
  })
  if (error) throw new Error(error.message)

  const row = data as {
    id: string
    bucket: MediaBucket
    kind: MediaKind
    purpose: string
    file_name: string
    storage_path: string
    public_url: string | null
    url: string
  }

  return {
    id: row.id,
    bucket: row.bucket,
    kind: row.kind,
    purpose: row.purpose,
    file_name: row.file_name,
    storage_path: row.storage_path,
    public_url: row.public_url,
    url: row.public_url ?? row.storage_path,
    signed_url: signedUrl,
  }
}

/** Resolve a stored path or public URL into something the browser can open. */
export async function resolveMediaUrl(bucket: MediaBucket, pathOrUrl: string | null | undefined): Promise<string | null> {
  if (!pathOrUrl) return null
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl
  if (!supabase) return null
  if (bucket === 'media-images') return supabase.storage.from(bucket).getPublicUrl(pathOrUrl).data.publicUrl
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(pathOrUrl, 60 * 60)
  if (error) return null
  return data.signedUrl
}

export interface MediaAssetRow {
  id: string
  tenant_id: string
  bucket: MediaBucket
  kind: MediaKind
  purpose: string
  file_name: string
  storage_path: string
  public_url: string | null
  owner_table: string | null
  owner_id: string | null
  created_at: string
}

/** List media rows for a tenant, optionally filtered by owner. */
export async function listMediaAssets(a: {
  tenantId: string
  ownerTable?: string
  ownerId?: string
  ownerIds?: string[]
}): Promise<MediaAssetRow[]> {
  if (!supabase) return []
  let q = supabase.from('media_assets').select('id, tenant_id, bucket, kind, purpose, file_name, storage_path, public_url, owner_table, owner_id, created_at').eq('tenant_id', a.tenantId).order('created_at', { ascending: false })
  if (a.ownerTable) q = q.eq('owner_table', a.ownerTable)
  if (a.ownerId) q = q.eq('owner_id', a.ownerId)
  if (a.ownerIds?.length) q = q.in('owner_id', a.ownerIds)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []) as MediaAssetRow[]
}
