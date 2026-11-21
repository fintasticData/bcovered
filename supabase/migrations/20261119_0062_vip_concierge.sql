-- VIP Concierge: entitlement, requests, partner teams, RPCs, RLS, VIP demo seed (Naledi / Lerato / Protea / Karoo).

-- ------------------------------------------------------------------ role + numbering + media owners
alter table app_users drop constraint if exists app_users_role_check;
alter table app_users add constraint app_users_role_check
  check (role in ('visitor','customer','broker','claims_admin','manager','admin','insurer_partner'));

alter table number_sequences drop constraint if exists number_sequences_kind_check;
alter table number_sequences add constraint number_sequences_kind_check
  check (kind in (
    'client','account','note','task','policy','enquiry','offer','sale',
    'service_request','claim','install_request','concierge_request'
  ));

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
    when 'service_request' then 'PSR' when 'claim' then 'CLM' when 'install_request' then 'INS'
    when 'concierge_request' then 'CG' else 'TK' end)
    || (case p_category when 'sample' then '-S' else '-' end) || v;
end $$;

alter table public.media_assets drop constraint if exists media_assets_owner_table_check;
alter table public.media_assets add constraint media_assets_owner_table_check
  check (owner_table is null or owner_table in (
    'organisations','sales_offers','sales_sales','persons','commercial_assets',
    'policy_service_requests','claims','policy_versions','insured_items',
    'claim_evidence_requirements','concierge_requests'
  ));

-- ------------------------------------------------------------------ tables
create table if not exists customer_concierge_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  data_category text not null check (data_category in ('sample','live')),
  customer_id uuid not null,
  enabled boolean not null default true,
  assigned_member_id uuid references sales_team_members(id),
  team_queue_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id, data_category),
  unique (id, data_category),
  foreign key (customer_id, data_category) references customers (id, data_category)
);
create index if not exists customer_concierge_profiles_member_idx
  on customer_concierge_profiles (tenant_id, data_category, assigned_member_id);

create table if not exists concierge_partner_teams (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  insurer_id uuid not null references insurers(id),
  name text not null,
  is_pilot boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, insurer_id)
);

create table if not exists concierge_partner_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  team_id uuid not null references concierge_partner_teams(id) on delete cascade,
  user_id uuid not null references app_users(id),
  created_at timestamptz not null default now(),
  unique (team_id, user_id)
);
create index if not exists concierge_partner_members_user_idx on concierge_partner_members (user_id);

create table if not exists concierge_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  data_category text not null check (data_category in ('sample','live')),
  reference text,
  person_id uuid not null,
  customer_id uuid not null,
  insured_item_id uuid,
  policy_id uuid,
  quote_id uuid,
  request_kind text not null check (request_kind in ('add_item','assist','callback','document','other')),
  title text not null,
  status text not null check (status in (
    'received','with_concierge','action_needed','with_insurer','completed','withdrawn'
  )),
  next_action text,
  responsible_party text not null check (responsible_party in ('customer','concierge','insurer','system')),
  owner_member_id uuid references sales_team_members(id),
  servicing_insurer_id uuid references insurers(id),
  partner_team_id uuid references concierge_partner_teams(id),
  follow_up_at timestamptz,
  outcome jsonb not null default '{}'::jsonb,
  details jsonb not null default '{}'::jsonb,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, data_category),
  foreign key (person_id, data_category) references persons (id, data_category),
  foreign key (customer_id, data_category) references customers (id, data_category)
);
create unique index if not exists concierge_requests_ref_key
  on concierge_requests (tenant_id, data_category, reference) where reference is not null;
create index if not exists concierge_requests_customer_idx
  on concierge_requests (tenant_id, data_category, customer_id, status);
create index if not exists concierge_requests_owner_idx
  on concierge_requests (tenant_id, data_category, owner_member_id, updated_at desc);
create index if not exists concierge_requests_partner_idx
  on concierge_requests (partner_team_id, status) where partner_team_id is not null;

create table if not exists concierge_request_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  data_category text not null check (data_category in ('sample','live')),
  request_id uuid not null,
  event_type text not null,
  from_status text,
  to_status text,
  actor_user_id uuid references app_users(id),
  body text,
  visibility text not null check (visibility in ('customer','broker','insurer')),
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text,
  created_at timestamptz not null default now(),
  foreign key (request_id, data_category) references concierge_requests (id, data_category)
);
create unique index if not exists concierge_events_idem_uidx
  on concierge_request_events (request_id, idempotency_key) where idempotency_key is not null;
create index if not exists concierge_events_request_idx
  on concierge_request_events (request_id, created_at);

-- ------------------------------------------------------------------ helpers
create or replace function app.my_partner_team_id() returns uuid
language sql stable security definer set search_path = public as $$
  select m.team_id from concierge_partner_members m where m.user_id = auth.uid() limit 1
$$;
revoke all on function app.my_partner_team_id() from public, anon;
grant execute on function app.my_partner_team_id() to authenticated;

create or replace function app.is_concierge_partner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from concierge_partner_members m where m.user_id = auth.uid())
$$;
revoke all on function app.is_concierge_partner() from public, anon;
grant execute on function app.is_concierge_partner() to authenticated;

create or replace function app.concierge_item_display_status(
  p_item_status text,
  p_details jsonb,
  p_quote_id uuid
) returns text
language sql immutable as $$
  select case
    when p_item_status = 'covered' then 'covered'
    when p_item_status in ('replaced','removed') then p_item_status
    when p_quote_id is not null
      or nullif(p_details->>'quote_id','') is not null
      or coalesce((p_details->>'quote_ready')::boolean, false)
      then 'awaiting_acceptance'
    when coalesce(p_details->>'awaiting_quote','true') = 'true'
      or coalesce(p_details->>'source','') = 'customer_request'
      then 'awaiting_quote'
    else 'awaiting_cover'
  end
