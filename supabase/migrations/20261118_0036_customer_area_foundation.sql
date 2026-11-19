-- Customer Area foundation: franchisees as ordinary businesses with roles,
-- party relationships, and broker-owned conversation links.
-- Apply after 20261117_0035_copilot_create_business_client.sql.

-- ------------------------------------------------------------------ 1. Business roles (multi-role organisations)
create table if not exists business_roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  data_category text not null check (data_category in ('sample','live')),
  customer_id uuid not null,
  role text not null check (role in (
    'commercial_client','franchisee','referral_partner','brokerage','insurer','platform_operator','other'
  )),
  created_at timestamptz not null default now(),
  unique (tenant_id, data_category, customer_id, role),
  foreign key (customer_id, data_category) references customers (id, data_category)
);
create index if not exists business_roles_customer_idx on business_roles (customer_id, data_category);
alter table business_roles enable row level security;

drop policy if exists business_roles_staff on business_roles;
create policy business_roles_staff on business_roles for all
  using (tenant_id = app.tenant_id() and app.is_staff() and coalesce(app.member_role(), '') not in ('outlet_manager','outlet_staff'))
  with check (tenant_id = app.tenant_id() and app.is_staff() and coalesce(app.member_role(), '') not in ('outlet_manager','outlet_staff'));

-- ------------------------------------------------------------------ 2. Party relationships (people ↔ businesses ↔ businesses)
create table if not exists party_relationships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  data_category text not null check (data_category in ('sample','live')),
  from_type text not null check (from_type in ('person','business')),
  from_id uuid not null,
  to_type text not null check (to_type in ('person','business')),
  to_id uuid not null,
  role text not null,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  unique (tenant_id, data_category, from_type, from_id, to_type, to_id, role)
);
create index if not exists party_relationships_from_idx on party_relationships (tenant_id, data_category, from_type, from_id);
create index if not exists party_relationships_to_idx on party_relationships (tenant_id, data_category, to_type, to_id);
alter table party_relationships enable row level security;

drop policy if exists party_relationships_staff on party_relationships;
create policy party_relationships_staff on party_relationships for all
  using (tenant_id = app.tenant_id() and app.is_staff() and coalesce(app.member_role(), '') not in ('outlet_manager','outlet_staff'))
  with check (tenant_id = app.tenant_id() and app.is_staff() and coalesce(app.member_role(), '') not in ('outlet_manager','outlet_staff'));

-- ------------------------------------------------------------------ 3. Franchise partner ↔ commercial customer
alter table franchise_partners
  add column if not exists customer_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'franchise_partners_customer_category_fkey'
  ) then
    alter table franchise_partners
      add constraint franchise_partners_customer_category_fkey
      foreign key (customer_id, data_category) references customers (id, data_category);
  end if;
end $$;

create unique index if not exists franchise_partners_customer_uidx
  on franchise_partners (tenant_id, data_category, customer_id)
  where customer_id is not null;

-- ------------------------------------------------------------------ 4. Conversation ownership + multi-record links
alter table conversations
  add column if not exists responsible_member_id uuid references sales_team_members(id),
  add column if not exists created_by_user_id uuid references app_users(id),
  add column if not exists visibility text,
  add column if not exists person_id uuid,
  add column if not exists business_customer_id uuid;

update conversations set visibility = case when channel = 'broker' then 'internal' else 'customer' end
 where visibility is null;

alter table conversations alter column visibility set default 'internal';
alter table conversations alter column visibility set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'conversations_visibility_check'
  ) then
    alter table conversations
      add constraint conversations_visibility_check
      check (visibility in ('customer','internal'));
  end if;
end $$;

create table if not exists conversation_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  conversation_id uuid not null references conversations(id) on delete cascade,
  link_type text not null check (link_type in ('person','business','quote','policy','lead','enquiry','selection')),
  link_id uuid not null,
  created_at timestamptz not null default now(),
  unique (conversation_id, link_type, link_id)
);
create index if not exists conversation_links_lookup_idx on conversation_links (tenant_id, link_type, link_id);
alter table conversation_links enable row level security;

