-- Fix PostgREST 404: salesRpc always sends p_category; customer_page_* must accept it.
-- Also scope customer self-person lookup to the active Demo/Live category (header / p_category).

create or replace function app.customer_page_resolve_person(p_person_id uuid)
returns table (
  person_id uuid,
  customer_id uuid,
  tenant_id uuid,
  data_category text,
  preferred_name text,
  full_name text,
  is_preview boolean
)
language plpgsql stable security definer set search_path = public as $$
declare
  cust uuid := app.my_customer_id();
  cat text := coalesce(nullif(app.active_category(), 'denied'), 'sample');
  t uuid := app.tenant_id();
  pid uuid;
  cid uuid;
  pref text;
  fname text;
  preview boolean := false;
begin
  if cat = 'denied' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_person_id is not null then
    if not app.is_staff() then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    select p.id, cp.customer_id, p.tenant_id, p.data_category,
           coalesce(nullif(p.preferred_name,''), split_part(p.first_names, ' ', 1)),
           trim(both from coalesce(p.first_names,'') || ' ' || coalesce(p.surname,''))
      into pid, cid, t, cat, pref, fname
      from persons p
      join customer_persons cp on cp.person_id = p.id and cp.data_category = p.data_category
       and cp.effective_to is null
     where p.id = p_person_id
       and p.tenant_id = app.tenant_id()
       and p.data_category = cat
     order by case when cp.role = 'self' then 0 else 1 end, cp.is_primary desc, cp.created_at
     limit 1;
    if pid is null then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    if app.book_restricted() and not app.can_see_person(pid) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    preview := true;
  else
    if cust is null then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    select p.id, cp.customer_id, p.tenant_id, p.data_category,
           coalesce(nullif(p.preferred_name,''), split_part(p.first_names, ' ', 1)),
           trim(both from coalesce(p.first_names,'') || ' ' || coalesce(p.surname,''))
      into pid, cid, t, cat, pref, fname
      from customer_persons cp
      join persons p on p.id = cp.person_id and p.data_category = cp.data_category
     where cp.customer_id = cust
       and cp.data_category = cat
       and cp.role = 'self' and cp.effective_to is null
     order by cp.is_primary desc, cp.created_at
     limit 1;
    if pid is null then
      select p.id, cp.customer_id, p.tenant_id, p.data_category,
             coalesce(nullif(p.preferred_name,''), split_part(p.first_names, ' ', 1)),
             trim(both from coalesce(p.first_names,'') || ' ' || coalesce(p.surname,''))
        into pid, cid, t, cat, pref, fname
        from customer_persons cp
        join persons p on p.id = cp.person_id and p.data_category = cp.data_category
       where cp.customer_id = cust
         and cp.data_category = cat
       order by cp.is_primary desc, cp.created_at
       limit 1;
    end if;
    if pid is null then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
  end if;

  person_id := pid;
  customer_id := cid;
  tenant_id := t;
  data_category := cat;
  preferred_name := pref;
  full_name := fname;
  is_preview := preview;
  return next;
end $$;

