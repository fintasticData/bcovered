-- Customer claim photos: allow bucket register + attach on create claim.
-- Also surface tenant_id on pc_my_cover for client uploads.

begin;

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
security definer
set search_path = public
as $$
declare
  row media_assets;
  cust uuid := app.my_customer_id();
  purpose text := coalesce(p_purpose, '');
begin
  if auth.uid() is null then
    raise exception using message = 'forbidden', detail = 'Sign in to upload media.';
  end if;

  if not (
    app.is_platform_staff()
    or (app.is_staff() and app.tenant_id() = p_tenant_id)
    or (
      cust is not null
      and app.tenant_id() = p_tenant_id
      and (
        purpose like 'concierge%'
        or purpose like 'claim_evidence%'
      )
    )
  ) then
    raise exception using message = 'forbidden', detail = 'Not allowed to register media for this tenant.';
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
end;
$$;

revoke all on function public.register_media_asset(uuid, text, text, text, text, text, bigint, text, text, text, uuid) from public;
grant execute on function public.register_media_asset(uuid, text, text, text, text, text, bigint, text, text, text, uuid) to authenticated;

drop function if exists public.pc_customer_create_claim(timestamptz, boolean, text, text, uuid, uuid[], text, text);
drop function if exists public.pc_customer_create_claim(timestamptz, boolean, text, text, uuid, uuid[], text, text, uuid[]);