$$;

-- ------------------------------------------------------------------ RLS
alter table customer_concierge_profiles enable row level security;
alter table concierge_partner_teams enable row level security;
alter table concierge_partner_members enable row level security;
alter table concierge_requests enable row level security;
alter table concierge_request_events enable row level security;

drop policy if exists ccp_staff on customer_concierge_profiles;
create policy ccp_staff on customer_concierge_profiles for all to authenticated
  using (tenant_id = app.tenant_id() and app.is_staff() and data_category = app.active_category())
  with check (tenant_id = app.tenant_id() and app.is_staff() and data_category = app.active_category());
drop policy if exists ccp_customer on customer_concierge_profiles;
create policy ccp_customer on customer_concierge_profiles for select to authenticated
  using (customer_id = app.my_customer_id() and data_category = app.active_category());

drop policy if exists cpt_staff on concierge_partner_teams;
create policy cpt_staff on concierge_partner_teams for all to authenticated
  using (tenant_id = app.tenant_id() and app.is_staff())
  with check (tenant_id = app.tenant_id() and app.is_staff());
drop policy if exists cpt_partner on concierge_partner_teams;
create policy cpt_partner on concierge_partner_teams for select to authenticated
  using (id = app.my_partner_team_id());

drop policy if exists cpm_staff on concierge_partner_members;
create policy cpm_staff on concierge_partner_members for all to authenticated
  using (tenant_id = app.tenant_id() and app.is_staff())
  with check (tenant_id = app.tenant_id() and app.is_staff());
drop policy if exists cpm_self on concierge_partner_members;
create policy cpm_self on concierge_partner_members for select to authenticated
  using (user_id = auth.uid());

drop policy if exists cr_staff on concierge_requests;
create policy cr_staff on concierge_requests for all to authenticated
  using (tenant_id = app.tenant_id() and app.is_staff() and data_category = app.active_category())
  with check (tenant_id = app.tenant_id() and app.is_staff() and data_category = app.active_category());
drop policy if exists cr_customer on concierge_requests;
create policy cr_customer on concierge_requests for select to authenticated
  using (customer_id = app.my_customer_id() and data_category = app.active_category());
drop policy if exists cr_partner on concierge_requests;
create policy cr_partner on concierge_requests for select to authenticated
  using (partner_team_id = app.my_partner_team_id() and partner_team_id is not null);

drop policy if exists cre_staff on concierge_request_events;
create policy cre_staff on concierge_request_events for all to authenticated
  using (tenant_id = app.tenant_id() and app.is_staff() and data_category = app.active_category())
  with check (tenant_id = app.tenant_id() and app.is_staff() and data_category = app.active_category());
drop policy if exists cre_customer on concierge_request_events;
create policy cre_customer on concierge_request_events for select to authenticated
  using (
    visibility = 'customer'
    and data_category = app.active_category()
    and exists (
      select 1 from concierge_requests r
      where r.id = request_id and r.customer_id = app.my_customer_id()
    )
  );
drop policy if exists cre_partner on concierge_request_events;
create policy cre_partner on concierge_request_events for select to authenticated
  using (
    visibility in ('customer','insurer')
    and exists (
      select 1 from concierge_requests r
      where r.id = request_id and r.partner_team_id = app.my_partner_team_id()
    )
  );

-- ------------------------------------------------------------------ RPC: customer home
create or replace function public.concierge_customer_home()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  cat text := coalesce(nullif(app.active_category(), 'denied'), 'sample');
  cust uuid := app.my_customer_id();
  t uuid := app.tenant_id();
  pid uuid;
  prof customer_concierge_profiles%rowtype;
  member sales_team_members%rowtype;
  brokerage jsonb;
begin
  if cust is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if cat = 'denied' then raise exception 'forbidden' using errcode = '42501'; end if;

  select cp.person_id into pid
    from customer_persons cp
   where cp.customer_id = cust and cp.data_category = cat and cp.is_primary
   order by cp.created_at limit 1;
  if pid is null then
    select cp.person_id into pid from customer_persons cp
     where cp.customer_id = cust and cp.data_category = cat limit 1;
  end if;

  select * into prof from customer_concierge_profiles
   where customer_id = cust and data_category = cat and enabled;
  if not found then
    return jsonb_build_object('enabled', false, 'reason', 'not_enrolled');
  end if;

  if prof.assigned_member_id is not null then
    select * into member from sales_team_members where id = prof.assigned_member_id;
  end if;

  select jsonb_build_object(
    'id', o.id, 'trading_name', coalesce(o.trading_name, o.name),
    'logo_url', o.logo_url, 'brand_image_url', o.brand_image_url
  ) into brokerage from organisations o where o.id = t;

  return jsonb_build_object(
    'enabled', true,
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
        'photo_url', i.details->>'photo_url',
        'policy_id', nullif(i.details->>'policy_id',''),
        'details', i.details
      ) order by case i.status when 'awaiting_cover' then 0 when 'covered' then 1 else 2 end, i.display_label)
      from insured_items i where i.person_id = pid and i.data_category = cat
        and i.status not in ('removed')
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
revoke all on function public.concierge_customer_home() from public, anon;
grant execute on function public.concierge_customer_home() to authenticated;