drop function if exists public.customer_page_get(uuid);
create or replace function public.customer_page_get(
  p_category text default null,
  p_person_id uuid default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  ctx record;
  org organisations%rowtype;
  cust customers%rowtype;
  bp business_profiles%rowtype;
  broker jsonb;
  attention jsonb := '[]'::jsonb;
  items jsonb := '[]'::jsonb;
  policies jsonb := '[]'::jsonb;
  claims jsonb := '[]'::jsonb;
  locations jsonb := '[]'::jsonb;
  released_count int := 0;
begin
  perform set_config(
    'request.headers',
    jsonb_set(
      coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb),
      '{x-data-category}',
      to_jsonb(coalesce(nullif(p_category, ''), nullif(app.active_category(), 'denied'), 'sample'))
    )::text,
    true
  );

  select * into ctx from app.customer_page_resolve_person(p_person_id);
  select * into org from organisations where id = ctx.tenant_id;
  select * into cust from customers where id = ctx.customer_id and data_category = ctx.data_category;
  select * into bp from business_profiles where customer_id = ctx.customer_id limit 1;

  select coalesce(jsonb_agg(jsonb_build_object('id', bl.id, 'name', bl.name, 'city', bl.city) order by bl.name), '[]'::jsonb)
    into locations
    from business_locations bl
   where bp.id is not null and bl.business_profile_id = bp.id;

  select jsonb_build_object(
           'id', m.id,
           'name', coalesce(m.full_name, u.full_name),
           'phone', m.phone,
           'email', m.email,
           'russ_enabled', true
         )
    into broker
    from customers c
    left join persons p on p.id = ctx.person_id
    left join sales_team_members m on m.id = coalesce(p.assigned_member_id, c.assigned_member_id)
    left join app_users u on u.id = m.user_id
   where c.id = ctx.customer_id and c.data_category = ctx.data_category;

  select count(*)::int into released_count
    from quotes q
   where q.customer_id = ctx.customer_id
     and q.status = 'released'
     and q.data_category = ctx.data_category;

  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.sort_at desc), '[]'::jsonb)
    into items
    from (
      select
        ii.id, ii.item_type, ii.display_label, ii.status as cover_status,
        app.customer_page_status(
          ii.status, ii.details,
          exists (
            select 1 from quotes q
             where q.customer_id = ctx.customer_id and q.status = 'released' and q.data_category = ctx.data_category
               and (q.id::text = nullif(ii.details->>'quote_id','')
                 or lower(coalesce(q.risk_summary->>'summary','')) like '%' || lower(left(ii.display_label, 24)) || '%')
          )
        ) as customer_status,
        case
          when ii.details ? 'declared_value' then (ii.details->>'declared_value')::numeric
          when ii.details ? 'contents_limit' then (ii.details->>'contents_limit')::numeric
          when ii.details ? 'building_sum_insured' then (ii.details->>'building_sum_insured')::numeric
          else null
        end as insured_value,
        ii.details->>'location_name' as location_name,
        ii.details->>'location_id' as location_id,
        ii.details->>'photo_url' as photo_url,
        ii.details->>'reference' as reference,
        nullif(ii.details->>'quote_id','') as quote_id,
        pol.id as policy_id,
        pol.reference as policy_reference,
        pol.premium_amount,
        pol.premium_frequency,
        case when pol.premium_amount is not null then 'policy' else 'item' end as premium_scope,
        ii.updated_at as sort_at
      from insured_items ii
      left join lateral (
        select pol.id, pol.reference, pol.premium_amount, pol.premium_frequency
          from policy_version_items pvi
          join policy_versions pv on pv.id = pvi.policy_version_id and pv.superseded_at is null
          join policies pol on pol.id = pv.policy_id and pol.data_category = pv.data_category
         where pvi.insured_item_id = ii.id and pvi.data_category = ii.data_category
         limit 1
      ) pol on true
      where ii.person_id = ctx.person_id
        and ii.data_category = ctx.data_category
        and ii.status in ('awaiting_cover','covered','replaced','removed')
    ) x;

  select coalesce(jsonb_agg(a order by a.priority), '[]'::jsonb)
    into attention
    from (
      (select 1 as priority, 'review_quote' as kind, 'Review your motor quote' as label,
              '/portal/proposals/' || q.id as href, q.id::text as target_id
         from quotes q
        where q.customer_id = ctx.customer_id and q.status = 'released' and q.data_category = ctx.data_category
        order by q.released_at desc nulls last limit 1)
      union all
      (select 2, 'upload_photo', 'Upload a photo of your vehicle', '/my#add-item', ii.id::text
         from insured_items ii
        where ii.person_id = ctx.person_id and ii.data_category = ctx.data_category
          and ii.item_type = 'vehicle' and ii.status = 'awaiting_cover'
          and coalesce(ii.details->>'photo_url','') = ''
          and coalesce(ii.details->>'source','') = 'customer_request' limit 1)
      union all
      (select 3, 'claim_next', coalesce(c.next_action, 'Continue your claim'), '/my?tab=claims', c.id::text
         from claims c
        where c.person_id = ctx.person_id and c.data_category = ctx.data_category
          and c.next_action is not null and c.status not in ('closed','withdrawn','declined')
        order by c.updated_at desc limit 1)
    ) a;

  select coalesce(jsonb_agg(row_to_json(p)::jsonb order by p.inception_date desc nulls last), '[]'::jsonb)
    into policies
    from (
      select pol.id, pol.reference, pol.policy_number, pol.status,
             pol.inception_date, pol.premium_amount, pol.premium_frequency, pol.cover_type,
             i.name as insurer_name,
             (select coalesce(jsonb_agg(jsonb_build_object('id', ii.id, 'label', ii.display_label, 'status', ii.status)), '[]'::jsonb)
                from policy_versions pv
                join policy_version_items pvi on pvi.policy_version_id = pv.id
                join insured_items ii on ii.id = pvi.insured_item_id
               where pv.policy_id = pol.id and pv.superseded_at is null) as items,
             '[]'::jsonb as documents
        from policy_cover pc
        join policies pol on pol.id = pc.policy_id and pol.data_category = pc.data_category
        left join insurers i on i.id = pol.provider_id
       where pc.person_id = ctx.person_id and pc.data_category = ctx.data_category
    ) p;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'reference', c.reference, 'status', c.status,
           'incident_type', c.incident_type, 'incident_at', c.incident_at,
           'next_action', c.next_action, 'customer_update', c.next_action
         ) order by c.updated_at desc), '[]'::jsonb)
    into claims from claims c
   where c.person_id = ctx.person_id and c.data_category = ctx.data_category;

  return jsonb_build_object(
    'person_id', ctx.person_id, 'customer_id', ctx.customer_id, 'is_preview', ctx.is_preview,
    'is_sample', ctx.data_category = 'sample', 'data_category', ctx.data_category,
    'greeting_name', ctx.preferred_name, 'full_name', ctx.full_name,
    'customer_type', cust.customer_type,
    'business', case when bp.id is null then null else jsonb_build_object(
      'id', bp.id, 'trading_name', coalesce(bp.trading_name, bp.registered_name),
      'registered_name', bp.registered_name, 'locations', locations) end,
    'brokerage', jsonb_build_object(
      'id', org.id, 'trading_name', coalesce(org.trading_name, org.name),
      'logo_url', org.logo_url, 'brand_image_url', org.brand_image_url),
    'broker', broker, 'attention', attention, 'items', items, 'policies', policies,
    'claims', claims, 'released_quote_count', released_count
  );
