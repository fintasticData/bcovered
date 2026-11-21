-- Partner tracking MVP: product partners, packages, install/fleet requests.
-- Separate from franchise_partners (sales channel). Shareable page + Request installation.

-- ------------------------------------------------------------------ number_sequences: allow install_request
alter table number_sequences drop constraint if exists number_sequences_kind_check;
alter table number_sequences add constraint number_sequences_kind_check check (kind = any (array[
  'client','account','note','task','policy','enquiry','offer','sale','service_request','claim','install_request'
]::text[]));

-- ------------------------------------------------------------------ next_number: install_request
create or replace function app.next_number(p_tenant uuid, p_kind text, p_category text) returns text
language plpgsql security definer set search_path = public as $$
declare v bigint;
begin
  insert into number_sequences (tenant_id, kind, data_category) values (p_tenant, p_kind, p_category)
  on conflict (tenant_id, kind, data_category) do update set last_value = number_sequences.last_value + 1
  returning last_value into v;
  return (case p_kind
    when 'client' then 'CL' when 'account' then 'AC' when 'note' then 'NT' when 'policy' then 'PL'
    when 'enquiry' then 'EN' when 'offer' then 'OF' when 'sale' then 'SL'
    when 'service_request' then 'PSR' when 'claim' then 'CLM'
    when 'install_request' then 'INS'
    else 'TK' end)
    || (case p_category when 'sample' then '-S' else '-' end) || v;
end $$;
revoke all on function app.next_number(uuid, text, text) from public, anon, authenticated;

-- ------------------------------------------------------------------ tables
create table if not exists product_partners (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  data_category text not null check (data_category in ('sample','live')),
  name text not null,
  slug text not null,
  logo_url text,
  intro text,
  install_areas text[] not null default '{}',
  contact_phone text,
  contact_email text,
  status text not null default 'active' check (status in ('active','paused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, data_category),
  unique (slug, data_category)
);
create index if not exists product_partners_tenant_idx on product_partners (tenant_id, data_category, status);

create table if not exists partner_packages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  data_category text not null check (data_category in ('sample','live')),
  partner_id uuid not null,
  name text not null,
  image_url text,
  outcomes text[] not null default '{}', -- recovery | live_location | alerts | dashcam | trailer
  description text,
  can_do text, -- customer-facing "what you can do"
  install_fee_cents int not null default 0 check (install_fee_cents >= 0),
  monthly_fee_cents int not null default 0 check (monthly_fee_cents >= 0),
  contract_months int check (contract_months is null or contract_months > 0),
  product_kind text not null default 'tracker' check (product_kind in ('tracker','dashcam','trailer','other')),
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, data_category),
  foreign key (partner_id, data_category) references product_partners (id, data_category)
);
create index if not exists partner_packages_partner_idx on partner_packages (partner_id, data_category, active, sort_order);

create table if not exists partner_install_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  data_category text not null check (data_category in ('sample','live')),
  reference text,
  partner_id uuid not null,
  package_id uuid not null,
  person_id uuid,
  insured_item_id uuid,
  vehicle_label text,
  contact_name text,
  contact_phone text,
  contact_email text,
  preferred_area text,
  request_kind text not null default 'installation' check (request_kind in ('installation','fleet_quote')),
  status text not null default 'requested' check (status in (
    'requested','partner_contacting','booked','fitted','declined','withdrawn'
  )),
  source text not null default 'my_area' check (source in ('my_area','share_link','broker')),
  share_with_partner boolean not null default true,
  appointment_at timestamptz,
  appointment_note text,
  device_details jsonb not null default '{}'::jsonb,
  certificate_url text,
  next_action text,
  owner_member_id uuid references sales_team_members(id),
  client_key text,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, data_category),
  foreign key (partner_id, data_category) references product_partners (id, data_category),
  foreign key (package_id, data_category) references partner_packages (id, data_category),
  foreign key (person_id, data_category) references persons (id, data_category),
  foreign key (insured_item_id, data_category) references insured_items (id, data_category)
);
create unique index if not exists partner_install_requests_ref_key
  on partner_install_requests (tenant_id, data_category, reference) where reference is not null;