-- ------------------------------------------------------------------ RPC: request get
create or replace function public.concierge_request_get(p_request_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  cat text := coalesce(nullif(app.active_category(), 'denied'), 'sample');
  r concierge_requests%rowtype;
  vis text;
  is_partner boolean := app.is_concierge_partner();
  is_staff boolean := app.is_staff();
  is_cust boolean := app.my_customer_id() is not null;
begin
  select * into r from concierge_requests where id = p_request_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;

  if is_staff then
    if r.tenant_id is distinct from app.tenant_id() or r.data_category is distinct from cat then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    vis := 'broker';
  elsif is_partner then
    if r.partner_team_id is distinct from app.my_partner_team_id() then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    vis := 'insurer';
  elsif is_cust and r.customer_id = app.my_customer_id() then
    vis := 'customer';
  else
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'id', r.id,
    'reference', r.reference,
    'title', r.title,
    'request_kind', r.request_kind,
    'status', r.status,
    'next_action', r.next_action,
    'responsible_party', r.responsible_party,
    'person_id', r.person_id,
    'customer_id', r.customer_id,
    'customer_name', (select full_name from customers where id = r.customer_id),
    'insured_item_id', r.insured_item_id,
    'item_label', (select display_label from insured_items where id = r.insured_item_id),
    'policy_id', r.policy_id,
    'quote_id', r.quote_id,
    'owner_member_id', r.owner_member_id,
    'owner_name', (select full_name from sales_team_members where id = r.owner_member_id),
    'servicing_insurer_id', r.servicing_insurer_id,
    'servicing_insurer_name', (select name from insurers where id = r.servicing_insurer_id),
    'partner_team_id', r.partner_team_id,
    'partner_team_name', (select name from concierge_partner_teams where id = r.partner_team_id),
    'follow_up_at', r.follow_up_at,
    'outcome', r.outcome,
    'details', r.details,
    'created_at', r.created_at,
    'updated_at', r.updated_at,
    'viewer', vis,
    'concierge_name', (select m.full_name from sales_team_members m where m.id = r.owner_member_id),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id,
        'event_type', e.event_type,
        'from_status', e.from_status,
        'to_status', e.to_status,
        'body', e.body,
        'visibility', e.visibility,
        'payload', e.payload,
        'created_at', e.created_at,
        'author', (select full_name from app_users where id = e.actor_user_id)
      ) order by e.created_at)
      from concierge_request_events e
      where e.request_id = r.id
        and (
          (vis = 'broker')
          or (vis = 'customer' and e.visibility = 'customer')
          or (vis = 'insurer' and e.visibility in ('customer','insurer'))
        )
    ), '[]'::jsonb),
    'documents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'label', m.file_name, 'url', m.public_url,
        'kind', m.kind, 'created_at', m.created_at
      ) order by m.created_at)
      from media_assets m
      where m.owner_table = 'concierge_requests' and m.owner_id = r.id
    ), '[]'::jsonb),
    'pilot_partners', case when is_staff then coalesce((
      select jsonb_agg(jsonb_build_object(
        'team_id', t.id, 'name', t.name, 'insurer_id', t.insurer_id, 'insurer_name', i.name
      ) order by t.name)
      from concierge_partner_teams t
      join insurers i on i.id = t.insurer_id
      where t.tenant_id = r.tenant_id and t.is_pilot
    ), '[]'::jsonb) else '[]'::jsonb end
  );
end $$;
revoke all on function public.concierge_request_get(uuid) from public, anon;
grant execute on function public.concierge_request_get(uuid) to authenticated;

