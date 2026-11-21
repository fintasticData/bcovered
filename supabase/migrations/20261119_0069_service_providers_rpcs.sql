-- Service provider / job RPCs + extend concierge_request_get with service_jobs.
-- Applied via MCP as service_providers_rpcs on bcovered.

-- ------------------------------------------------------------------ helpers
create or replace function app.service_job_json(p_job_id uuid, p_viewer text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  j service_jobs%rowtype;
  trade service_trade_types%rowtype;
  cur service_job_allocations%rowtype;
  prov service_providers%rowtype;
  broker boolean := p_viewer = 'broker';
  has_cur boolean := false;
begin
  select * into j from service_jobs where id = p_job_id;
  if not found then return null; end if;
  select * into trade from service_trade_types where id = j.trade_type_id;
  select * into cur from service_job_allocations where job_id = j.id and is_current limit 1;
  has_cur := found;
  if has_cur then
    select * into prov from service_providers where id = cur.provider_id;
  end if;

  return jsonb_build_object(
    'id', j.id,
    'concierge_request_id', j.concierge_request_id,
    'claim_id', j.claim_id,
    'policy_id', j.policy_id,
    'insured_item_id', j.insured_item_id,
    'person_id', j.person_id,
    'customer_id', j.customer_id,
    'trade_type_id', j.trade_type_id,
    'trade_code', trade.code,
    'trade_label', trade.label,
    'work_description', j.work_description,
    'urgency', j.urgency,
    'preferred_window', j.preferred_window,
    'service_address', j.service_address,
    'status', j.status,
    'authority_status', case when broker then j.authority_status else null end,
    'payment_responsibility', case when broker then j.payment_responsibility else null end,
    'quoted_callout_fee_zar', case when broker then j.quoted_callout_fee_zar else null end,
    'agreed_amount_zar', case when broker then j.agreed_amount_zar else null end,
    'appointment_at', j.appointment_at,
    'completed_at', j.completed_at,
    'outcome', case when broker then j.outcome else jsonb_build_object('summary', j.outcome->>'summary') end,
    'next_action', j.next_action,
    'responsible_party', j.responsible_party,
    'created_at', j.created_at,
    'updated_at', j.updated_at,
    'current_allocation', case when not has_cur then null else jsonb_build_object(
      'id', cur.id,
      'provider_id', cur.provider_id,
      'attempt_no', cur.attempt_no,
      'status', cur.status,
      'provider_notified_at', cur.provider_notified_at,
      'acceptance_channel', case when broker then cur.acceptance_channel else null end,
      'accepted_at', cur.accepted_at,
      'declined_at', case when broker then cur.declined_at else null end,
      'decline_reason', case when broker then cur.decline_reason else null end,
      'quoted_callout_fee_zar', case when broker then cur.quoted_callout_fee_zar else null end,
      'provider_name', prov.trading_name,
      'provider_phone', case
        when cur.status in ('accepted','notified') or j.status in ('scheduled','in_progress','completed')
          or (cur.shared_customer_fields ? 'phone')
        then prov.phone else null end,
      'provider_email', case
        when cur.status in ('accepted','notified') or j.status in ('scheduled','in_progress','completed')
          or (cur.shared_customer_fields ? 'email')
        then prov.email else null end,
      'contact_person', prov.contact_person,
      'after_hours_available', case when broker then prov.after_hours_available else null end
    ) end,
    'allocations', case when not broker then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'provider_id', a.provider_id,
        'provider_name', (select trading_name from service_providers where id = a.provider_id),
        'attempt_no', a.attempt_no,
        'is_current', a.is_current,
        'status', a.status,
        'accepted_at', a.accepted_at,
        'declined_at', a.declined_at,
        'decline_reason', a.decline_reason,
        'provider_notified_at', a.provider_notified_at,
        'acceptance_channel', a.acceptance_channel,
        'quoted_callout_fee_zar', a.quoted_callout_fee_zar,
        'created_at', a.created_at
      ) order by a.attempt_no)
      from service_job_allocations a where a.job_id = j.id
    ), '[]'::jsonb) end
  );
end $$;
revoke all on function app.service_job_json(uuid, text) from public, anon;
grant execute on function app.service_job_json(uuid, text) to authenticated;

create or replace function app.service_provider_json(p_provider_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', p.id,
    'trading_name', p.trading_name,
    'contact_person', p.contact_person,
    'phone', p.phone,
    'email', p.email,
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
revoke all on function app.service_provider_json(uuid) from public, anon;
grant execute on function app.service_provider_json(uuid) to authenticated;

-- ------------------------------------------------------------------ trade types
create or replace function app.ensure_service_trade_types(p_tenant uuid, p_cat text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into service_trade_types (tenant_id, data_category, code, label)
  select p_tenant, p_cat, v.code, v.label
  from (values
    ('plumber', 'Plumber'),
    ('electrician', 'Electrician'),
    ('locksmith', 'Locksmith'),
    ('glazier', 'Glazier'),
    ('appliance_repair', 'Appliance repair')
  ) as v(code, label)
  on conflict (tenant_id, data_category, code) do update set label = excluded.label, active = true;
end $$;
revoke all on function app.ensure_service_trade_types(uuid, text) from public, anon;

create or replace function public.service_trade_types_list(p_category text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  cat text := coalesce(nullif(p_category, ''), nullif(app.active_category(), 'denied'), 'sample');
  tid uuid := app.tenant_id();
begin
  if not app.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  perform app.ensure_service_trade_types(tid, cat);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', t.id, 'code', t.code, 'label', t.label, 'active', t.active
    ) order by t.label)
    from service_trade_types t
    where t.tenant_id = tid and t.data_category = cat and t.active
  ), '[]'::jsonb);