create unique index if not exists partner_install_requests_client_key
  on partner_install_requests (tenant_id, data_category, client_key) where client_key is not null;
create index if not exists partner_install_requests_person_idx
  on partner_install_requests (tenant_id, data_category, person_id, created_at desc);
create index if not exists partner_install_requests_item_idx
  on partner_install_requests (insured_item_id) where insured_item_id is not null;
create index if not exists partner_install_requests_partner_idx
  on partner_install_requests (partner_id, data_category, status, created_at desc);

create or replace function app.assign_install_reference() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.reference is null then
    new.reference := app.next_number(new.tenant_id, 'install_request', new.data_category);
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists assign_install_reference on partner_install_requests;
create trigger assign_install_reference
  before insert on partner_install_requests
  for each row execute function app.assign_install_reference();

create or replace function app.touch_install_updated() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists touch_install_updated on partner_install_requests;
create trigger touch_install_updated
  before update on partner_install_requests
  for each row execute function app.touch_install_updated();

-- ------------------------------------------------------------------ RLS
alter table product_partners enable row level security;
alter table partner_packages enable row level security;
alter table partner_install_requests enable row level security;

drop policy if exists staff_all on product_partners;
create policy staff_all on product_partners for all to authenticated
  using (tenant_id = app.tenant_id() and app.is_staff() and data_category = app.active_category())
  with check (tenant_id = app.tenant_id() and app.is_staff() and data_category = app.active_category());

drop policy if exists staff_all on partner_packages;
create policy staff_all on partner_packages for all to authenticated
  using (tenant_id = app.tenant_id() and app.is_staff() and data_category = app.active_category())
  with check (tenant_id = app.tenant_id() and app.is_staff() and data_category = app.active_category());

drop policy if exists staff_all on partner_install_requests;
create policy staff_all on partner_install_requests for all to authenticated
  using (
    tenant_id = app.tenant_id() and app.is_staff() and data_category = app.active_category()
    and (not app.book_restricted() or person_id is null or app.can_see_person(person_id))
  )
  with check (tenant_id = app.tenant_id() and app.is_staff() and data_category = app.active_category());

drop policy if exists customer_read_own on partner_install_requests;
create policy customer_read_own on partner_install_requests for select to authenticated
  using (
    data_category = app.active_category()
    and person_id in (
      select person_id from customer_persons where customer_id = app.my_customer_id()
    )
  );

-- Public catalog is served via security definer RPCs (not direct table select for anon).

-- ------------------------------------------------------------------ helpers
create or replace function app.partner_package_json(p partner_packages) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'image_url', p.image_url,
    'outcomes', to_jsonb(p.outcomes),
    'description', p.description,
    'can_do', p.can_do,
    'install_fee_cents', p.install_fee_cents,
    'monthly_fee_cents', p.monthly_fee_cents,
    'contract_months', p.contract_months,
    'product_kind', p.product_kind,
    'sort_order', p.sort_order
  );
$$;

create or replace function app.partner_install_json(r partner_install_requests) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', r.id,
    'reference', r.reference,
    'partner_id', r.partner_id,
    'partner_name', (select name from product_partners where id = r.partner_id),
    'package_id', r.package_id,
    'package_name', (select name from partner_packages where id = r.package_id),
    'person_id', r.person_id,
    'insured_item_id', r.insured_item_id,
    'vehicle_label', coalesce(r.vehicle_label, (select display_label from insured_items where id = r.insured_item_id)),
    'contact_name', r.contact_name,
    'contact_phone', r.contact_phone,
    'contact_email', r.contact_email,
    'preferred_area', r.preferred_area,
    'request_kind', r.request_kind,
    'status', r.status,
    'source', r.source,
    'share_with_partner', r.share_with_partner,
    'appointment_at', r.appointment_at,
    'appointment_note', r.appointment_note,
    'device_details', r.device_details,
    'certificate_url', r.certificate_url,
    'next_action', r.next_action,
    'created_at', r.created_at,
    'updated_at', r.updated_at
  );
