-- Media storage: images (public logos/brand), videos and docs (private).
-- Path convention: {tenant_id}/{yyyy}/{uuid}-{safe_filename}
-- Forms store returned URLs (or path + signed URL) on organisations / media_assets.

-- ------------------------------------------------------------------ buckets
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'media-images',
    'media-images',
    true,
    10485760,
    array['image/png','image/jpeg','image/webp','image/gif','image/svg+xml']
  ),
  (
    'media-videos',
    'media-videos',
    false,
    104857600,
    array['video/mp4','video/webm','video/quicktime']
  ),
  (
    'media-docs',
    'media-docs',
    false,
    26214400,
    array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/plain','text/csv','image/png','image/jpeg']
  )
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function app.can_access_media_path(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  folder text := nullif(split_part(object_name, '/', 1), '');
  folder_id uuid;
begin
  if auth.uid() is null then
    return false;
  end if;
  if app.is_platform_staff() then
    return true;
  end if;
  begin
    folder_id := folder::uuid;
  exception when others then
    return false;
  end;
  return app.is_staff() and folder_id is not distinct from app.tenant_id();
end $$;

drop policy if exists media_images_select on storage.objects;
drop policy if exists media_images_insert on storage.objects;
drop policy if exists media_images_update on storage.objects;
drop policy if exists media_images_delete on storage.objects;
drop policy if exists media_videos_select on storage.objects;
drop policy if exists media_videos_insert on storage.objects;
drop policy if exists media_videos_update on storage.objects;
drop policy if exists media_videos_delete on storage.objects;
drop policy if exists media_docs_select on storage.objects;
drop policy if exists media_docs_insert on storage.objects;
drop policy if exists media_docs_update on storage.objects;
drop policy if exists media_docs_delete on storage.objects;
drop policy if exists media_images_public_read on storage.objects;

create policy media_images_select on storage.objects for select to authenticated
  using (bucket_id = 'media-images' and app.can_access_media_path(name));
create policy media_images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'media-images' and app.can_access_media_path(name));
create policy media_images_update on storage.objects for update to authenticated
  using (bucket_id = 'media-images' and app.can_access_media_path(name))
  with check (bucket_id = 'media-images' and app.can_access_media_path(name));
create policy media_images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'media-images' and app.can_access_media_path(name));
create policy media_images_public_read on storage.objects for select to anon
  using (bucket_id = 'media-images');

create policy media_videos_select on storage.objects for select to authenticated
  using (bucket_id = 'media-videos' and app.can_access_media_path(name));
create policy media_videos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'media-videos' and app.can_access_media_path(name));
create policy media_videos_update on storage.objects for update to authenticated
  using (bucket_id = 'media-videos' and app.can_access_media_path(name))
  with check (bucket_id = 'media-videos' and app.can_access_media_path(name));
create policy media_videos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'media-videos' and app.can_access_media_path(name));

create policy media_docs_select on storage.objects for select to authenticated
  using (bucket_id = 'media-docs' and app.can_access_media_path(name));
create policy media_docs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'media-docs' and app.can_access_media_path(name));
create policy media_docs_update on storage.objects for update to authenticated
  using (bucket_id = 'media-docs' and app.can_access_media_path(name))
  with check (bucket_id = 'media-docs' and app.can_access_media_path(name));
create policy media_docs_delete on storage.objects for delete to authenticated
  using (bucket_id = 'media-docs' and app.can_access_media_path(name));

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organisations(id),
  bucket text not null check (bucket in ('media-images','media-videos','media-docs','tenant-documents')),
  kind text not null check (kind in ('image','video','document')),
  purpose text not null default 'general',
  file_name text not null,
  mime_type text,
  file_size bigint,
  storage_path text not null,
  public_url text,
  owner_table text,
  owner_id uuid,
  uploaded_by uuid references public.app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists media_assets_tenant_idx on public.media_assets (tenant_id, kind, created_at desc);