end $$;

grant execute on function public.customer_page_get(text, uuid) to authenticated;

drop function if exists public.customer_page_request_item(text, text, numeric, text, uuid, text, uuid, text, uuid);
create or replace function public.customer_page_request_item(
  p_category text default null,
  p_display_label text default null,
  p_item_type text default 'vehicle',
  p_declared_value numeric default null,
  p_description text default null,
  p_location_id uuid default null,
  p_photo_url text default null,
  p_media_asset_id uuid default null,
  p_idempotency_key text default null,
  p_person_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  ctx record;
  loc business_locations%rowtype;
  existing uuid;
  item_id uuid;
  ref text;
  itype text := coalesce(nullif(p_item_type,''), 'vehicle');
begin
  perform set_config(
    'request.headers',
    jsonb_set(
      coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb),
      '{x-data-category}',
      to_jsonb(coalesce(nullif(p_category, ''), nullif(app.active_category(), 'denied'), 'sample'))
    )::text,
    true
  );

  if coalesce(trim(p_display_label), '') = '' then
    raise exception 'validation' using errcode = '22023', message = 'Describe the item to insure.';
  end if;
  if itype not in ('vehicle','building','contents','equipment') then
    raise exception 'validation' using errcode = '22023', message = 'Unsupported item type.';
  end if;

  select * into ctx from app.customer_page_resolve_person(p_person_id);
  if ctx.is_preview then
    raise exception 'forbidden' using errcode = '42501', message = 'Preview is read-only.';
  end if;

  if p_idempotency_key is not null then
    select id into existing
      from insured_items
     where person_id = ctx.person_id
       and data_category = ctx.data_category
       and details->>'idempotency_key' = p_idempotency_key
     limit 1;
    if existing is not null then
      select details->>'reference' into ref from insured_items where id = existing;
      return jsonb_build_object(
        'outcome', 'ok', 'replayed', true, 'item_id', existing, 'reference', ref,
        'summary', 'Your request was already received.'
      );
    end if;
  end if;

  if p_location_id is not null then
    select * into loc from business_locations where id = p_location_id;
    if loc.id is null then
      raise exception 'validation' using errcode = '22023', message = 'Unknown premises.';
    end if;
  end if;

  ref := app.next_number(ctx.tenant_id, 'enquiry', ctx.data_category);

  insert into insured_items (
    tenant_id, data_category, person_id, item_type, status, display_label, details
  ) values (
    ctx.tenant_id, ctx.data_category, ctx.person_id, itype, 'awaiting_cover',
    trim(p_display_label),
    jsonb_strip_nulls(jsonb_build_object(
      'source', 'customer_request',
      'idempotency_key', p_idempotency_key,
      'reference', ref,
      'description', nullif(trim(coalesce(p_description,'')), ''),
      'declared_value', p_declared_value,
      'location_id', p_location_id,
      'location_name', loc.name,
      'photo_url', nullif(trim(coalesce(p_photo_url,'')), ''),
      'media_asset_id', p_media_asset_id,
      'requested_at', now()
    ))
  ) returning id into item_id;

  if p_media_asset_id is not null then
    update media_assets
       set owner_table = 'insured_items', owner_id = item_id
     where id = p_media_asset_id and tenant_id = ctx.tenant_id;
  end if;

  return jsonb_build_object(
    'outcome', 'ok',
    'replayed', false,
    'item_id', item_id,
    'reference', ref,
    'summary', 'Request sent to your broker · ' || ref
  );
