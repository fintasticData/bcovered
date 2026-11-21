-- 1) Let enrolled customers upload item photos to their brokerage media bucket.
-- 2) Let platform staff (clinton / Platform admin) preview Concierge by person_id.

begin;

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
  -- Brokerage staff OR signed-in customer of that tenant (Concierge item photos).
  return folder_id is not distinct from app.tenant_id()
    and (app.is_staff() or app.my_customer_id() is not null);
end;
$$;

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
  cust uuid := app.my_customer_id();
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
      and coalesce(p_purpose, '') like 'concierge%'
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

-- Concierge home: staff OR platform staff may preview an enrolled customer's desk.
create or replace function public.concierge_customer_home(
  p_category text default null,
  p_person_id uuid default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  cat text := coalesce(nullif(p_category, ''), nullif(app.active_category(), 'denied'), 'sample');
  cust uuid := app.my_customer_id();
  t uuid := app.tenant_id();
  pid uuid;
  prof customer_concierge_profiles%rowtype;
  member sales_team_members%rowtype;
  brokerage jsonb;
  staff_preview boolean := false;
begin
  if cat = 'denied' then raise exception 'forbidden' using errcode = '42501'; end if;

  if cust is null and (app.is_staff() or app.is_platform_staff()) and p_person_id is not null then
    select cp.customer_id, cp.person_id into cust, pid
      from customer_persons cp
     where cp.person_id = p_person_id and cp.data_category = cat
     order by cp.is_primary desc nulls last, cp.created_at
     limit 1;
    if cust is null then raise exception 'forbidden' using errcode = '42501'; end if;
    staff_preview := true;
  elsif cust is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if pid is null then
    select cp.person_id into pid
      from customer_persons cp
     where cp.customer_id = cust and cp.data_category = cat and cp.is_primary
     order by cp.created_at limit 1;
    if pid is null then
      select cp.person_id into pid from customer_persons cp
       where cp.customer_id = cust and cp.data_category = cat limit 1;
    end if;
  end if;

  select * into prof from customer_concierge_profiles
   where customer_id = cust and data_category = cat and enabled;
  if not found then
    return jsonb_build_object('enabled', false, 'reason', 'not_enrolled', 'staff_preview', staff_preview);
  end if;

  if prof.assigned_member_id is not null then
    select * into member from sales_team_members where id = prof.assigned_member_id;
  end if;

  select jsonb_build_object(
    'id', o.id, 'trading_name', coalesce(o.trading_name, o.name),
    'logo_url', o.logo_url, 'brand_image_url', o.brand_image_url
  ) into brokerage from organisations o where o.id = coalesce(t, prof.tenant_id);

  return jsonb_build_object(
    'enabled', true,
    'staff_preview', staff_preview,
    'data_category', cat,
    'person_id', pid,
    'customer_id', cust,
    'greeting_name', (select coalesce(nullif(preferred_name,''), first_names) from persons where id = pid),
    'full_name', (select full_name from customers where id = cust),
    'brokerage', brokerage,
    'concierge', case when member.id is null then null else jsonb_build_object(
      'member_id', member.id,
      'user_id', member.user_id,
      'name', member.full_name,
      'email', member.email,
      'phone', member.phone,
      'photo_url', null
    ) end,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'item_type', i.item_type,
        'display_label', i.display_label,
        'cover_status', i.status,
        'customer_status', app.concierge_item_display_status(i.status, i.details, nullif(i.details->>'quote_id','')::uuid),
        'photo_url', nullif(i.details->>'photo_url',''),
        'policy_id', coalesce(nullif(i.details->>'policy_id','')::uuid, pol.id),
        'policy_number', pol.policy_number,
        'policy_reference', pol.reference,
        'cover_type', coalesce(nullif(i.details->>'cover_type',''), pol.cover_type, i.item_type),
        'section_code', coalesce(nullif(i.details->>'section_code',''),
          case i.item_type
            when 'contents' then 'HCAT'
            when 'building' then 'HOB'
            when 'vehicle' then 'MOT'
            when 'equipment' then 'PAV'
            else upper(left(i.item_type, 4))
          end),
        'insured_value', case
          when i.details ? 'declared_value' then (i.details->>'declared_value')::numeric
          when i.details ? 'contents_limit' then (i.details->>'contents_limit')::numeric
          when i.details ? 'building_sum_insured' then (i.details->>'building_sum_insured')::numeric
          else null
        end,
        'premium_amount', pol.premium_amount,
        'premium_frequency', pol.premium_frequency,
        'insurer_name', pol.insurer_name,
        'details', i.details
      ) order by case i.status when 'awaiting_cover' then 0 when 'covered' then 1 else 2 end, i.display_label)
      from insured_items i
      left join lateral (
        select pol.id, pol.policy_number, pol.reference, pol.cover_type,
               pol.premium_amount, pol.premium_frequency, ins.name as insurer_name
          from policy_version_items pvi
          join policy_versions pv on pv.id = pvi.policy_version_id and pv.superseded_at is null
          join policies pol on pol.id = pv.policy_id and pol.data_category = pv.data_category
          left join insurers ins on ins.id = pol.provider_id
         where pvi.insured_item_id = i.id and pvi.data_category = i.data_category
         limit 1
      ) pol on true
      where i.person_id = pid and i.data_category = cat
        and i.status not in ('removed')
    ), '[]'::jsonb),
    'policies', coalesce((
      select jsonb_agg(row_to_json(p)::jsonb order by p.inception_date desc nulls last)
      from (
        select pol.id, pol.reference, pol.policy_number, pol.status,
               pol.inception_date, pol.premium_amount, pol.premium_frequency, pol.cover_type,
               i.name as insurer_name,
               (
                 select coalesce(jsonb_agg(jsonb_build_object(
                   'id', ii.id, 'label', ii.display_label, 'status', ii.status, 'item_type', ii.item_type
                 )), '[]'::jsonb)
                 from policy_versions pv
                 join policy_version_items pvi on pvi.policy_version_id = pv.id
                 join insured_items ii on ii.id = pvi.insured_item_id
                where pv.policy_id = pol.id and pv.superseded_at is null
               ) as items
          from policy_cover pc
          join policies pol on pol.id = pc.policy_id and pol.data_category = pc.data_category
          left join insurers i on i.id = pol.provider_id
         where pc.person_id = pid and pc.data_category = cat
      ) p
    ), '[]'::jsonb),
    'requests', coalesce((
      select jsonb_agg(row_to_json(x)::jsonb order by x.sort_pri, x.updated_at desc)
      from (
        select r.id, r.reference, r.title, r.request_kind, r.status, r.next_action, r.responsible_party,
               r.insured_item_id, r.follow_up_at, r.updated_at, r.created_at,
               case r.status when 'action_needed' then 0 when 'received' then 1 when 'with_concierge' then 2
                             when 'with_insurer' then 3 else 4 end as sort_pri,
               (select m.full_name from sales_team_members m where m.id = r.owner_member_id) as owner_name,
               (select i.display_label from insured_items i where i.id = r.insured_item_id) as item_label
          from concierge_requests r
         where r.customer_id = cust and r.data_category = cat
           and r.status not in ('completed','withdrawn')
      ) x
    ), '[]'::jsonb)
  );
end $$;

revoke all on function public.concierge_customer_home(text, uuid) from public, anon;
grant execute on function public.concierge_customer_home(text, uuid) to authenticated;

commit;