end $$;
revoke all on function public.service_trade_types_list(text) from public, anon;
grant execute on function public.service_trade_types_list(text) to authenticated;

create or replace function public.service_trade_type_upsert(
  p_category text default null,
  p_id uuid default null,
  p_code text default null,
  p_label text default null,
  p_active boolean default true
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  cat text := coalesce(nullif(p_category, ''), nullif(app.active_category(), 'denied'), 'sample');
  tid uuid;
begin
  if not app.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_id is not null then
    update service_trade_types set
      label = coalesce(nullif(p_label, ''), label),
      code = coalesce(nullif(p_code, ''), code),
      active = coalesce(p_active, active)
    where id = p_id and tenant_id = app.tenant_id() and data_category = cat
    returning id into tid;
  else
    if nullif(p_code, '') is null or nullif(p_label, '') is null then
      raise exception 'code_and_label_required' using errcode = 'P0001';
    end if;
    insert into service_trade_types (tenant_id, data_category, code, label, active)
    values (app.tenant_id(), cat, lower(trim(p_code)), trim(p_label), coalesce(p_active, true))
    on conflict (tenant_id, data_category, code) do update
      set label = excluded.label, active = excluded.active
    returning id into tid;
  end if;
  return (select jsonb_build_object('id', t.id, 'code', t.code, 'label', t.label, 'active', t.active)
    from service_trade_types t where t.id = tid);
end $$;
revoke all on function public.service_trade_type_upsert(text, uuid, text, text, boolean) from public, anon;
grant execute on function public.service_trade_type_upsert(text, uuid, text, text, boolean) to authenticated;

-- ------------------------------------------------------------------ provider list / get / upsert
create or replace function public.service_provider_list(
  p_category text default null,
  p_query text default null,
  p_trade_type_id uuid default null,
  p_area text default null,
  p_active boolean default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  cat text := coalesce(nullif(p_category, ''), nullif(app.active_category(), 'denied'), 'sample');
  area_n text := lower(trim(coalesce(p_area, '')));
  q text := lower(trim(coalesce(p_query, '')));
begin
  if not app.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(row_to_json(x)::jsonb order by x.preferred desc, x.trading_name)
    from (
      select p.id, p.trading_name, p.contact_person, p.phone, p.email,
             p.after_hours_available, p.standard_callout_fee_zar, p.preferred, p.active,
             p.updated_at,
             coalesce((
               select jsonb_agg(jsonb_build_object('id', t.id, 'code', t.code, 'label', t.label))
               from service_provider_trades pt join service_trade_types t on t.id = pt.trade_type_id
               where pt.provider_id = p.id
             ), '[]'::jsonb) as trades,
             coalesce((
               select jsonb_agg(a.area_label order by a.area_label)
               from service_provider_areas a where a.provider_id = p.id
             ), '[]'::jsonb) as areas
      from service_providers p
      where p.tenant_id = app.tenant_id() and p.data_category = cat
        and (p_active is null or p.active = p_active)
        and (q = '' or p.trading_name ilike '%' || q || '%' or coalesce(p.phone,'') ilike '%' || q || '%'
             or coalesce(p.email,'') ilike '%' || q || '%' or coalesce(p.contact_person,'') ilike '%' || q || '%')
        and (p_trade_type_id is null or exists (
          select 1 from service_provider_trades pt where pt.provider_id = p.id and pt.trade_type_id = p_trade_type_id
        ))
        and (area_n = '' or exists (
          select 1 from service_provider_areas a where a.provider_id = p.id and a.area_norm like '%' || area_n || '%'
        ))
    ) x
  ), '[]'::jsonb);
end $$;
revoke all on function public.service_provider_list(text, text, uuid, text, boolean) from public, anon;
grant execute on function public.service_provider_list(text, text, uuid, text, boolean) to authenticated;