end $$;

grant execute on function public.customer_page_request_item(text, text, text, numeric, text, uuid, text, uuid, text, uuid) to authenticated;

drop function if exists public.customer_page_invite_create(uuid);
create or replace function public.customer_page_invite_create(
  p_category text default null,
  p_person_id uuid default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  ctx record;
  token text := encode(gen_random_bytes(24), 'hex');
  inv_id uuid;
  expires timestamptz := now() + interval '14 days';
begin
  perform set_config(
    'request.headers',
    jsonb_set(
      coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb),
      '{x-data-category}',
      to_jsonb(coalesce(nullif(p_category, ''), nullif(app.active_category(), 'denied'), 'sample'))
    )::text,
    true
  );

  if not app.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_person_id is null then
    raise exception 'validation' using errcode = '22023', message = 'Person is required.';
  end if;
  select * into ctx from app.customer_page_resolve_person(p_person_id);

  update customer_page_invites
     set revoked_at = now()
   where person_id = ctx.person_id
     and data_category = ctx.data_category
     and redeemed_at is null
     and revoked_at is null;

  insert into customer_page_invites (
    tenant_id, data_category, customer_id, person_id, token_hash, expires_at, created_by, attribution
  ) values (
    ctx.tenant_id, ctx.data_category, ctx.customer_id, ctx.person_id,
    encode(digest(token, 'sha256'), 'hex'), expires, auth.uid(),
    jsonb_build_object('created_via', 'customer_page_share')
  ) returning id into inv_id;

  return jsonb_build_object(
    'invite_id', inv_id,
    'token', token,
    'path', '/invite/c/' || token,
    'expires_at', expires,
    'person_id', ctx.person_id,
    'customer_id', ctx.customer_id,
    'is_sample', ctx.data_category = 'sample'
  );