create or replace function public.pc_customer_create_claim(
  p_incident_at timestamptz,
  p_incident_time_unknown boolean,
  p_incident_type text,
  p_description text,
  p_policy_id uuid default null,
  p_item_ids uuid[] default '{}',
  p_idempotency_key text default null,
  p_category text default null,
  p_photo_media_asset_ids uuid[] default '{}'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cat text := coalesce(nullif(p_category, ''), nullif(app.active_category(), 'denied'), 'sample');
  cust uuid := app.my_customer_id();
  person uuid;
  c claims%rowtype;
  resolved jsonb;
  vid uuid;
  review bool := false;
  reason text;
  item_id uuid;
  photo_req uuid;
  asset_id uuid;
  attached int := 0;
begin
  if cat = 'denied' or cust is null then raise exception 'forbidden' using errcode = '42501'; end if;

  select cp.person_id into person
    from customer_persons cp
   where cp.customer_id = cust and cp.data_category = cat
   order by cp.is_primary desc nulls last, cp.created_at
   limit 1;
  if person is null then
    select cp.person_id into person from customer_persons cp where cp.customer_id = cust limit 1;
  end if;
  if person is null then raise exception 'forbidden' using errcode = '42501'; end if;

  if p_idempotency_key is not null then
    select claim_id into vid from claim_events where idempotency_key = p_idempotency_key limit 1;
    if vid is not null then
      select * into c from claims where id = vid;
      return jsonb_build_object(
        'outcome', 'saved', 'claim_id', c.id, 'reference', c.reference,
        'summary', 'Replayed claim', 'replayed', true, 'version_review_needed', c.version_review_needed
      );
    end if;
  end if;

  if p_policy_id is not null then
    if not exists (
      select 1 from policy_cover pc
      where pc.policy_id = p_policy_id and pc.person_id = person
        and pc.data_category = cat and pc.tenant_id = app.tenant_id()
    ) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    resolved := public.pc_resolve_policy_version(p_policy_id, p_incident_at, p_incident_time_unknown);
    vid := (resolved->>'version_id')::uuid;
    review := coalesce((resolved->>'review_needed')::boolean, false);
    reason := resolved->>'reason';
  end if;

  insert into claims (
    tenant_id, data_category, person_id, policy_id, policy_version_id, original_policy_version_id,
    version_review_needed, version_review_reason, incident_at, incident_time_unknown, incident_type, description,
    status, owner_member_id, next_action, due_at, created_by
  ) values (
    app.tenant_id(), cat, person, p_policy_id, vid, vid, review, reason, p_incident_at, p_incident_time_unknown,
    p_incident_type, p_description, case when review then 'in_review' else 'reported' end,
    null,
    case when review then 'Link applicable policy version' else 'Review incident and evidence' end,
    now() + interval '3 days', auth.uid()
  ) returning * into c;

  foreach item_id in array coalesce(p_item_ids, array[]::uuid[]) loop
    if not exists (select 1 from insured_items ii where ii.id = item_id and ii.person_id = person) then
      continue;
    end if;
    insert into claim_affected_items (tenant_id, data_category, claim_id, insured_item_id, display_label, item_type, snapshot)
    select app.tenant_id(), cat, c.id, ii.id, ii.display_label, ii.item_type, ii.details
      from insured_items ii where ii.id = item_id;
  end loop;

  insert into claim_evidence_requirements (tenant_id, data_category, claim_id, label, status) values
    (app.tenant_id(), cat, c.id, 'Photos of damage', 'outstanding'),
    (app.tenant_id(), cat, c.id, 'Driver statement', 'outstanding'),
    (app.tenant_id(), cat, c.id, 'Police / case number (if applicable)', 'outstanding');

  select id into photo_req
    from claim_evidence_requirements
   where claim_id = c.id and label = 'Photos of damage'
   limit 1;

  foreach asset_id in array coalesce(p_photo_media_asset_ids, array[]::uuid[]) loop
    if not exists (
      select 1 from media_assets m
       where m.id = asset_id
         and m.tenant_id = app.tenant_id()
         and m.uploaded_by = auth.uid()
    ) then
      continue;
    end if;
    insert into claim_evidence_attachments (
      tenant_id, data_category, claim_id, requirement_id, media_asset_id, created_by
    ) values (
      app.tenant_id(), cat, c.id, photo_req, asset_id, auth.uid()
    )
    on conflict (requirement_id, media_asset_id) do nothing;
    update media_assets
       set owner_table = 'claim_evidence_requirements', owner_id = photo_req
     where id = asset_id;
  end loop;
  select count(*)::int into attached
    from claim_evidence_attachments
   where requirement_id = photo_req;

  if attached > 0 then
    update claim_evidence_requirements
       set status = 'received',
           media_asset_id = (
             select a.media_asset_id from claim_evidence_attachments a
              where a.requirement_id = photo_req order by a.created_at limit 1
           )
     where id = photo_req;
  end if;

  insert into claim_events (tenant_id, data_category, claim_id, event_type, to_status, actor_user_id, note, visibility, idempotency_key)
  values (
    app.tenant_id(), cat, c.id, 'created', c.status, auth.uid(),
    'Incident reported by customer' || case when attached > 0 then ' with '||attached||' photo(s)' else '' end,
    'shared', p_idempotency_key
  );

  return jsonb_build_object(
    'outcome', 'saved',
    'claim_id', c.id,
    'reference', c.reference,
    'summary', 'Claim '||c.reference||' created',
    'version_review_needed', review,
    'photo_requirement_id', photo_req,
    'photos_attached', attached
  );
end;
$$;

revoke all on function public.pc_customer_create_claim(timestamptz, boolean, text, text, uuid, uuid[], text, text, uuid[]) from public, anon;
grant execute on function public.pc_customer_create_claim(timestamptz, boolean, text, text, uuid, uuid[], text, text, uuid[]) to authenticated;

create or replace function public.pc_my_cover(p_category text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cat text := coalesce(nullif(p_category, ''), nullif(app.active_category(), 'denied'), 'sample');
  cust uuid := app.my_customer_id();
begin
  if cat = 'denied' then raise exception 'forbidden' using errcode = '42501'; end if;
  if cust is null then raise exception 'forbidden' using errcode = '42501'; end if;

  return jsonb_build_object(
    'tenant_id', app.tenant_id(),
    'customer_id', cust,
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ii.id,
        'item_type', ii.item_type,
        'status', ii.status,
        'display_label', ii.display_label,
        'details', ii.details,
        'policy_id', coalesce(nullif(ii.details->>'policy_id', '')::uuid, pol.id),
        'photo_url', nullif(ii.details->>'photo_url', ''),
        'section_code', coalesce(
          nullif(ii.details->>'section_code', ''),
          case ii.item_type
            when 'contents' then 'HCAT'
            when 'building' then 'HOB'
            when 'vehicle' then 'MOT'
            when 'equipment' then 'PAV'
            else upper(left(ii.item_type, 4))
          end
        ),
        'policy_number', pol.policy_number,
        'insurer_name', pol.insurer_name
      ) order by ii.display_label)
      from insured_items ii
      left join lateral (
        select pol.id, pol.policy_number, ins.name as insurer_name
          from policy_version_items pvi
          join policy_versions pv
            on pv.id = pvi.policy_version_id
           and pv.superseded_at is null
          join policies pol
            on pol.id = pv.policy_id
           and pol.data_category = pv.data_category
          left join insurers ins on ins.id = pol.provider_id
         where pvi.insured_item_id = ii.id
           and pvi.data_category = ii.data_category
         limit 1
      ) pol on true
      where ii.data_category = cat
        and ii.person_id in (
          select person_id from customer_persons where customer_id = cust
        )
        and ii.status not in ('removed')
    ), '[]'::jsonb),
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'reference', r.reference,
        'status', r.status,
        'request_type', r.request_type,
        'next_action', r.next_action,
        'client_number', p.client_number,
        'customer_name', app.pc_person_name(p.id),
        'person_id', p.id,
        'insurer_name', null,
        'item_label', null,
        'owner_name', null,
        'due_at', r.due_at,
        'policy_id', r.policy_id
      ))
      from policy_service_requests r
      join persons p on p.id = r.person_id
      where r.data_category = cat
        and r.person_id in (select person_id from customer_persons where customer_id = cust)
        and r.status not in ('confirmed', 'declined', 'withdrawn')
    ), '[]'::jsonb),
    'claims', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'reference', c.reference,
        'status', c.status,
        'incident_type', c.incident_type,
        'incident_at', c.incident_at,
        'client_number', p.client_number,
        'customer_name', app.pc_person_name(p.id),
        'person_id', p.id,
        'affected_summary', null,
        'insurer_name', null,
        'insurer_reference', c.insurer_reference,
        'owner_name', null,
        'next_action', c.next_action,
        'due_at', c.due_at
      ))
      from claims c
      join persons p on p.id = c.person_id
      where c.data_category = cat
        and c.person_id in (select person_id from customer_persons where customer_id = cust)
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.pc_my_cover(text) from public, anon;
grant execute on function public.pc_my_cover(text) to authenticated;

commit;