drop policy if exists conversation_links_staff on conversation_links;
create policy conversation_links_staff on conversation_links for all
  using (tenant_id = app.tenant_id() and app.is_staff() and coalesce(app.member_role(), '') not in ('outlet_manager','outlet_staff'))
  with check (tenant_id = app.tenant_id() and app.is_staff() and coalesce(app.member_role(), '') not in ('outlet_manager','outlet_staff'));

-- ------------------------------------------------------------------ 5. Ensure commercial account when setting up a franchisee
create or replace function app.ensure_franchise_business(
  p_tenant uuid,
  p_category text,
  p_name text,
  p_customer_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_customer customers;
  v_bp business_profiles;
  v_name text := trim(coalesce(p_name, ''));
begin
  if p_customer_id is not null then
    select * into v_customer from customers where id = p_customer_id and tenant_id = p_tenant and data_category = p_category;
    if v_customer.id is null then
      raise exception using message = 'not_found', detail = 'That business account was not found in this workspace.';
    end if;
  else
    select cust.* into v_customer
      from customers cust
      join business_profiles bpf on bpf.customer_id = cust.id and bpf.data_category = cust.data_category
     where cust.tenant_id = p_tenant and cust.data_category = p_category and cust.customer_type = 'commercial'
       and (
         lower(cust.full_name) = lower(v_name)
         or lower(coalesce(bpf.trading_name, '')) = lower(v_name)
         or lower(bpf.registered_name) = lower(v_name)
       )
     order by cust.created_at
     limit 1;

    if v_customer.id is null then
      insert into customers (tenant_id, customer_type, full_name, status, is_synthetic, created_by, data_origin, data_category)
      values (
        p_tenant, 'commercial', v_name, 'prospect', p_category = 'sample', auth.uid(),
        case p_category when 'sample' then 'demo' else 'live' end, p_category
      )
      returning * into v_customer;

      insert into business_profiles (
        tenant_id, customer_id, registered_name, trading_name, industry_key, activities_summary,
        operating_regions, field_sources, missing_info, status, assigned_broker_id, is_synthetic, created_by, data_category
      ) values (
        p_tenant, v_customer.id, v_name, v_name, 'professional_services', 'Franchise partner business.',
        '[]'::jsonb,
        jsonb_build_object('registered_name', 'declared', 'trading_name', 'declared', 'industry_key', 'inferred'),
        jsonb_build_array('Company registration number', 'Primary contact'),
        'discovery', auth.uid(), p_category = 'sample', auth.uid(), p_category
      )
      returning * into v_bp;
    end if;
  end if;

  insert into business_roles (tenant_id, data_category, customer_id, role)
  values (p_tenant, p_category, v_customer.id, 'commercial_client')
  on conflict do nothing;

  insert into business_roles (tenant_id, data_category, customer_id, role)
  values (p_tenant, p_category, v_customer.id, 'franchisee')
  on conflict do nothing;

  return v_customer.id;
end $$;

revoke all on function app.ensure_franchise_business(uuid, text, text, uuid) from public, anon;

-- ------------------------------------------------------------------ 6. franchise_setup: attach commercial customer + franchisee role
drop function if exists public.franchise_setup(text, text, text, text, text, uuid, text, text, text, text, text, uuid, text);
drop function if exists public.franchise_setup(text, text, text, text, text, uuid, text, text, text, text, text, uuid, text, uuid);

create or replace function public.franchise_setup(p_category text, p_partner_name text, p_idempotency_key text,
  p_outlet_name text default null, p_service_area text default null, p_receiving_member_id uuid default null,
  p_receiving_member_name text default null, p_sales_mode text default null, p_manager_name text default null,
  p_manager_email text default null, p_manager_phone text default null, p_partner_id uuid default null,
  p_copilot text default 'workspace', p_customer_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare t uuid := sales_guard(p_category, true); replay jsonb := copilot_replay(p_idempotency_key);
  p franchise_partners; o franchise_outlets; s franchise_outlet_staff; recv uuid; pick jsonb; token text; n int; receipt jsonb;
  v_partner text := nullif(trim(coalesce(p_partner_name, '')), ''); v_outlet text := nullif(trim(coalesce(p_outlet_name, '')), '');
  v_area text := nullif(trim(coalesce(p_service_area, '')), ''); v_mgr text := nullif(trim(coalesce(p_manager_name, '')), '');
  v_email text := nullif(lower(trim(coalesce(p_manager_email, ''))), ''); partner_new boolean := false; outlet_new boolean := false;
  biz uuid; bp_id uuid;
begin
  if replay is not null then return replay; end if;
  if not app.can_manage_team() then
    raise exception using message = 'forbidden', detail = 'Only the broker (brokerage owner or administrator) can set up franchisees and outlets.';
  end if;
  if p_sales_mode is not null and p_sales_mode not in ('refer','sell') then
    raise exception using message = 'validation', detail = 'Sales mode must be "refer" (refer to broker) or "sell" (sell at outlet).';
  end if;
  if v_email is not null and v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception using message = 'validation', detail = 'The outlet manager''s email address does not look right.';
  end if;

  if p_partner_id is not null then
    select * into p from franchise_partners where id = p_partner_id and tenant_id = t and data_category = p_category;
    if p.id is null then raise exception using message = 'not_found', detail = 'That franchisee is not in this brokerage and category.'; end if;
  else
    if v_partner is null then raise exception using message = 'needs_input', detail = 'Which franchisee should I set up? Give the business name.'; end if;
    select * into p from franchise_partners where tenant_id = t and data_category = p_category and lower(name) = lower(v_partner);
  end if;

  if p_receiving_member_id is not null or nullif(trim(coalesce(p_receiving_member_name, '')), '') is not null then
    pick := app.pick_member(t, p_receiving_member_id, p_receiving_member_name, p_category);
    if pick ->> 'outcome' = 'needs_input' then return pick; end if;
    recv := (pick ->> 'member_id')::uuid;
  end if;

  if p.id is null then
    biz := app.ensure_franchise_business(t, p_category, v_partner, p_customer_id);
    insert into franchise_partners (tenant_id, data_category, name, trading_name, customer_id, created_by)
    values (t, p_category, v_partner, v_partner, biz, auth.uid()) returning * into p;
    partner_new := true;
  else
    if p.customer_id is null then
      biz := app.ensure_franchise_business(t, p_category, coalesce(p.trading_name, p.name), coalesce(p_customer_id, p.customer_id));
      update franchise_partners set customer_id = biz, updated_at = now() where id = p.id returning * into p;
    elsif p_customer_id is not null and p.customer_id is distinct from p_customer_id then
      perform app.ensure_franchise_business(t, p_category, coalesce(p.trading_name, p.name), p_customer_id);
      update franchise_partners set customer_id = p_customer_id, updated_at = now() where id = p.id returning * into p;
    else
      perform app.ensure_franchise_business(t, p_category, coalesce(p.trading_name, p.name), p.customer_id);
    end if;
    if p.status <> 'active' then
      update franchise_partners set status = 'active', updated_at = now() where id = p.id returning * into p;
    end if;
  end if;

  if v_outlet is null then
    select count(*) into n from franchise_outlets where partner_id = p.id;
    if n = 1 then
      select * into o from franchise_outlets where partner_id = p.id;
    elsif n > 1 then
      return jsonb_build_object('outcome', 'needs_input', 'reason', 'choose_outlet', 'category', p_category,
        'summary', format('%s has %s outlets. Which outlet should I update?', p.name, n),
        'choices', (select jsonb_agg(app.outlet_json(x.id) || jsonb_build_object('record_type', 'outlet', 'number', x.referral_code,
                      'detail', coalesce(x.service_area, '')) order by x.name) from franchise_outlets x where x.partner_id = p.id));
    else
      v_outlet := coalesce(v_area, p.name);
    end if;
  end if;
  if o.id is null then
    select * into o from franchise_outlets where partner_id = p.id and lower(name) = lower(v_outlet);
  end if;

  if o.id is null then
    recv := coalesce(recv, app.my_member_id());
    if recv is null then
      raise exception using message = 'needs_input', detail = format('Who should receive enquiries from %s? Name a broker on your team.', v_outlet);
    end if;
    insert into franchise_outlets (tenant_id, data_category, partner_id, name, service_area, receiving_member_id, sales_mode, referral_code, created_by)
    values (t, p_category, p.id, v_outlet, v_area, recv, coalesce(p_sales_mode, 'refer'),
      app.new_referral_code(case when v_outlet ~* '^(the|outlet|branch|main)\M' then p.name else v_outlet end), auth.uid())
    returning * into o;
    outlet_new := true;
  else
    update franchise_outlets set service_area = coalesce(v_area, service_area), receiving_member_id = coalesce(recv, receiving_member_id),
      sales_mode = coalesce(p_sales_mode, sales_mode), status = 'active', updated_at = now()
     where id = o.id returning * into o;
    if o.receiving_member_id is null then
      raise exception using message = 'needs_input', detail = format('Who should receive enquiries from %s? Name a broker on your team.', o.name);
    end if;
  end if;

  if v_mgr is not null or v_email is not null then
    select * into s from franchise_outlet_staff where outlet_id = o.id
       and ((v_email is not null and lower(email) = v_email) or (v_mgr is not null and lower(full_name) = lower(v_mgr)))
     order by (lower(email) = v_email) desc nulls last limit 1;
    if s.id is null then
      insert into franchise_outlet_staff (tenant_id, data_category, outlet_id, full_name, email, phone, outlet_role, referral_code, status, invited_by)
      values (t, p_category, o.id, coalesce(v_mgr, split_part(v_email, '@', 1)), v_email, nullif(trim(coalesce(p_manager_phone, '')), ''), 'manager',
        app.new_referral_code(coalesce(v_mgr, split_part(v_email, '@', 1))), 'invited', auth.uid())
      returning * into s;
    else
      update franchise_outlet_staff set outlet_role = 'manager', email = coalesce(email, v_email),
        phone = coalesce(nullif(trim(coalesce(p_manager_phone, '')), ''), phone), updated_at = now()
       where id = s.id returning * into s;
    end if;
    if s.user_id is null and s.email is not null and app.outlet_invite_status(s.id) in ('not_sent','expired','revoked') then
      token := app.issue_outlet_invitation(s.id);
    end if;
  end if;

  select id into bp_id from business_profiles where customer_id = p.customer_id and data_category = p_category limit 1;

  receipt := copilot_log_saved(p_category, p_copilot, 'franchise.setup',
    jsonb_build_object('partner', coalesce(v_partner, p.name), 'outlet', o.name, 'service_area', v_area, 'receiving_member_id', recv,
      'receiving_member_name', p_receiving_member_name, 'sales_mode', p_sales_mode, 'manager_name', v_mgr, 'manager_email', v_email,
      'customer_id', p.customer_id), p_idempotency_key,
    jsonb_build_array(jsonb_build_object('table', 'franchise_partners', 'id', p.id, 'reference', p.name),
                      jsonb_build_object('table', 'franchise_outlets', 'id', o.id, 'reference', o.referral_code),
                      jsonb_build_object('table', 'customers', 'id', p.customer_id)),
    jsonb_build_object('record_type', 'franchise_outlet', 'id', o.id, 'reference', o.referral_code,
      'partner', jsonb_build_object('id', p.id, 'name', coalesce(p.trading_name, p.name), 'status', p.status, 'customer_id', p.customer_id),
      'business', case when bp_id is not null then jsonb_build_object(
          'customer_id', p.customer_id, 'profile_id', bp_id,
          'open_path', '/broker/customers/businesses/' || bp_id
        ) end,
      'outlet', app.outlet_json(o.id), 'manager', case when s.id is not null then app.outlet_staff_json(s.id) end,
      'created_partner', partner_new, 'created_outlet', outlet_new,
      'summary', case when partner_new then format('Set up %s with %s', coalesce(p.trading_name, p.name), o.name)
                      when outlet_new then format('Added %s to %s', o.name, coalesce(p.trading_name, p.name))
                      else format('Reopened %s', app.outlet_label(o.id)) end
        || format('. Enquiries go to %s (%s). Customer code %s', (select full_name from sales_team_members where id = o.receiving_member_id),
             case o.sales_mode when 'sell' then 'sell at outlet' else 'refer to broker' end, o.referral_code)
        || coalesce('. Invited ' || s.full_name || ' as outlet manager', ''),
      'open_path', case when bp_id is not null then '/broker/customers/businesses/' || bp_id || '?rtab=outlets'
                        else '/broker/franchise?tab=franchisees&outlet=' || o.id end),
    'franchise_outlets', o.id);
  return receipt || jsonb_build_object('invite_path', case when token is not null then '/outlet/join/' || token end);
end $$;

revoke all on function public.franchise_setup(text, text, text, text, text, uuid, text, text, text, text, text, uuid, text, uuid) from public, anon;
grant execute on function public.franchise_setup(text, text, text, text, text, uuid, text, text, text, text, text, uuid, text, uuid) to authenticated;

-- Backfill: attach commercial customers to existing franchise partners that lack customer_id
do $$
declare r record; biz uuid;
begin
  for r in select * from franchise_partners where customer_id is null loop
    biz := app.ensure_franchise_business(r.tenant_id, r.data_category, coalesce(r.trading_name, r.name), null);
    update franchise_partners set customer_id = biz, updated_at = now() where id = r.id;
  end loop;
end $$;

-- franchise_list includes customer_id + business open_path for Customer Area
create or replace function public.franchise_list(p_category text) returns jsonb language plpgsql stable set search_path = public as $$
declare t uuid := sales_guard(p_category);
begin
  return jsonb_build_object('category', p_category, 'can_manage', app.can_manage_team(),
    'partners', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'name', coalesce(p.trading_name, p.name),
        'status', p.status,
        'customer_id', p.customer_id,
        'profile_id', (select bp.id from business_profiles bp where bp.customer_id = p.customer_id and bp.data_category = p.data_category limit 1),
        'open_path', case
          when exists (select 1 from business_profiles bp where bp.customer_id = p.customer_id and bp.data_category = p.data_category)
            then '/broker/customers/businesses/' || (select bp.id from business_profiles bp where bp.customer_id = p.customer_id and bp.data_category = p.data_category limit 1)
          else '/broker/franchise?tab=franchisees'
        end,
        'created_at', p.created_at,
        'outlets', coalesce((select jsonb_agg(app.outlet_json(o.id) || jsonb_build_object(
            'staff', (select count(*) from franchise_outlet_staff s where s.outlet_id = o.id and s.status <> 'suspended'),
            'enquiries', (select count(*) from sales_enquiries e where e.franchise_outlet_id = o.id),
            'sold', (select count(*) from sales_enquiries e where e.franchise_outlet_id = o.id and e.sold_at is not null))
          order by o.name) from franchise_outlets o where o.partner_id = p.id), '[]'))
      order by p.name) from franchise_partners p where p.tenant_id = t and p.data_category = p_category), '[]'));
end $$;