create or replace function public.service_provider_get(
  p_category text default null,
  p_provider_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  cat text := coalesce(nullif(p_category, ''), nullif(app.active_category(), 'denied'), 'sample');
  p service_providers%rowtype;
begin
  if not app.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into p from service_providers
  where id = p_provider_id and tenant_id = app.tenant_id() and data_category = cat;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  return app.service_provider_json(p.id) || jsonb_build_object(
    'jobs_current', coalesce((
      select jsonb_agg(app.service_job_json(j.id, 'broker') order by j.updated_at desc)
      from service_jobs j
      join service_job_allocations a on a.job_id = j.id and a.is_current and a.provider_id = p.id
      where j.tenant_id = p.tenant_id and j.data_category = cat
        and j.status not in ('completed','cancelled')
    ), '[]'::jsonb),
    'jobs_history', coalesce((
      select jsonb_agg(app.service_job_json(j.id, 'broker') order by j.updated_at desc)
      from service_jobs j
      join service_job_allocations a on a.job_id = j.id and a.provider_id = p.id
      where j.tenant_id = p.tenant_id and j.data_category = cat
        and j.status in ('completed','cancelled')
    ), '[]'::jsonb)
  );
end $$;
revoke all on function public.service_provider_get(text, uuid) from public, anon;
grant execute on function public.service_provider_get(text, uuid) to authenticated;

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
  p_panels jsonb default null
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
begin
  if not app.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  if nullif(trim(coalesce(p_trading_name, '')), '') is null then
    raise exception 'trading_name_required' using errcode = 'P0001';
  end if;
  if nullif(trim(coalesce(p_phone, '')), '') is null and nullif(trim(coalesce(p_email, '')), '') is null then
    raise exception 'contact_required' using errcode = 'P0001';
  end if;
  if p_trade_type_ids is null or coalesce(array_length(p_trade_type_ids, 1), 0) < 1 then
    raise exception 'trade_required' using errcode = 'P0001';
  end if;
  if p_areas is null or jsonb_typeof(p_areas) <> 'array' or jsonb_array_length(p_areas) < 1 then
    raise exception 'area_required' using errcode = 'P0001';
  end if;

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
      tenant_id, data_category, trading_name, contact_person, phone, email,
      operating_hours, after_hours_available, standard_callout_fee_zar, after_hours_callout_fee_zar,
      preferred, active, internal_notes, created_by
    ) values (
      tid, cat, trim(p_trading_name), nullif(trim(coalesce(p_contact_person, '')), ''),
      nullif(trim(coalesce(p_phone, '')), ''), nullif(trim(coalesce(p_email, '')), ''),
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
revoke all on function public.service_provider_upsert(text, uuid, text, text, text, text, jsonb, boolean, numeric, numeric, boolean, boolean, text, uuid[], jsonb, jsonb) from public, anon;
grant execute on function public.service_provider_upsert(text, uuid, text, text, text, text, jsonb, boolean, numeric, numeric, boolean, boolean, text, uuid[], jsonb, jsonb) to authenticated;

-- ------------------------------------------------------------------ match
create or replace function public.service_provider_match(
  p_category text default null,
  p_trade_type_id uuid default null,
  p_area text default null,
  p_insurer_id uuid default null,
  p_broaden boolean default false
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  cat text := coalesce(nullif(p_category, ''), nullif(app.active_category(), 'denied'), 'sample');
  area_n text := lower(trim(coalesce(p_area, '')));
begin
  if not app.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_trade_type_id is null then raise exception 'trade_required' using errcode = 'P0001'; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id,
      'trading_name', p.trading_name,
      'contact_person', p.contact_person,
      'phone', p.phone,
      'email', p.email,
      'after_hours_available', p.after_hours_available,
      'standard_callout_fee_zar', p.standard_callout_fee_zar,
      'after_hours_callout_fee_zar', p.after_hours_callout_fee_zar,
      'preferred', p.preferred,
      'match_reasons', (
        select jsonb_agg(r) from (
          select 'Serves trade' as r
          union all
          select x.r from (
            select ('Serves area: ' || a.area_label) as r
            from service_provider_areas a
            where a.provider_id = p.id
              and (p_broaden or area_n = '' or a.area_norm like '%' || area_n || '%')
            limit 3
          ) x
          union all select 'Preferred by brokerage' where p.preferred
          union all select 'After-hours available' where p.after_hours_available
          union all select 'On insurer panel'
            where p_insurer_id is not null and exists (
              select 1 from service_provider_insurer_panels pan
              where pan.provider_id = p.id and pan.insurer_id = p_insurer_id
                and pan.trade_type_id = p_trade_type_id and pan.active
            )
        ) s
      ),
      'on_insurer_panel', exists (
        select 1 from service_provider_insurer_panels pan
        where pan.provider_id = p.id and pan.trade_type_id = p_trade_type_id and pan.active
          and (p_insurer_id is null or pan.insurer_id = p_insurer_id)
      ),
      'areas', coalesce((
        select jsonb_agg(a.area_label order by a.area_label) from service_provider_areas a where a.provider_id = p.id
      ), '[]'::jsonb)
    ) order by p.preferred desc, p.trading_name)
    from service_providers p
    where p.tenant_id = app.tenant_id() and p.data_category = cat and p.active
      and exists (select 1 from service_provider_trades pt where pt.provider_id = p.id and pt.trade_type_id = p_trade_type_id)
      and (
        p_broaden or area_n = ''
        or exists (
          select 1 from service_provider_areas a
          where a.provider_id = p.id and a.area_norm like '%' || area_n || '%'
        )
      )
  ), '[]'::jsonb);
end $$;
revoke all on function public.service_provider_match(text, uuid, text, uuid, boolean) from public, anon;
grant execute on function public.service_provider_match(text, uuid, text, uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
