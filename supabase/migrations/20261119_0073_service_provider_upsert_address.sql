-- Allow website-only contact on manual upsert; persist structured address fields for maps.
create or replace function public.service_provider_upsert(
  p_category text default null,
  p_provider_id uuid default null,
  p_trading_name text default null,
  p_contact_person text default null,
  p_phone text default null,
  p_email text default null,
  p_operating_hours jsonb default '{}'::jsonb,
  p_after_hours_available boolean default false,
  p_standard_callout_fee_zar numeric default null,
  p_after_hours_callout_fee_zar numeric default null,
  p_preferred boolean default false,
  p_active boolean default true,
  p_internal_notes text default null,
  p_trade_type_ids uuid[] default null,
  p_areas jsonb default null,
  p_panels jsonb default null,
  p_website text default null,
  p_street_address text default null,
  p_suburb text default null,
  p_city text default null,
  p_province text default null,
  p_postal_code text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  cat text := coalesce(nullif(p_category, ''), nullif(app.active_category(), 'denied'), 'sample');
  tid uuid := app.tenant_id();
  pid uuid;
  warnings jsonb := '[]'::jsonb;
  area jsonb;
  panel jsonb;
  trade_id uuid;
  website text := nullif(trim(coalesce(p_website, '')), '');
  street text := nullif(trim(coalesce(p_street_address, '')), '');
  suburb text := nullif(trim(coalesce(p_suburb, '')), '');
  city text := nullif(trim(coalesce(p_city, '')), '');
  province text := nullif(trim(coalesce(p_province, '')), '');
  postal text := nullif(trim(coalesce(p_postal_code, '')), '');
  formatted text;
begin
  if not app.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  if nullif(trim(coalesce(p_trading_name, '')), '') is null then
    raise exception 'trading_name_required' using errcode = 'P0001';
  end if;
  if nullif(trim(coalesce(p_phone, '')), '') is null
     and nullif(trim(coalesce(p_email, '')), '') is null
     and website is null then
    raise exception 'contact_required' using errcode = 'P0001';
  end if;
  if p_trade_type_ids is null or coalesce(array_length(p_trade_type_ids, 1), 0) < 1 then
    raise exception 'trade_required' using errcode = 'P0001';
  end if;
  if p_areas is null or jsonb_typeof(p_areas) <> 'array' or jsonb_array_length(p_areas) < 1 then
    raise exception 'area_required' using errcode = 'P0001';
  end if;

  formatted := nullif(trim(concat_ws(', ', street, suburb, city, province, postal)), '');

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', sp.id, 'trading_name', sp.trading_name, 'phone', sp.phone, 'email', sp.email
  )), '[]'::jsonb) into warnings
  from service_providers sp
  where sp.tenant_id = tid and sp.data_category = cat
    and (p_provider_id is null or sp.id <> p_provider_id)
    and (
      lower(trim(sp.trading_name)) = lower(trim(p_trading_name))
      or (nullif(trim(coalesce(p_phone,'')), '') is not null and sp.phone is not null
          and regexp_replace(sp.phone, '\D', '', 'g') = regexp_replace(p_phone, '\D', '', 'g'))
      or (nullif(trim(coalesce(p_email,'')), '') is not null and lower(sp.email) = lower(trim(p_email)))
    );

  if p_provider_id is not null then
    update service_providers set
      trading_name = trim(p_trading_name),
      contact_person = nullif(trim(coalesce(p_contact_person, '')), ''),
      phone = nullif(trim(coalesce(p_phone, '')), ''),
      email = nullif(trim(coalesce(p_email, '')), ''),
      website = website,
      street_address = street,
      suburb = suburb,
      city = city,
      province = province,
      postal_code = postal,
      address_formatted = coalesce(formatted, address_formatted),
      operating_hours = coalesce(p_operating_hours, '{}'::jsonb),
      after_hours_available = coalesce(p_after_hours_available, false),
      standard_callout_fee_zar = p_standard_callout_fee_zar,
      after_hours_callout_fee_zar = p_after_hours_callout_fee_zar,
      preferred = coalesce(p_preferred, false),
      active = coalesce(p_active, true),
      internal_notes = p_internal_notes,
      updated_at = now()
    where id = p_provider_id and tenant_id = tid and data_category = cat
    returning id into pid;
    if pid is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  else
    insert into service_providers (
      tenant_id, data_category, trading_name, contact_person, phone, email, website,
      street_address, suburb, city, province, postal_code, address_formatted,
      operating_hours, after_hours_available, standard_callout_fee_zar, after_hours_callout_fee_zar,
      preferred, active, internal_notes, created_by
    ) values (
      tid, cat, trim(p_trading_name), nullif(trim(coalesce(p_contact_person, '')), ''),
      nullif(trim(coalesce(p_phone, '')), ''), nullif(trim(coalesce(p_email, '')), ''), website,
      street, suburb, city, province, postal, formatted,
      coalesce(p_operating_hours, '{}'::jsonb), coalesce(p_after_hours_available, false),
      p_standard_callout_fee_zar, p_after_hours_callout_fee_zar,
      coalesce(p_preferred, false), coalesce(p_active, true), p_internal_notes, auth.uid()
    ) returning id into pid;
  end if;

  delete from service_provider_trades where provider_id = pid;
  foreach trade_id in array p_trade_type_ids loop
    insert into service_provider_trades (provider_id, data_category, trade_type_id)
    values (pid, cat, trade_id);
  end loop;

  delete from service_provider_areas where provider_id = pid;
  for area in select * from jsonb_array_elements(p_areas) loop
    insert into service_provider_areas (provider_id, data_category, area_label, area_kind)
    values (
      pid, cat,
      trim(area->>'area_label'),
      coalesce(nullif(area->>'area_kind', ''), 'suburb')
    );
  end loop;

  delete from service_provider_insurer_panels where provider_id = pid;
  if p_panels is not null and jsonb_typeof(p_panels) = 'array' then
    for panel in select * from jsonb_array_elements(p_panels) loop
      insert into service_provider_insurer_panels (provider_id, data_category, insurer_id, trade_type_id, active)
      values (
        pid, cat,
        (panel->>'insurer_id')::uuid,
        (panel->>'trade_type_id')::uuid,
        coalesce((panel->>'active')::boolean, true)
      );
    end loop;
  end if;

  return app.service_provider_json(pid) || jsonb_build_object('duplicate_warnings', warnings);
end $$;

revoke all on function public.service_provider_upsert(text, uuid, text, text, text, text, jsonb, boolean, numeric, numeric, boolean, boolean, text, uuid[], jsonb, jsonb, text, text, text, text, text, text) from public, anon;
grant execute on function public.service_provider_upsert(text, uuid, text, text, text, text, jsonb, boolean, numeric, numeric, boolean, boolean, text, uuid[], jsonb, jsonb, text, text, text, text, text, text) to authenticated;
notify pgrst, 'reload schema';
