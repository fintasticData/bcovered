-- Provider directory find: map-ready address fields, relaxed contact, find/save RPCs.
-- Applied via MCP as provider_directory_find on bcovered.

do $$
declare r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relname = 'service_providers'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%phone%email%'
  loop
    execute format('alter table public.service_providers drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.service_providers
  add column if not exists website text,
  add column if not exists source_url text,
  add column if not exists street_address text,
  add column if not exists suburb text,
  add column if not exists city text,
  add column if not exists province text,
  add column if not exists postal_code text,
  add column if not exists country text not null default 'ZA',
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists address_formatted text,
  add column if not exists find_run_id uuid;

-- At least one contact path: phone, email or website
alter table public.service_providers
  add constraint service_providers_contact_check
  check (phone is not null or email is not null or website is not null);

create index if not exists service_providers_suburb_idx
  on service_providers (tenant_id, data_category, suburb);
create index if not exists service_providers_geo_idx
  on service_providers (tenant_id, data_category, lat, lng)
  where lat is not null and lng is not null;

-- ------------------------------------------------------------------ find run helpers
create or replace function public.provider_find_create_run(
  p_category text default null,
  p_area text default null,
  p_trade_code text default null,
  p_trade_label text default null,
  p_requested_count int default 10,
  p_idempotency_key text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  cat text := coalesce(nullif(p_category, ''), nullif(app.active_category(), 'denied'), 'sample');
  tid uuid := app.tenant_id();
  uid uuid := auth.uid();
  jid uuid;
  existing uuid;
begin
  if not app.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  if nullif(trim(coalesce(p_area, '')), '') is null then
    raise exception 'area_required' using errcode = 'P0001';
  end if;

  if p_idempotency_key is not null then
    select id into existing from jobs
    where tenant_id = tid and idempotency_key = p_idempotency_key limit 1;
    if existing is not null then
      return jsonb_build_object('id', existing, 'status', (select status from jobs where id = existing));
    end if;
  end if;

  insert into jobs (
    tenant_id, workflow_type, agent, status, initiated_by, inputs, outputs, idempotency_key, data_category
  ) values (
    tid, 'provider_directory', 'russ', 'queued', uid,
    jsonb_build_object(
      'area', trim(p_area),
      'trade_code', nullif(trim(coalesce(p_trade_code, '')), ''),
      'trade_label', nullif(trim(coalesce(p_trade_label, '')), ''),
      'requested_count', greatest(1, least(30, coalesce(p_requested_count, 10)))
    ),
    jsonb_build_object(
      'phase', 'discover',
      'queue', '[]'::jsonb,
      'saved', '[]'::jsonb,
      'rejected', '[]'::jsonb,
      'seen_names', '[]'::jsonb,
      'progress', jsonb_build_object(
        'found', 0, 'requested', greatest(1, least(30, coalesce(p_requested_count, 10))),
        'searches_used', 0, 'step', 'Starting', 'elapsed_ms', 0
      ),
      'stop_reason', null,
      'summary', null
    ),
    p_idempotency_key,
    cat
  ) returning id into jid;

  return jsonb_build_object('id', jid, 'status', 'queued');
end $$;
revoke all on function public.provider_find_create_run(text, text, text, text, int, text) from public, anon;
grant execute on function public.provider_find_create_run(text, text, text, text, int, text) to authenticated;

create or replace function public.provider_find_get_run(
  p_category text default null,
  p_job_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  cat text := coalesce(nullif(p_category, ''), nullif(app.active_category(), 'denied'), 'sample');
  j jobs%rowtype;
begin
  if not app.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into j from jobs
  where id = p_job_id and tenant_id = app.tenant_id() and workflow_type = 'provider_directory'
    and coalesce(data_category, cat) = cat;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  return jsonb_build_object(
    'id', j.id,
    'status', j.status,
    'cancel_requested', j.cancel_requested,
    'inputs', j.inputs,
    'outputs', j.outputs,
    'created_at', j.created_at,
    'updated_at', j.updated_at,
    'completed_at', j.completed_at
  );
end $$;
revoke all on function public.provider_find_get_run(text, uuid) from public, anon;
grant execute on function public.provider_find_get_run(text, uuid) to authenticated;

create or replace function public.provider_find_update_run(
  p_category text default null,
  p_job_id uuid default null,
  p_status text default null,
  p_outputs jsonb default null,
  p_worker text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  cat text := coalesce(nullif(p_category, ''), nullif(app.active_category(), 'denied'), 'sample');
  j jobs%rowtype;
begin
  if not app.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  update jobs set
    status = coalesce(nullif(p_status, ''), status),
    outputs = coalesce(p_outputs, outputs),
    locked_by = coalesce(p_worker, locked_by),
    locked_at = case when p_worker is not null then now() else locked_at end,
    started_at = coalesce(started_at, now()),
    completed_at = case when coalesce(p_status, '') in ('completed','failed','cancelled') then now() else completed_at end,
    updated_at = now()
  where id = p_job_id and tenant_id = app.tenant_id() and workflow_type = 'provider_directory'
  returning * into j;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  return public.provider_find_get_run(cat, j.id);
end $$;
revoke all on function public.provider_find_update_run(text, uuid, text, jsonb, text) from public, anon;
grant execute on function public.provider_find_update_run(text, uuid, text, jsonb, text) to authenticated;

create or replace function public.provider_find_cancel_run(
  p_category text default null,
  p_job_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not app.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  update jobs set cancel_requested = true, status = 'cancelled', completed_at = now(), updated_at = now()
  where id = p_job_id and tenant_id = app.tenant_id() and workflow_type = 'provider_directory';
  return public.provider_find_get_run(p_category, p_job_id);
end $$;
revoke all on function public.provider_find_cancel_run(text, uuid) from public, anon;
grant execute on function public.provider_find_cancel_run(text, uuid) to authenticated;

-- Auto-save one discovered provider into the directory (email optional).
create or replace function public.provider_find_save(
  p_category text default null,
  p_job_id uuid default null,
  p_trade_type_id uuid default null,
  p_provider jsonb default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  cat text := coalesce(nullif(p_category, ''), nullif(app.active_category(), 'denied'), 'sample');
  tid uuid := app.tenant_id();
  name text := nullif(trim(coalesce(p_provider->>'trading_name', '')), '');
  phone text := nullif(trim(coalesce(p_provider->>'phone', '')), '');
  email text := nullif(trim(coalesce(p_provider->>'email', '')), '');
  website text := nullif(trim(coalesce(p_provider->>'website', '')), '');
  street text := nullif(trim(coalesce(p_provider->>'street_address', '')), '');
  suburb text := nullif(trim(coalesce(p_provider->>'suburb', p_provider->>'locality', '')), '');
  city text := nullif(trim(coalesce(p_provider->>'city', '')), '');
  province text := nullif(trim(coalesce(p_provider->>'province', '')), '');
  postal text := nullif(trim(coalesce(p_provider->>'postal_code', '')), '');
  source_url text := nullif(trim(coalesce(p_provider->>'source_url', '')), '');
  formatted text;
  pid uuid;
  created boolean := false;
  area_label text;
begin
  if not app.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  if name is null then raise exception 'trading_name_required' using errcode = 'P0001'; end if;
  if phone is null and email is null and website is null then
    raise exception 'contact_required' using errcode = 'P0001';
  end if;
  if p_trade_type_id is null then raise exception 'trade_required' using errcode = 'P0001'; end if;

  formatted := nullif(trim(concat_ws(', ',
    street,
    suburb,
    city,
    province,
    postal
  )), '');

  -- Match existing by name+phone, name+email, or website
  select sp.id into pid
  from service_providers sp
  where sp.tenant_id = tid and sp.data_category = cat
    and (
      (phone is not null and sp.phone is not null
        and lower(trim(sp.trading_name)) = lower(name)
        and regexp_replace(sp.phone, '\D', '', 'g') = regexp_replace(phone, '\D', '', 'g'))
      or (email is not null and sp.email is not null
        and lower(trim(sp.trading_name)) = lower(name)
        and lower(sp.email) = lower(email))
      or (website is not null and sp.website is not null
        and lower(regexp_replace(sp.website, '^https?://(www\.)?', '', 'i'))
          = lower(regexp_replace(website, '^https?://(www\.)?', '', 'i')))
    )
  limit 1;

  if pid is null then
    insert into service_providers (
      tenant_id, data_category, trading_name, phone, email, website, source_url,
      street_address, suburb, city, province, postal_code, country, address_formatted,
      find_run_id, active, preferred, after_hours_available, internal_notes, created_by
    ) values (
      tid, cat, name, phone, email, website, source_url,
      street, suburb, city, province, postal, 'ZA', formatted,
      p_job_id, true, false, false,
      'Added from Find providers',
      auth.uid()
    ) returning id into pid;
    created := true;

    insert into service_provider_trades (provider_id, data_category, trade_type_id)
    values (pid, cat, p_trade_type_id)
    on conflict do nothing;

    area_label := coalesce(suburb, city, (select inputs->>'area' from jobs where id = p_job_id), 'Unknown');
    insert into service_provider_areas (provider_id, data_category, area_label, area_kind)
    values (pid, cat, area_label, case when suburb is not null then 'suburb' else 'town' end);
  else
    update service_providers sp set
      phone = coalesce(phone, sp.phone),
      email = coalesce(email, sp.email),
      website = coalesce(website, sp.website),
      source_url = coalesce(source_url, sp.source_url),
      street_address = coalesce(street, sp.street_address),
      suburb = coalesce(suburb, sp.suburb),
      city = coalesce(city, sp.city),
      province = coalesce(province, sp.province),
      postal_code = coalesce(postal, sp.postal_code),
      address_formatted = coalesce(formatted, sp.address_formatted),
      find_run_id = coalesce(sp.find_run_id, p_job_id),
      updated_at = now()
    where sp.id = pid;
    insert into service_provider_trades (provider_id, data_category, trade_type_id)
    values (pid, cat, p_trade_type_id)
    on conflict do nothing;
  end if;

  return jsonb_build_object(
    'id', pid,
    'created', created,
    'trading_name', name,
    'phone', phone,
    'email', email,
    'website', website,
    'street_address', street,
    'suburb', suburb,
    'city', city,
    'province', province,
    'postal_code', postal,
    'address_formatted', formatted,
    'source_url', source_url
  );
end $$;
revoke all on function public.provider_find_save(text, uuid, uuid, jsonb) from public, anon;
grant execute on function public.provider_find_save(text, uuid, uuid, jsonb) to authenticated;

-- Refresh provider JSON helper to include address fields
create or replace function app.service_provider_json(p_provider_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', p.id,
    'trading_name', p.trading_name,
    'contact_person', p.contact_person,
    'phone', p.phone,
    'email', p.email,
    'website', p.website,
    'source_url', p.source_url,
    'street_address', p.street_address,
    'suburb', p.suburb,
    'city', p.city,
    'province', p.province,
    'postal_code', p.postal_code,
    'country', p.country,
    'lat', p.lat,
    'lng', p.lng,
    'address_formatted', p.address_formatted,
    'operating_hours', p.operating_hours,
    'after_hours_available', p.after_hours_available,
    'standard_callout_fee_zar', p.standard_callout_fee_zar,
    'after_hours_callout_fee_zar', p.after_hours_callout_fee_zar,
    'preferred', p.preferred,
    'active', p.active,
    'internal_notes', p.internal_notes,
    'created_at', p.created_at,
    'updated_at', p.updated_at,
    'trades', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'code', t.code, 'label', t.label) order by t.label)
      from service_provider_trades pt
      join service_trade_types t on t.id = pt.trade_type_id
      where pt.provider_id = p.id
    ), '[]'::jsonb),
    'areas', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'area_label', a.area_label, 'area_kind', a.area_kind) order by a.area_label)
      from service_provider_areas a where a.provider_id = p.id
    ), '[]'::jsonb),
    'panels', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pan.id, 'insurer_id', pan.insurer_id,
        'insurer_name', i.name, 'trade_type_id', pan.trade_type_id,
        'trade_label', tt.label, 'active', pan.active
      ) order by i.name)
      from service_provider_insurer_panels pan
      join insurers i on i.id = pan.insurer_id
      join service_trade_types tt on tt.id = pan.trade_type_id
      where pan.provider_id = p.id
    ), '[]'::jsonb)
  )
  from service_providers p where p.id = p_provider_id;
$$;

notify pgrst, 'reload schema';