$$;

-- ------------------------------------------------------------------ public + customer RPCs
create or replace function public.partner_tracking_page(p_slug text, p_category text default 'sample')
returns jsonb language plpgsql security definer set search_path = public as $$
declare cat text := coalesce(nullif(trim(p_category), ''), 'sample');
declare p product_partners%rowtype;
declare org organisations%rowtype;
begin
  if cat not in ('sample','live') then cat := 'sample'; end if;
  select * into p from product_partners
   where lower(slug) = lower(trim(coalesce(p_slug, ''))) and data_category = cat and status = 'active'
   limit 1;
  if p.id is null then
    return jsonb_build_object('valid', false, 'reason', 'We could not find that tracking partner.');
  end if;
  select * into org from organisations where id = p.tenant_id;
  return jsonb_build_object(
    'valid', true,
    'partner', jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'slug', p.slug,
      'logo_url', p.logo_url,
      'intro', p.intro,
      'install_areas', to_jsonb(p.install_areas),
      'contact_phone', p.contact_phone,
      'contact_email', p.contact_email,
      'brokerage', coalesce(org.trading_name, org.name),
      'tenant_id', p.tenant_id,
      'category', p.data_category
    ),
    'trackers', coalesce((
      select jsonb_agg(app.partner_package_json(pk) order by pk.sort_order, pk.name)
      from partner_packages pk
      where pk.partner_id = p.id and pk.data_category = cat and pk.active and pk.product_kind = 'tracker'
    ), '[]'::jsonb),
    'other_products', coalesce((
      select jsonb_agg(app.partner_package_json(pk) order by pk.sort_order, pk.name)
      from partner_packages pk
      where pk.partner_id = p.id and pk.data_category = cat and pk.active and pk.product_kind <> 'tracker'
    ), '[]'::jsonb)
  );
end $$;

create or replace function public.partner_tracking_my_context(p_category text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cat text := coalesce(p_category, app.active_category());
declare cust uuid := app.my_customer_id();
begin
  if cust is null then
    return jsonb_build_object('signed_in', false, 'vehicles', '[]'::jsonb, 'requests', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'signed_in', true,
    'customer_id', cust,
    'vehicles', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ii.id,
        'display_label', ii.display_label,
        'status', ii.status,
        'details', ii.details
      ) order by ii.display_label)
      from insured_items ii
      where ii.data_category = cat
        and ii.item_type = 'vehicle'
        and ii.status in ('covered','awaiting_cover')
        and ii.person_id in (select person_id from customer_persons where customer_id = cust)
    ), '[]'::jsonb),
    'requests', coalesce((
      select jsonb_agg(app.partner_install_json(r) order by r.created_at desc)
      from partner_install_requests r
      where r.data_category = cat
        and r.person_id in (select person_id from customer_persons where customer_id = cust)
        and r.status not in ('declined','withdrawn')
    ), '[]'::jsonb)
  );
end $$;