-- ------------------------------------------------------------------ RPC: create request
create or replace function public.concierge_request_create(
  p_request_kind text,
  p_title text,
  p_insured_item_id uuid,
  p_message text,
  p_details jsonb,
  p_idempotency_key text,
  p_new_item_label text,
  p_new_item_type text,
  p_declared_value numeric
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  cat text := coalesce(nullif(app.active_category(), 'denied'), 'sample');
  cust uuid := app.my_customer_id();
  t uuid := app.tenant_id();
  pid uuid;
  prof customer_concierge_profiles%rowtype;
  item_id uuid := p_insured_item_id;
  rid uuid;
  ref text;
  existing uuid;
  kind text := coalesce(nullif(p_request_kind,''), 'assist');
  title text := nullif(trim(p_title), '');
begin
  if cust is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into prof from customer_concierge_profiles
   where customer_id = cust and data_category = cat and enabled;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;

  select cp.person_id into pid from customer_persons cp
   where cp.customer_id = cust and cp.data_category = cat
   order by cp.is_primary desc, cp.created_at limit 1;

  if p_idempotency_key is not null then
    select request_id into existing from concierge_request_events
     where idempotency_key = p_idempotency_key limit 1;
    if existing is not null then
      return public.concierge_request_get(existing) || jsonb_build_object('outcome','replayed');
    end if;
  end if;

  if kind = 'add_item' and item_id is null then
    if nullif(trim(p_new_item_label),'') is null then
      raise exception 'display_label required' using errcode = '22023';
    end if;
    insert into insured_items (tenant_id, data_category, person_id, item_type, status, display_label, details)
    values (
      t, cat, pid, coalesce(nullif(p_new_item_type,''),'equipment'), 'awaiting_cover',
      trim(p_new_item_label),
      coalesce(p_details, '{}'::jsonb) || jsonb_build_object(
        'source','customer_request','declared_value', p_declared_value, 'awaiting_quote', true
      )
    ) returning id into item_id;
    title := coalesce(title, 'Add '||trim(p_new_item_label)||' to cover');
  end if;

  if title is null then
    title := case kind
      when 'callback' then 'Request a call'
      when 'add_item' then 'Add an item to insure'
      else 'Ask my concierge' end;
  end if;

  ref := app.next_number(t, 'concierge_request', cat);
  insert into concierge_requests (
    tenant_id, data_category, reference, person_id, customer_id, insured_item_id,
    request_kind, title, status, next_action, responsible_party, owner_member_id,
    details, created_by
  ) values (
    t, cat, ref, pid, cust, item_id, kind, title,
    'received', 'Lerato will review your request', 'concierge',
    prof.assigned_member_id, coalesce(p_details, '{}'::jsonb), auth.uid()
  ) returning id into rid;

  insert into concierge_request_events (
    tenant_id, data_category, request_id, event_type, to_status, actor_user_id,
    body, visibility, payload, idempotency_key
  ) values (
    t, cat, rid, 'created', 'received', auth.uid(),
    coalesce(nullif(p_message,''), 'Request opened'),
    'customer', jsonb_build_object('item_id', item_id), p_idempotency_key
  );

  update concierge_requests set
    status = 'with_concierge',
    next_action = coalesce(
      (select 'With '||full_name from sales_team_members where id = prof.assigned_member_id),
      'With your concierge'
    ),
    responsible_party = 'concierge',
    updated_at = now()
  where id = rid;

  insert into concierge_request_events (
    tenant_id, data_category, request_id, event_type, from_status, to_status, actor_user_id,
    body, visibility
  ) values (
    t, cat, rid, 'status', 'received', 'with_concierge', auth.uid(),
    'With your concierge', 'customer'
  );

  return public.concierge_request_get(rid) || jsonb_build_object('outcome','created');
end $$;
revoke all on function public.concierge_request_create(text, text, uuid, text, jsonb, text, text, text, numeric) from public, anon;
grant execute on function public.concierge_request_create(text, text, uuid, text, jsonb, text, text, text, numeric) to authenticated;

-- ------------------------------------------------------------------ RPC: message / upload / callback
create or replace function public.concierge_request_message(
  p_request_id uuid,
  p_body text,
  p_visibility text,
  p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r concierge_requests%rowtype;
  cat text;
  vis text := coalesce(nullif(p_visibility,''), 'customer');
begin
  select * into r from concierge_requests where id = p_request_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  cat := r.data_category;

  if app.is_staff() then
    if r.tenant_id is distinct from app.tenant_id() then raise exception 'forbidden' using errcode = '42501'; end if;
  elsif r.customer_id = app.my_customer_id() then
    vis := 'customer';
  elsif app.is_concierge_partner() and r.partner_team_id = app.my_partner_team_id() then
    vis := 'insurer';
  else
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_idempotency_key is not null and exists (
    select 1 from concierge_request_events where request_id = r.id and idempotency_key = p_idempotency_key
  ) then
    return public.concierge_request_get(r.id) || jsonb_build_object('outcome','replayed');
  end if;

  insert into concierge_request_events (
    tenant_id, data_category, request_id, event_type, actor_user_id, body, visibility, idempotency_key
  ) values (r.tenant_id, cat, r.id, 'message', auth.uid(), nullif(trim(p_body),''), vis, p_idempotency_key);

  if app.my_customer_id() = r.customer_id then
    update concierge_requests set
      status = 'with_concierge',
      responsible_party = 'concierge',
      next_action = coalesce(
        (select 'With '||full_name from sales_team_members where id = r.owner_member_id),
        'With your concierge'
      ),
      updated_at = now()
    where id = r.id;
  elsif app.is_staff() then
    update concierge_requests set updated_at = now() where id = r.id;
  end if;

  return public.concierge_request_get(r.id) || jsonb_build_object('outcome','ok');
end $$;
revoke all on function public.concierge_request_message(uuid, text, text, text) from public, anon;
grant execute on function public.concierge_request_message(uuid, text, text, text) to authenticated;

create or replace function public.concierge_request_upload_doc(
  p_request_id uuid,
  p_label text,
  p_url text,
  p_media_asset_id uuid,
  p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r concierge_requests%rowtype;
  asset uuid := p_media_asset_id;
  owner_name text;
begin
  select * into r from concierge_requests where id = p_request_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if r.customer_id is distinct from app.my_customer_id() and not app.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_idempotency_key is not null and exists (
    select 1 from concierge_request_events where request_id = r.id and idempotency_key = p_idempotency_key
  ) then
    return public.concierge_request_get(r.id) || jsonb_build_object('outcome','replayed');
  end if;

  if asset is null and nullif(p_url,'') is not null then
    insert into media_assets (
      tenant_id, bucket, kind, purpose, file_name, storage_path, public_url, owner_table, owner_id, uploaded_by
    ) values (
      r.tenant_id, 'media-docs', 'document', 'concierge_receipt',
      coalesce(p_label, 'Document'),
      'concierge/'||r.id::text||'/'||coalesce(p_label, 'document'),
      p_url, 'concierge_requests', r.id, auth.uid()
    ) returning id into asset;
  elsif asset is not null then
    update media_assets set owner_table = 'concierge_requests', owner_id = r.id where id = asset;
  end if;

  select full_name into owner_name from sales_team_members where id = r.owner_member_id;

  insert into concierge_request_events (
    tenant_id, data_category, request_id, event_type, from_status, to_status, actor_user_id,
    body, visibility, payload, idempotency_key
  ) values (
    r.tenant_id, r.data_category, r.id, 'document', r.status, 'with_concierge', auth.uid(),
    'Receipt received · With '||coalesce(owner_name, 'your concierge'),
    'customer',
    jsonb_build_object('media_asset_id', asset, 'label', p_label, 'url', p_url),
    p_idempotency_key
  );

  update concierge_requests set
    status = 'with_concierge',
    responsible_party = 'concierge',
    next_action = 'Receipt received · With '||coalesce(owner_name, 'your concierge'),
    updated_at = now()
  where id = r.id;

  return public.concierge_request_get(r.id) || jsonb_build_object('outcome','uploaded');
end $$;
revoke all on function public.concierge_request_upload_doc(uuid, text, text, uuid, text) from public, anon;
grant execute on function public.concierge_request_upload_doc(uuid, text, text, uuid, text) to authenticated;

-- ------------------------------------------------------------------ RPC: broker queue + actions
create or replace function public.concierge_broker_queue(p_person_id uuid, p_status text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  cat text := coalesce(nullif(app.active_category(), 'denied'), 'sample');
begin
  if not app.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'reference', r.reference,
        'title', r.title,
        'status', r.status,
        'next_action', r.next_action,
        'responsible_party', r.responsible_party,
        'customer_id', r.customer_id,
        'customer_name', c.full_name,
        'person_id', r.person_id,
        'owner_member_id', r.owner_member_id,
        'owner_name', m.full_name,
        'servicing_insurer_id', r.servicing_insurer_id,
        'servicing_partner', i.name,
        'partner_team_id', r.partner_team_id,
        'follow_up_at', r.follow_up_at,
        'created_at', r.created_at,
        'updated_at', r.updated_at,
        'age_hours', extract(epoch from (now() - r.created_at))/3600.0
      ) order by case r.status when 'action_needed' then 0 when 'received' then 1 when 'with_concierge' then 2 when 'with_insurer' then 3 else 4 end, r.updated_at desc)
      from concierge_requests r
      join customers c on c.id = r.customer_id
      left join sales_team_members m on m.id = r.owner_member_id
      left join insurers i on i.id = r.servicing_insurer_id
      where r.tenant_id = app.tenant_id() and r.data_category = cat
        and (p_person_id is null or r.person_id = p_person_id)
        and (p_status is null or p_status = '' or r.status = p_status)
        and r.status not in ('withdrawn')
    ), '[]'::jsonb)
  );