create index if not exists media_assets_owner_idx on public.media_assets (owner_table, owner_id) where owner_id is not null;

alter table public.media_assets enable row level security;

drop policy if exists media_assets_staff_select on public.media_assets;
drop policy if exists media_assets_staff_write on public.media_assets;

create policy media_assets_staff_select on public.media_assets for select to authenticated
  using (
    app.is_platform_staff()
    or (tenant_id = app.tenant_id() and app.is_staff())
  );

create policy media_assets_staff_write on public.media_assets for all to authenticated
  using (
    app.is_platform_staff()
    or (tenant_id = app.tenant_id() and app.is_staff())
  )
  with check (
    app.is_platform_staff()
    or (tenant_id = app.tenant_id() and app.is_staff())
  );

alter table public.organisations
  add column if not exists logo_url text,
  add column if not exists brand_image_url text,
  add column if not exists intro_video_url text,
  add column if not exists profile_doc_url text;

comment on column public.organisations.logo_url is 'Public URL from media-images bucket (brokerage logo).';
comment on column public.organisations.brand_image_url is 'Public URL from media-images bucket (brand / cover image).';
comment on column public.organisations.intro_video_url is 'Storage path or signed-url target in media-videos.';
comment on column public.organisations.profile_doc_url is 'Storage path for a brokerage profile PDF in media-docs.';

create or replace function public.register_media_asset(
  p_tenant_id uuid,
  p_bucket text,
  p_kind text,
  p_purpose text,
  p_file_name text,
  p_mime_type text,
  p_file_size bigint,
  p_storage_path text,
  p_public_url text default null,
  p_owner_table text default null,
  p_owner_id uuid default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  row media_assets;
begin
  if auth.uid() is null then
    raise exception using message = 'forbidden', detail = 'Sign in to upload media.';
  end if;
  if not (app.is_platform_staff() or (app.is_staff() and app.tenant_id() = p_tenant_id)) then
    raise exception using message = 'forbidden', detail = 'Only brokerage or platform staff can register media.';
  end if;

  insert into media_assets (
    tenant_id, bucket, kind, purpose, file_name, mime_type, file_size, storage_path, public_url, owner_table, owner_id, uploaded_by
  ) values (
    p_tenant_id, p_bucket, p_kind, coalesce(nullif(p_purpose, ''), 'general'), p_file_name, p_mime_type, p_file_size,
    p_storage_path, p_public_url, p_owner_table, p_owner_id, auth.uid()
  )
  returning * into row;

  return jsonb_build_object(
    'id', row.id,
    'bucket', row.bucket,
    'kind', row.kind,
    'purpose', row.purpose,
    'file_name', row.file_name,
    'storage_path', row.storage_path,
    'public_url', row.public_url,
    'url', coalesce(row.public_url, row.storage_path),
    'created_at', row.created_at
  );
end $$;

revoke all on function public.register_media_asset(uuid, text, text, text, text, text, bigint, text, text, text, uuid) from public;
grant execute on function public.register_media_asset(uuid, text, text, text, text, text, bigint, text, text, text, uuid) to authenticated;

drop policy if exists organisations_platform_select on public.organisations;
create policy organisations_platform_select on public.organisations
  for select to authenticated
  using (app.is_platform_staff());

-- Platform staff and brokerage owners/admins may update identity/media URL columns.
drop policy if exists organisations_platform_update on public.organisations;
drop policy if exists organisations_member_update on public.organisations;

create policy organisations_platform_update on public.organisations
  for update to authenticated
  using (app.is_platform_staff())
  with check (app.is_platform_staff());

create policy organisations_member_update on public.organisations
  for update to authenticated
  using (
    id = app.tenant_id()
    and app.member_role() in ('brokerage_owner', 'brokerage_admin')
  )
  with check (
    id = app.tenant_id()
    and app.member_role() in ('brokerage_owner', 'brokerage_admin')
  );