end $$;

grant execute on function public.customer_page_invite_create(text, uuid) to authenticated;

drop function if exists public.customer_page_invite_peek(text);
create or replace function public.customer_page_invite_peek(
  p_category text default null,
  p_token text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  inv customer_page_invites%rowtype;
  org organisations%rowtype;
  p persons%rowtype;
begin
  select * into inv
    from customer_page_invites
   where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
   limit 1;
  if inv.id is null or inv.revoked_at is not null then
    raise exception 'not_found' using errcode = 'P0002', message = 'This invitation is not valid.';
  end if;
  if inv.expires_at < now() then
    raise exception 'expired' using errcode = 'P0001', message = 'This invitation has expired.';
  end if;
  select * into org from organisations where id = inv.tenant_id;
  select * into p from persons where id = inv.person_id;
  return jsonb_build_object(
    'invite_id', inv.id,
    'expires_at', inv.expires_at,
    'redeemed', inv.redeemed_at is not null,
    'is_sample', inv.data_category = 'sample',
    'brokerage', jsonb_build_object(
      'trading_name', coalesce(org.trading_name, org.name),
      'logo_url', org.logo_url
    ),
    'greeting_name', coalesce(nullif(p.preferred_name,''), split_part(p.first_names, ' ', 1))
  );
end $$;

grant execute on function public.customer_page_invite_peek(text, text) to authenticated, anon;

drop function if exists public.customer_page_invite_redeem(text);
create or replace function public.customer_page_invite_redeem(
  p_category text default null,
  p_token text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  inv customer_page_invites%rowtype;
  uid uuid := auth.uid();
  au app_users%rowtype;
begin
  if uid is null then
    raise exception 'forbidden' using errcode = '42501', message = 'Sign in to open your page.';
  end if;

  select * into inv
    from customer_page_invites
   where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
   for update;
  if inv.id is null or inv.revoked_at is not null then
    raise exception 'not_found' using errcode = 'P0002', message = 'This invitation is not valid.';
  end if;
  if inv.expires_at < now() then
    raise exception 'expired' using errcode = 'P0001', message = 'This invitation has expired.';
  end if;

  select * into au from app_users where id = uid;
  if au.id is null then
    raise exception 'forbidden' using errcode = '42501', message = 'No user profile.';
  end if;

  if au.customer_id is not null and au.customer_id <> inv.customer_id then
    raise exception 'forbidden' using errcode = '42501',
      message = 'This account is already linked to a different customer.';
  end if;

  if au.customer_id is null then
    update app_users
       set customer_id = inv.customer_id,
           active_organisation_id = coalesce(active_organisation_id, inv.tenant_id),
           role = coalesce(role, 'customer')
     where id = uid;
  end if;

  if not exists (
    select 1 from access_grants
     where user_id = uid and scope_type = 'customer' and scope_id = inv.customer_id and revoked_at is null
  ) then
    insert into access_grants (tenant_id, user_id, scope_type, scope_id, granted_by)
    values (inv.tenant_id, uid, 'customer', inv.customer_id, inv.created_by);
  end if;

  if inv.redeemed_at is null then
    update customer_page_invites
       set redeemed_at = now(), redeemed_by = uid
     where id = inv.id;
  end if;

  return jsonb_build_object(
    'outcome', 'ok',
    'customer_id', inv.customer_id,
    'person_id', inv.person_id,
    'path', case when inv.data_category = 'sample' then '/demo/my' else '/my' end,
    'is_sample', inv.data_category = 'sample'
  );
end $$;

grant execute on function public.customer_page_invite_redeem(text, text) to authenticated;

notify pgrst, 'reload schema';