end $$;
revoke all on function public.concierge_broker_queue(uuid, text) from public, anon;
grant execute on function public.concierge_broker_queue(uuid, text) to authenticated;

create or replace function public.concierge_assign(p_request_id uuid, p_member_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare r concierge_requests%rowtype; nm text;
begin
  if not app.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into r from concierge_requests where id = p_request_id and tenant_id = app.tenant_id();
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select full_name into nm from sales_team_members where id = p_member_id;
  update concierge_requests set owner_member_id = p_member_id, updated_at = now() where id = r.id;
  insert into concierge_request_events (
    tenant_id, data_category, request_id, event_type, actor_user_id, body, visibility, payload
  ) values (
    r.tenant_id, r.data_category, r.id, 'assignment', auth.uid(),
    'Assigned to '||coalesce(nm,'team'), 'broker',
    jsonb_build_object('owner_member_id', p_member_id)
  );
  return public.concierge_request_get(r.id);
end $$;
revoke all on function public.concierge_assign(uuid, uuid) from public, anon;
grant execute on function public.concierge_assign(uuid, uuid) to authenticated;

create or replace function public.concierge_request_info(
  p_request_id uuid,
  p_next_action text,
  p_customer_message text,
  p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r concierge_requests%rowtype;
begin
  if not app.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into r from concierge_requests where id = p_request_id and tenant_id = app.tenant_id();
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;

  if p_idempotency_key is not null and exists (
    select 1 from concierge_request_events where request_id = r.id and idempotency_key = p_idempotency_key
  ) then return public.concierge_request_get(r.id) || jsonb_build_object('outcome','replayed'); end if;

  update concierge_requests set
    status = 'action_needed',
    responsible_party = 'customer',
    next_action = coalesce(nullif(p_next_action,''), 'Your action needed'),
    updated_at = now()
  where id = r.id;

  insert into concierge_request_events (
    tenant_id, data_category, request_id, event_type, from_status, to_status, actor_user_id,
    body, visibility, idempotency_key
  ) values (
    r.tenant_id, r.data_category, r.id, 'info_request', r.status, 'action_needed', auth.uid(),
    coalesce(nullif(p_customer_message,''), p_next_action, 'Please provide the requested information.'),
    'customer', p_idempotency_key
  );

  return public.concierge_request_get(r.id) || jsonb_build_object('outcome','ok');
end $$;
revoke all on function public.concierge_request_info(uuid, text, text, text) from public, anon;
grant execute on function public.concierge_request_info(uuid, text, text, text) to authenticated;

create or replace function public.concierge_refer_partner(
  p_request_id uuid,
  p_team_id uuid,
  p_note text,
  p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r concierge_requests%rowtype;
  team concierge_partner_teams%rowtype;
  iname text;
begin
  if not app.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into r from concierge_requests where id = p_request_id and tenant_id = app.tenant_id();
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into team from concierge_partner_teams where id = p_team_id and tenant_id = r.tenant_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select name into iname from insurers where id = team.insurer_id;

  if p_idempotency_key is not null and exists (
    select 1 from concierge_request_events where request_id = r.id and idempotency_key = p_idempotency_key
  ) then return public.concierge_request_get(r.id) || jsonb_build_object('outcome','replayed'); end if;

  update concierge_requests set
    status = 'with_insurer',
    responsible_party = 'insurer',
    servicing_insurer_id = team.insurer_id,
    partner_team_id = team.id,
    next_action = 'With '||coalesce(iname, team.name),
    updated_at = now()
  where id = r.id;

  insert into concierge_request_events (
    tenant_id, data_category, request_id, event_type, from_status, to_status, actor_user_id,
    body, visibility, payload, idempotency_key
  ) values (
    r.tenant_id, r.data_category, r.id, 'referral', r.status, 'with_insurer', auth.uid(),
    coalesce(nullif(p_note,''), 'Referred to '||coalesce(iname, team.name)),
    'customer',
    jsonb_build_object('team_id', team.id, 'insurer_id', team.insurer_id),
    p_idempotency_key
  );
  insert into concierge_request_events (
    tenant_id, data_category, request_id, event_type, actor_user_id, body, visibility, payload
  ) values (
    r.tenant_id, r.data_category, r.id, 'referral_internal', auth.uid(),
    coalesce(nullif(p_note,''), 'Partner referral'),
    'insurer', jsonb_build_object('team_id', team.id)
  );

  return public.concierge_request_get(r.id) || jsonb_build_object('outcome','referred');
end $$;
revoke all on function public.concierge_refer_partner(uuid, uuid, text, text) from public, anon;
grant execute on function public.concierge_refer_partner(uuid, uuid, text, text) to authenticated;

create or replace function public.concierge_record_outcome(
  p_request_id uuid,
  p_outcome_summary text,
  p_mark_completed boolean
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r concierge_requests%rowtype;
begin
  if not app.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into r from concierge_requests where id = p_request_id and tenant_id = app.tenant_id();
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;

  update concierge_requests set
    outcome = coalesce(outcome, '{}'::jsonb) || jsonb_build_object(
      'summary', p_outcome_summary, 'recorded_at', now()
    ),
    status = case when coalesce(p_mark_completed, false) then 'completed' else status end,
    next_action = case when coalesce(p_mark_completed, false) then 'Completed' else next_action end,
    responsible_party = case when coalesce(p_mark_completed, false) then 'system' else responsible_party end,
    updated_at = now()
  where id = r.id;

  insert into concierge_request_events (
    tenant_id, data_category, request_id, event_type, from_status, to_status, actor_user_id,
    body, visibility
  ) values (
    r.tenant_id, r.data_category, r.id, 'outcome', r.status,
    case when coalesce(p_mark_completed, false) then 'completed' else r.status end,
    auth.uid(), p_outcome_summary, 'customer'
  );

  return public.concierge_request_get(r.id);
end $$;
revoke all on function public.concierge_record_outcome(uuid, text, boolean) from public, anon;
grant execute on function public.concierge_record_outcome(uuid, text, boolean) to authenticated;

-- ------------------------------------------------------------------ RPC: partner queue + quote
create or replace function public.concierge_partner_queue()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare team uuid := app.my_partner_team_id();
begin
  if team is null then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'team_id', team,
    'team_name', (select name from concierge_partner_teams where id = team),
    'insurer_name', (
      select i.name from concierge_partner_teams t join insurers i on i.id = t.insurer_id where t.id = team
    ),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'reference', r.reference,
        'title', r.title,
        'status', r.status,
        'next_action', r.next_action,
        'customer_name', c.full_name,
        'concierge_name', m.full_name,
        'item_label', ii.display_label,
        'updated_at', r.updated_at,
        'created_at', r.created_at
      ) order by r.updated_at desc)
      from concierge_requests r
      join customers c on c.id = r.customer_id
      left join sales_team_members m on m.id = r.owner_member_id
      left join insured_items ii on ii.id = r.insured_item_id
      where r.partner_team_id = team and r.status = 'with_insurer'
    ), '[]'::jsonb)
  );