create or replace function public.partner_request_installation(
  p_slug text,
  p_package_id uuid,
  p_request_kind text default 'installation',
  p_insured_item_ids uuid[] default null,
  p_vehicle_label text default null,
  p_contact_name text default null,
  p_contact_phone text default null,
  p_contact_email text default null,
  p_preferred_area text default null,
  p_share_with_partner boolean default true,
  p_source text default 'my_area',
  p_client_key text default null,
  p_category text default 'sample'
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cat text := coalesce(nullif(trim(p_category), ''), 'sample');
declare p product_partners%rowtype;
declare pkg partner_packages%rowtype;
declare cust uuid := app.my_customer_id();
declare person uuid;
declare item_id uuid;
declare label text;
declare kind text := coalesce(nullif(trim(p_request_kind), ''), 'installation');
declare src text := coalesce(nullif(trim(p_source), ''), 'my_area');
declare created jsonb := '[]'::jsonb;
declare r partner_install_requests%rowtype;
declare existing uuid;
declare ids uuid[] := coalesce(p_insured_item_ids, '{}');
declare i int;
begin
  if cat not in ('sample','live') then cat := 'sample'; end if;
  if kind not in ('installation','fleet_quote') then kind := 'installation'; end if;
  if src not in ('my_area','share_link','broker') then src := 'share_link'; end if;

  select * into p from product_partners
   where lower(slug) = lower(trim(coalesce(p_slug, ''))) and data_category = cat and status = 'active'
   limit 1;
  if p.id is null then
    return jsonb_build_object('ok', false, 'reason', 'Partner not found.');
  end if;

  select * into pkg from partner_packages
   where id = p_package_id and partner_id = p.id and data_category = cat and active
   limit 1;
  if pkg.id is null then
    return jsonb_build_object('ok', false, 'reason', 'Package not found.');
  end if;

  if nullif(trim(coalesce(p_contact_name, '')), '') is null
     and nullif(trim(coalesce(p_contact_phone, '')), '') is null
     and nullif(trim(coalesce(p_contact_email, '')), '') is null
     and cust is null then
    return jsonb_build_object('ok', false, 'reason', 'Please add a name and a phone or email so the partner can contact you.');
  end if;

  if nullif(trim(coalesce(p_client_key, '')), '') is not null then
    select id into existing from partner_install_requests
     where tenant_id = p.tenant_id and data_category = cat and client_key = p_client_key
     limit 1;
    if existing is not null then
      select * into r from partner_install_requests where id = existing;
      return jsonb_build_object('ok', true, 'replayed', true, 'requests', jsonb_build_array(app.partner_install_json(r)));
    end if;
  end if;

  if cust is not null then
    select person_id into person from customer_persons where customer_id = cust limit 1;
  end if;

  if cardinality(ids) = 0 then
    -- single free-text / visitor vehicle
    insert into partner_install_requests (
      tenant_id, data_category, partner_id, package_id, person_id, insured_item_id, vehicle_label,
      contact_name, contact_phone, contact_email, preferred_area, request_kind, status, source,
      share_with_partner, next_action, client_key, created_by
    ) values (
      p.tenant_id, cat, p.id, pkg.id, person, null, nullif(trim(coalesce(p_vehicle_label, '')), ''),
      nullif(trim(coalesce(p_contact_name, '')), ''), nullif(trim(coalesce(p_contact_phone, '')), ''),
      nullif(trim(coalesce(p_contact_email, '')), ''), nullif(trim(coalesce(p_preferred_area, '')), ''),
      kind, 'requested', src, coalesce(p_share_with_partner, true),
      case when coalesce(p_share_with_partner, true)
        then 'Partner will contact you to arrange installation'
        else 'Request saved — share with partner when ready' end,
      nullif(trim(coalesce(p_client_key, '')), ''),
      auth.uid()
    ) returning * into r;
    created := created || jsonb_build_array(app.partner_install_json(r));
  else
    for i in 1 .. cardinality(ids) loop
      item_id := ids[i];
      label := null;
      if item_id is not null then
        select display_label, person_id into label, person
          from insured_items
         where id = item_id and data_category = cat and tenant_id = p.tenant_id
           and (cust is null or person_id in (select person_id from customer_persons where customer_id = cust));
        if label is null and cust is not null then
          continue; -- skip items the customer cannot claim
        end if;
        if label is null then
          select display_label, person_id into label, person
            from insured_items where id = item_id and data_category = cat and tenant_id = p.tenant_id;
        end if;
      end if;
      insert into partner_install_requests (
        tenant_id, data_category, partner_id, package_id, person_id, insured_item_id, vehicle_label,
        contact_name, contact_phone, contact_email, preferred_area, request_kind, status, source,
        share_with_partner, next_action, client_key, created_by
      ) values (
        p.tenant_id, cat, p.id, pkg.id, person, item_id, coalesce(label, nullif(trim(coalesce(p_vehicle_label, '')), '')),
        nullif(trim(coalesce(p_contact_name, '')), ''), nullif(trim(coalesce(p_contact_phone, '')), ''),
        nullif(trim(coalesce(p_contact_email, '')), ''), nullif(trim(coalesce(p_preferred_area, '')), ''),
        case when cardinality(ids) > 1 then 'fleet_quote' else kind end,
        'requested', src, coalesce(p_share_with_partner, true),
        case when coalesce(p_share_with_partner, true)
          then 'Partner will contact you to arrange installation'
          else 'Request saved — share with partner when ready' end,
        case when i = 1 then nullif(trim(coalesce(p_client_key, '')), '') else p_client_key || ':' || i::text end,
        auth.uid()
      ) returning * into r;
      created := created || jsonb_build_array(app.partner_install_json(r));
    end loop;
  end if;

  if jsonb_array_length(created) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'No vehicle selected.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'replayed', false,
    'partner_name', p.name,
    'package_name', pkg.name,
    'requests', created
  );
