-- Fix PL/pgSQL "could refer to either a variable or a table column" in provider_find_save.
-- Variables (name, phone, suburb, …) collided with service_providers columns on UPDATE/INSERT.
create or replace function public.provider_find_save(
  p_category text default null,
  p_job_id uuid default null,
  p_trade_type_id uuid default null,
  p_provider jsonb default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_cat text := coalesce(nullif(p_category, ''), nullif(app.active_category(), 'denied'), 'sample');
  v_tid uuid := app.tenant_id();
  v_name text := nullif(trim(coalesce(p_provider->>'trading_name', '')), '');
  v_phone text := nullif(trim(coalesce(p_provider->>'phone', '')), '');
  v_email text := nullif(trim(coalesce(p_provider->>'email', '')), '');
  v_website text := nullif(trim(coalesce(p_provider->>'website', '')), '');
  v_street text := nullif(trim(coalesce(p_provider->>'street_address', '')), '');
  v_suburb text := nullif(trim(coalesce(p_provider->>'suburb', p_provider->>'locality', '')), '');
  v_city text := nullif(trim(coalesce(p_provider->>'city', '')), '');
  v_province text := nullif(trim(coalesce(p_provider->>'province', '')), '');
  v_postal text := nullif(trim(coalesce(p_provider->>'postal_code', '')), '');
  v_source_url text := nullif(trim(coalesce(p_provider->>'source_url', '')), '');
  v_formatted text;
  v_pid uuid;
  v_created boolean := false;
  v_area_label text;
begin
  if not app.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_name is null then raise exception 'trading_name_required' using errcode = 'P0001'; end if;
  if v_phone is null and v_email is null and v_website is null then
    raise exception 'contact_required' using errcode = 'P0001';
  end if;
  if p_trade_type_id is null then raise exception 'trade_required' using errcode = 'P0001'; end if;

  v_formatted := nullif(trim(concat_ws(', ',
    v_street,
    v_suburb,
    v_city,
    v_province,
    v_postal
  )), '');

  select sp.id into v_pid
  from service_providers sp
  where sp.tenant_id = v_tid and sp.data_category = v_cat
    and (
      (v_phone is not null and sp.phone is not null
        and lower(trim(sp.trading_name)) = lower(v_name)
        and regexp_replace(sp.phone, '\D', '', 'g') = regexp_replace(v_phone, '\D', '', 'g'))
      or (v_email is not null and sp.email is not null
        and lower(trim(sp.trading_name)) = lower(v_name)
        and lower(sp.email) = lower(v_email))
      or (v_website is not null and sp.website is not null
        and lower(regexp_replace(sp.website, '^https?://(www\.)?', '', 'i'))
          = lower(regexp_replace(v_website, '^https?://(www\.)?', '', 'i')))
    )
  limit 1;

  if v_pid is null then
    insert into service_providers (
      tenant_id, data_category, trading_name, phone, email, website, source_url,
      street_address, suburb, city, province, postal_code, country, address_formatted,
      find_run_id, active, preferred, after_hours_available, internal_notes, created_by
    ) values (
      v_tid, v_cat, v_name, v_phone, v_email, v_website, v_source_url,
      v_street, v_suburb, v_city, v_province, v_postal, 'ZA', v_formatted,
      p_job_id, true, false, false,
      'Added from Find providers',
      auth.uid()
    ) returning id into v_pid;
    v_created := true;

    insert into service_provider_trades (provider_id, data_category, trade_type_id)
    values (v_pid, v_cat, p_trade_type_id)
    on conflict do nothing;

    v_area_label := coalesce(v_suburb, v_city, (select inputs->>'area' from jobs where id = p_job_id), 'Unknown');
    insert into service_provider_areas (provider_id, data_category, area_label, area_kind)
    values (v_pid, v_cat, v_area_label, case when v_suburb is not null then 'suburb' else 'town' end);
  else
    update service_providers sp set
      phone = coalesce(v_phone, sp.phone),
      email = coalesce(v_email, sp.email),
      website = coalesce(v_website, sp.website),
      source_url = coalesce(v_source_url, sp.source_url),
      street_address = coalesce(v_street, sp.street_address),
      suburb = coalesce(v_suburb, sp.suburb),
      city = coalesce(v_city, sp.city),
      province = coalesce(v_province, sp.province),
      postal_code = coalesce(v_postal, sp.postal_code),
      address_formatted = coalesce(v_formatted, sp.address_formatted),
      find_run_id = coalesce(sp.find_run_id, p_job_id),
      updated_at = now()
    where sp.id = v_pid;
    insert into service_provider_trades (provider_id, data_category, trade_type_id)
    values (v_pid, v_cat, p_trade_type_id)
    on conflict do nothing;
  end if;

  return jsonb_build_object(
    'id', v_pid,
    'created', v_created,
    'trading_name', v_name,
    'phone', v_phone,
    'email', v_email,
    'website', v_website,
    'street_address', v_street,
    'suburb', v_suburb,
    'city', v_city,
    'province', v_province,
    'postal_code', v_postal,
    'address_formatted', v_formatted,
    'source_url', v_source_url
  );
end $$;

revoke all on function public.provider_find_save(text, uuid, uuid, jsonb) from public, anon;
grant execute on function public.provider_find_save(text, uuid, uuid, jsonb) to authenticated;
notify pgrst, 'reload schema';