end $$;
revoke all on function public.concierge_partner_queue() from public, anon;
grant execute on function public.concierge_partner_queue() to authenticated;

create or replace function public.concierge_partner_return_quote(
  p_request_id uuid,
  p_monthly_premium numeric,
  p_sum_insured numeric,
  p_option_label text,
  p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r concierge_requests%rowtype;
  team uuid := app.my_partner_team_id();
  qid uuid;
  oid uuid;
  label text := coalesce(nullif(p_option_label,''), 'Pilot quote');
begin
  if team is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into r from concierge_requests where id = p_request_id and partner_team_id = team;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;

  if p_idempotency_key is not null and exists (
    select 1 from concierge_request_events where request_id = r.id and idempotency_key = p_idempotency_key
  ) then return public.concierge_request_get(r.id) || jsonb_build_object('outcome','replayed'); end if;

  insert into quotes (
    tenant_id, customer_id, product_category, risk_summary, status, is_simulated,
    created_by, data_category, released_at
  ) values (
    r.tenant_id, r.customer_id, 'contents',
    jsonb_build_object('concierge_request_id', r.id, 'item_id', r.insured_item_id),
    'released', true, auth.uid(), r.data_category, now()
  ) returning id into qid;

  insert into quote_options (
    tenant_id, quote_id, insurer_id, option_label, monthly_premium, annual_premium,
    sum_insured, excess, expires_at, source, is_simulated
  ) values (
    r.tenant_id, qid, r.servicing_insurer_id, label,
    coalesce(p_monthly_premium, 189), coalesce(p_monthly_premium, 189) * 12,
    coalesce(p_sum_insured, 45000), 1500, now() + interval '30 days',
    'concierge_pilot', true
  ) returning id into oid;

  if r.insured_item_id is not null then
    update insured_items set
      details = details || jsonb_build_object(
        'quote_id', qid, 'quote_option_id', oid, 'quote_ready', true, 'awaiting_quote', false
      ),
      updated_at = now()
    where id = r.insured_item_id;
    -- Cover status stays awaiting_cover until a policy confirms cover.
  end if;

  update concierge_requests set
    quote_id = qid,
    status = 'with_concierge',
    responsible_party = 'concierge',
    next_action = 'Quote ready · With your concierge',
    outcome = coalesce(outcome, '{}'::jsonb) || jsonb_build_object(
      'quote_id', qid, 'quote_option_id', oid, 'returned_at', now()
    ),
    updated_at = now()
  where id = r.id;

  insert into concierge_request_events (
    tenant_id, data_category, request_id, event_type, from_status, to_status, actor_user_id,
    body, visibility, payload, idempotency_key
  ) values (
    r.tenant_id, r.data_category, r.id, 'quote_returned', 'with_insurer', 'with_concierge', auth.uid(),
    'Sample quote returned — awaiting customer acceptance',
    'customer',
    jsonb_build_object('quote_id', qid, 'option_id', oid, 'monthly_premium', coalesce(p_monthly_premium, 189)),
    p_idempotency_key
  );

  return public.concierge_request_get(r.id) || jsonb_build_object(
    'outcome', 'quoted', 'quote_id', qid, 'option_id', oid
  );
end $$;
revoke all on function public.concierge_partner_return_quote(uuid, numeric, numeric, text, text) from public, anon;
grant execute on function public.concierge_partner_return_quote(uuid, numeric, numeric, text, text) to authenticated;

-- ------------------------------------------------------------------ VIP demo seed
do $$
declare
  v_tenant uuid := 'a0000000-0000-4000-8000-000000000001';
  v_cat text := 'sample';
  v_cust uuid := 'a0000000-0000-4000-8000-000000000310';
  v_person uuid := 'c0000000-0000-4000-8000-000000000310';
  v_user_cust uuid := 'a0000000-0000-4000-8000-000000000210';
  v_user_lerato uuid := 'a0000000-0000-4000-8000-000000000211';
  v_user_protea uuid := 'a0000000-0000-4000-8000-000000000212';
  v_user_karoo uuid := 'a0000000-0000-4000-8000-000000000213';
  v_member uuid := 'a0000000-0000-4000-8000-000000000711';
  v_team_protea uuid := 'a0000000-0000-4000-8000-000000000801';
  v_team_karoo uuid := 'a0000000-0000-4000-8000-000000000802';
  v_item_car uuid := 'a0000000-0000-4000-8000-000000000321';
  v_item_home uuid := 'a0000000-0000-4000-8000-000000000322';
  v_item_cam uuid := 'a0000000-0000-4000-8000-000000000323';
  v_req uuid := 'a0000000-0000-4000-8000-000000000901';
  v_protea uuid := 'a0000000-0000-4000-8000-000000000101';
  v_karoo uuid := 'a0000000-0000-4000-8000-000000000102';
  v_pw text;
  v_inst uuid;
begin
  select encrypted_password, instance_id into v_pw, v_inst
    from auth.users where id = 'a0000000-0000-4000-8000-000000000201';

  -- Auth users (copy demo staff password)
  if v_pw is not null then
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      confirmation_token, recovery_token, email_change_token_new, email_change_token_current,
      reauthentication_token, email_change, phone_change, phone_change_token,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    )
    select x.id, coalesce(v_inst, '00000000-0000-0000-0000-000000000000'::uuid), 'authenticated', 'authenticated',
           x.email, v_pw, now(),
           '', '', '', '', '', '', '', '',
           '{"provider":"email","providers":["email"]}'::jsonb,
           jsonb_build_object('full_name', x.full_name, 'email_verified', true),
           now(), now()
      from (values
        (v_user_cust, 'naledi.vip@example.demo', 'Naledi'),
        (v_user_lerato, 'lerato.mokoena@bcovered.demo', 'Lerato Mokoena'),
        (v_user_protea, 'protea.desk@bcovered.demo', 'Protea Concierge Desk'),
        (v_user_karoo, 'karoo.desk@bcovered.demo', 'Karoo Concierge Desk')
      ) as x(id, email, full_name)
     where not exists (select 1 from auth.users u where u.id = x.id or lower(u.email) = lower(x.email));

    insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    select gen_random_uuid(), x.id,
           jsonb_build_object('sub', x.id::text, 'email', x.email, 'email_verified', true, 'phone_verified', false),
           'email', x.id::text, now(), now(), now()
      from (values
        (v_user_cust, 'naledi.vip@example.demo'),
        (v_user_lerato, 'lerato.mokoena@bcovered.demo'),
        (v_user_protea, 'protea.desk@bcovered.demo'),
        (v_user_karoo, 'karoo.desk@bcovered.demo')
      ) as x(id, email)
     where exists (select 1 from auth.users u where u.id = x.id)
       and not exists (select 1 from auth.identities i where i.user_id = x.id and i.provider = 'email');
  end if;

  -- Customer Naledi
  insert into customers (
    id, tenant_id, customer_type, full_name, email, phone, region, status,
    is_synthetic, data_origin, data_category, account_number
  ) values (
    v_cust, v_tenant, 'personal', 'Naledi', 'naledi.vip@example.demo', '0825550190', 'Gauteng', 'active',
    true, 'demo', v_cat, 'AC-S-VIP-NALEDI'
  ) on conflict (id, data_category) do update set email = excluded.email, full_name = excluded.full_name;

  insert into persons (
    id, tenant_id, data_category, first_names, surname, preferred_name, client_number, is_synthetic, contact_stage
  ) values (
    v_person, v_tenant, v_cat, 'Naledi', 'VIP', 'Naledi', 'CL-S-VIP-NALEDI', true, 'client'
  ) on conflict (id, data_category) do update set preferred_name = 'Naledi';

  if not exists (
    select 1 from customer_persons
     where customer_id = v_cust and person_id = v_person and role = 'self' and data_category = v_cat
  ) then
    insert into customer_persons (tenant_id, customer_id, person_id, role, is_primary, data_category)
    values (v_tenant, v_cust, v_person, 'self', true, v_cat);
  end if;

  insert into app_users (id, tenant_id, email, full_name, role, customer_id)
  values (v_user_cust, v_tenant, 'naledi.vip@example.demo', 'Naledi', 'customer', v_cust)
  on conflict (id) do update set customer_id = excluded.customer_id, role = 'customer', email = excluded.email;

  -- Concierge Lerato Mokoena
  insert into app_users (id, tenant_id, email, full_name, role, customer_id, active_organisation_id)
  values (v_user_lerato, v_tenant, 'lerato.mokoena@bcovered.demo', 'Lerato Mokoena', 'broker', null, v_tenant)
  on conflict (id) do update set role = 'broker', full_name = excluded.full_name, active_organisation_id = v_tenant;

  insert into organisation_memberships (tenant_id, user_id, role, status)
  select v_tenant, v_user_lerato, 'representative', 'active'
   where not exists (
     select 1 from organisation_memberships m where m.tenant_id = v_tenant and m.user_id = v_user_lerato and m.status = 'active'
   );

  insert into sales_team_members (
    id, tenant_id, user_id, full_name, email, phone, sales_role, referral_code, status
  ) values (
    v_member, v_tenant, v_user_lerato, 'Lerato Mokoena', 'lerato.mokoena@bcovered.demo', '0115550188',
    'broker', 'LM-VIP1', 'active'
  ) on conflict (id) do update set user_id = excluded.user_id, status = 'active';

  insert into customer_concierge_profiles (
    id, tenant_id, data_category, customer_id, enabled, assigned_member_id, team_queue_key
  ) values (
    'a0000000-0000-4000-8000-000000000701', v_tenant, v_cat, v_cust, true, v_member, 'vip-desk'
  ) on conflict (customer_id, data_category) do update
    set enabled = true, assigned_member_id = v_member, updated_at = now();

  -- Items
  insert into insured_items (id, tenant_id, data_category, person_id, item_type, status, display_label, details)
  values
    (v_item_car, v_tenant, v_cat, v_person, 'vehicle', 'covered', 'Toyota Fortuner',
     '{"make":"Toyota","model":"Fortuner","year":2022,"photo_url":null}'::jsonb),
    (v_item_home, v_tenant, v_cat, v_person, 'building', 'covered', 'Parkhurst home',
     '{"risk_address":"Parkhurst, Johannesburg","photo_url":null}'::jsonb),
    (v_item_cam, v_tenant, v_cat, v_person, 'equipment', 'awaiting_cover', 'Camera equipment',
     '{"source":"customer_request","declared_value":45000,"awaiting_quote":true,"description":"DSLR kit"}'::jsonb)
  on conflict (id, data_category) do update set display_label = excluded.display_label, status = excluded.status, details = excluded.details;

  -- Open request needing receipt
  insert into concierge_requests (
    id, tenant_id, data_category, reference, person_id, customer_id, insured_item_id,
    request_kind, title, status, next_action, responsible_party, owner_member_id, created_by, details
  ) values (
    v_req, v_tenant, v_cat, 'CG-S-1001', v_person, v_cust, v_item_cam,
    'add_item', 'Add my camera to cover', 'action_needed', 'Upload receipt', 'customer',
    v_member, v_user_lerato,
    '{"reason":"proof_of_purchase"}'::jsonb
  ) on conflict (id, data_category) do update
    set status = 'action_needed', next_action = 'Upload receipt', responsible_party = 'customer',
        owner_member_id = v_member, updated_at = now();

  if not exists (select 1 from concierge_request_events where request_id = v_req) then
    insert into concierge_request_events (
      tenant_id, data_category, request_id, event_type, to_status, actor_user_id, body, visibility
    ) values
      (v_tenant, v_cat, v_req, 'created', 'received', v_user_cust, 'Naledi asked to add camera equipment', 'customer'),
      (v_tenant, v_cat, v_req, 'info_request', 'action_needed', v_user_lerato,
       'Lerato has asked for proof of purchase.', 'customer');
  end if;

  -- Partner teams + members
  insert into concierge_partner_teams (id, tenant_id, insurer_id, name, is_pilot)
  values
    (v_team_protea, v_tenant, v_protea, 'Protea VIP service desk', true),
    (v_team_karoo, v_tenant, v_karoo, 'Karoo VIP service desk', true)
  on conflict (tenant_id, insurer_id) do update set name = excluded.name, is_pilot = true;

  insert into app_users (id, tenant_id, email, full_name, role, customer_id)
  values
    (v_user_protea, v_tenant, 'protea.desk@bcovered.demo', 'Protea Concierge Desk', 'insurer_partner', null),
    (v_user_karoo, v_tenant, 'karoo.desk@bcovered.demo', 'Karoo Concierge Desk', 'insurer_partner', null)
  on conflict (id) do update set role = 'insurer_partner', full_name = excluded.full_name;

  insert into concierge_partner_members (id, tenant_id, team_id, user_id)
  values
    ('a0000000-0000-4000-8000-000000000811', v_tenant, v_team_protea, v_user_protea),
    ('a0000000-0000-4000-8000-000000000812', v_tenant, v_team_karoo, v_user_karoo)
  on conflict (team_id, user_id) do nothing;
end $$;