end $$;

create or replace function public.partner_list_person_install_requests(p_person_id uuid, p_category text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cat text := coalesce(p_category, app.active_category());
begin
  perform app.pc_require_staff();
  if app.book_restricted() and not app.can_see_person(p_person_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object('rows', coalesce((
    select jsonb_agg(app.partner_install_json(r) order by r.created_at desc)
    from partner_install_requests r
    where r.tenant_id = app.tenant_id() and r.data_category = cat and r.person_id = p_person_id
  ), '[]'::jsonb));
end $$;

create or replace function public.partner_update_install_status(
  p_request_id uuid,
  p_status text,
  p_appointment_at timestamptz default null,
  p_appointment_note text default null,
  p_device_details jsonb default null,
  p_certificate_url text default null,
  p_next_action text default null,
  p_category text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cat text := coalesce(p_category, app.active_category());
declare r partner_install_requests%rowtype;
declare st text := lower(trim(coalesce(p_status, '')));
begin
  perform app.pc_require_staff();
  select * into r from partner_install_requests
   where id = p_request_id and data_category = cat and tenant_id = app.tenant_id();
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if r.person_id is not null and app.book_restricted() and not app.can_see_person(r.person_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if st not in ('requested','partner_contacting','booked','fitted','declined','withdrawn') then
    return jsonb_build_object('ok', false, 'reason', 'Invalid status.');
  end if;

  update partner_install_requests set
    status = st,
    appointment_at = coalesce(p_appointment_at, appointment_at),
    appointment_note = coalesce(nullif(trim(coalesce(p_appointment_note, '')), ''), appointment_note),
    device_details = coalesce(p_device_details, device_details),
    certificate_url = coalesce(nullif(trim(coalesce(p_certificate_url, '')), ''), certificate_url),
    next_action = coalesce(nullif(trim(coalesce(p_next_action, '')), ''),
      case st
        when 'partner_contacting' then 'Partner is contacting the customer'
        when 'booked' then 'Installation appointment booked'
        when 'fitted' then 'Device fitted — keep certificate on file'
        when 'declined' then 'Request declined'
        when 'withdrawn' then 'Request withdrawn'
        else next_action end)
  where id = r.id
  returning * into r;

  return jsonb_build_object('ok', true, 'request', app.partner_install_json(r));
end $$;

create or replace function public.partner_default_tracking_slug(p_category text default 'sample')
returns jsonb language plpgsql security definer set search_path = public as $$
declare cat text := coalesce(nullif(trim(p_category), ''), 'sample');
declare s text;
begin
  select slug into s from product_partners
   where data_category = cat and status = 'active'
   order by created_at
   limit 1;
  if s is null then
    return jsonb_build_object('slug', null);
  end if;
  return jsonb_build_object('slug', s);
end $$;

grant execute on function public.partner_tracking_page(text, text) to anon, authenticated;
grant execute on function public.partner_tracking_my_context(text) to authenticated, anon;
grant execute on function public.partner_request_installation(text, uuid, text, uuid[], text, text, text, text, text, boolean, text, text, text) to anon, authenticated;
grant execute on function public.partner_list_person_install_requests(uuid, text) to authenticated;
grant execute on function public.partner_update_install_status(uuid, text, timestamptz, text, jsonb, text, text, text) to authenticated;
grant execute on function public.partner_default_tracking_slug(text) to anon, authenticated;

-- ------------------------------------------------------------------ sample seed (Acacia)
do $$
declare
  v_tenant uuid := 'b0000000-0000-4000-8000-000000000002'; -- Acacia Cover Brokers
  v_partner uuid := 'd1111111-0000-4000-8000-00000000a001';
  v_pkg1 uuid := 'd1111111-0000-4000-8000-00000000a010';
  v_pkg2 uuid := 'd1111111-0000-4000-8000-00000000a011';
  v_pkg3 uuid := 'd1111111-0000-4000-8000-00000000a012';
  v_pkg4 uuid := 'd1111111-0000-4000-8000-00000000a013';
begin
  if not exists (select 1 from organisations where id = v_tenant) then
    raise notice 'Acacia tenant missing — skipping partner tracking seed';
    return;
  end if;

  insert into product_partners (
    id, tenant_id, data_category, name, slug, logo_url, intro, install_areas, contact_phone, contact_email, status
  ) values (
    v_partner, v_tenant, 'sample', 'GuardTrack SA', 'guardtrack',
    null,
    'GuardTrack fits approved tracking devices across Gauteng, Cape Town and Durban. Choose a package built for recovery, everyday location, or a fleet quote for several vehicles.',
    array['Gauteng','Cape Town','Durban','Pretoria'],
    '087 000 4400', 'install@guardtrack.example',
    'active'
  )
  on conflict (id) do update set
    intro = excluded.intro,
    install_areas = excluded.install_areas,
    status = 'active',
    updated_at = now();

  insert into partner_packages (
    id, tenant_id, data_category, partner_id, name, outcomes, description, can_do,
    install_fee_cents, monthly_fee_cents, contract_months, product_kind, sort_order, active
  ) values
    (v_pkg1, v_tenant, 'sample', v_partner, 'Recover Assist',
      array['recovery','alerts'],
      'Hidden unit with 24/7 recovery desk when your car is stolen.',
      'If your car is stolen, GuardTrack helps you recover it and sends theft alerts to your phone.',
      149900, 19900, 36, 'tracker', 1, true),
    (v_pkg2, v_tenant, 'sample', v_partner, 'Locate Everyday',
      array['live_location','alerts'],
      'App-based live location for peace of mind — not a full recovery response unit.',
      'See where your car is on a map and get movement alerts. Ideal if you mainly want visibility.',
      89900, 9900, 24, 'tracker', 2, true),
    (v_pkg3, v_tenant, 'sample', v_partner, 'RoadView Dashcam',
      array['dashcam','alerts'],
      'Forward-facing dashcam with cloud clip backup after an impact.',
      'Record the road ahead and keep clips after a bump — useful evidence for claims.',
      129900, 7900, 24, 'dashcam', 3, true),
    (v_pkg4, v_tenant, 'sample', v_partner, 'Trailer Guard',
      array['live_location','trailer'],
      'Battery tracker for trailers and towed assets.',
      'Know where your trailer is when it is not hitched to the tow vehicle.',
      109900, 8900, 24, 'trailer', 4, true)
  on conflict (id) do update set
    name = excluded.name,
    outcomes = excluded.outcomes,
    description = excluded.description,
    can_do = excluded.can_do,
    install_fee_cents = excluded.install_fee_cents,
    monthly_fee_cents = excluded.monthly_fee_cents,
    contract_months = excluded.contract_months,
    active = true,
    updated_at = now();
end $$;
