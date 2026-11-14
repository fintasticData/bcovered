-- InsureFlow AI / B-Covered: the broker, sub-broker and agent sales book.
-- Self-service broker workspaces, team members with customer referral codes, enquiries from referral links, offers,
-- acceptance, one sale per offer and a dated communications timeline on one client record. Agents and sub-brokers only
-- see the clients assigned to them; owners, admins and representatives keep the whole brokerage.
-- The same functions sit behind the workspace buttons and the bcovered-mcp jobs, so every action runs with the signed-in
-- user's permissions. A new brokerage works in Sample straight away; Live unlocks once B-Covered activates it.
-- Apply after 20261114_0018_fix_search_paths.sql.

begin;

-- ------------------------------------------------------------------ 1. Roles: sub-broker and agent
insert into roles (key, label, is_staff) values
  ('sub_broker', 'Sub-broker', true),
  ('agent', 'Agent', true)
on conflict (key) do nothing;

alter table organisation_memberships drop constraint organisation_memberships_role_check;
alter table organisation_memberships add constraint organisation_memberships_role_check check (role in
  ('brokerage_owner','brokerage_admin','representative','operations_admin','compliance_reviewer','read_only','sub_broker','agent'));
alter table brokerage_invitations drop constraint brokerage_invitations_role_check;
alter table brokerage_invitations add constraint brokerage_invitations_role_check check (role in
  ('brokerage_owner','brokerage_admin','representative','operations_admin','compliance_reviewer','read_only','sub_broker','agent'));

create or replace function app.is_staff() returns boolean language sql stable set search_path = public as $$
  select app.role() in ('broker','claims_admin','manager','admin','brokerage_owner','brokerage_admin','representative','operations_admin',
    'compliance_reviewer','read_only','sub_broker','agent')
$$;

-- Button actions are logged next to copilot actions, as "workspace".
alter table copilot_actions drop constraint copilot_actions_copilot_check;
alter table copilot_actions add constraint copilot_actions_copilot_check check (copilot in ('ar','ava','russ','workspace'));
alter table audit_events drop constraint audit_events_copilot_check;
alter table audit_events add constraint audit_events_copilot_check check (copilot in ('ar','ava','russ','workspace'));

-- ------------------------------------------------------------------ 2. Team members and their referral codes
create table sales_team_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  user_id uuid references app_users(id),
  invitation_id uuid references brokerage_invitations(id),
  full_name text not null,
  email text,
  phone text,
  sales_role text not null check (sales_role in ('broker','sub_broker','agent')),
  service_area text,
  referral_code text not null unique check (referral_code ~ '^[A-Z0-9]{2,12}-[A-Z0-9]{4}$'),
  status text not null default 'invited' check (status in ('invited','active','suspended')),
  invited_by uuid references app_users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index sales_team_members_user_key on sales_team_members (tenant_id, user_id) where user_id is not null;
create unique index sales_team_members_email_key on sales_team_members (tenant_id, lower(email)) where email is not null;
create index sales_team_members_tenant_idx on sales_team_members (tenant_id, full_name);

alter table brokerage_invitations add column sales_member_id uuid references sales_team_members(id);

-- ------------------------------------------------------------------ 3. Enquiries, offers, sales and assignment history
create table sales_enquiries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  data_category text not null check (data_category in ('sample','live')),
  reference text not null,
  source text not null check (source in ('referral_link','referral_code','phone','copilot','manual')),
  referral_code text,
  referrer_member_id uuid references sales_team_members(id),
  assigned_member_id uuid references sales_team_members(id),
  first_names text not null,
  surname text not null,
  phone text,
  email text,
  interest text,
  message text,
  consent_at timestamptz,
  person_id uuid,
  customer_id uuid,
  match_status text not null default 'new' check (match_status in ('new','linked','possible_match')),
  match_candidates jsonb not null default '[]',
  created_by uuid references app_users(id),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  foreign key (person_id, data_category) references persons (id, data_category),
  foreign key (customer_id, data_category) references customers (id, data_category),
  unique (tenant_id, idempotency_key)
);
create unique index sales_enquiries_reference_key on sales_enquiries (tenant_id, data_category, reference);
create index sales_enquiries_person_idx on sales_enquiries (person_id, created_at desc);
create index sales_enquiries_referrer_idx on sales_enquiries (referrer_member_id, created_at desc);
create index sales_enquiries_code_idx on sales_enquiries (referral_code, created_at desc);

alter table persons
  add column assigned_member_id uuid references sales_team_members(id),
  add column referrer_member_id uuid references sales_team_members(id),
  add column first_enquiry_id uuid references sales_enquiries(id),
  add column contact_stage text not null default 'client' check (contact_stage in ('prospect','client'));
alter table customers add column assigned_member_id uuid references sales_team_members(id);
create index persons_assigned_idx on persons (assigned_member_id);
create index persons_referrer_idx on persons (referrer_member_id);
create index customers_assigned_idx on customers (assigned_member_id);

create table sales_offers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  data_category text not null check (data_category in ('sample','live')),
  reference text not null,
  person_id uuid not null,
  customer_id uuid,
  enquiry_id uuid references sales_enquiries(id),
  quote_id uuid references quotes(id),
  quote_option_id uuid references quote_options(id),
  from_sample_quote boolean not null default false,
  insurer_id uuid references insurers(id),
  insurer_name text not null,
  product text not null,
  premium_amount numeric(12,2) not null check (premium_amount > 0),
  premium_frequency text not null check (premium_frequency in ('monthly','quarterly','annually','single')),
  status text not null default 'draft' check (status in ('draft','sent','accepted','sold','declined','withdrawn')),
  notes text,
  customer_message text,
  sent_at timestamptz,
  sent_channel text check (sent_channel in ('whatsapp','email','call','in_person','other')),
  accepted_at timestamptz,
  responsible_member_id uuid references sales_team_members(id),
  created_by uuid not null references app_users(id),
  idempotency_key text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key (person_id, data_category) references persons (id, data_category),
  foreign key (customer_id, data_category) references customers (id, data_category),
  unique (id, data_category),
  unique (tenant_id, idempotency_key)
);
create unique index sales_offers_reference_key on sales_offers (tenant_id, data_category, reference);
create index sales_offers_person_idx on sales_offers (person_id, created_at desc);
create index sales_offers_responsible_idx on sales_offers (responsible_member_id, status);

create table sales_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  data_category text not null check (data_category in ('sample','live')),
  reference text not null,
  offer_id uuid not null unique,
  person_id uuid not null,
  customer_id uuid,
  insurer_reference text not null,
  cover_start_date date not null,
  premium_amount numeric(12,2) not null,
  premium_frequency text not null,
  sold_by_member_id uuid references sales_team_members(id),
  referrer_member_id uuid references sales_team_members(id),
  enquiry_id uuid references sales_enquiries(id),
  created_by uuid not null references app_users(id),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  foreign key (offer_id, data_category) references sales_offers (id, data_category),
  foreign key (person_id, data_category) references persons (id, data_category),
  foreign key (customer_id, data_category) references customers (id, data_category),
  unique (tenant_id, idempotency_key)
);
create unique index sales_records_reference_key on sales_records (tenant_id, data_category, reference);
create index sales_records_person_idx on sales_records (person_id);
create index sales_records_referrer_idx on sales_records (referrer_member_id);

create table contact_assignment_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  data_category text not null check (data_category in ('sample','live')),
  person_id uuid not null,
  from_member_id uuid references sales_team_members(id),
  to_member_id uuid references sales_team_members(id),
  reason text,
  changed_by uuid not null references app_users(id),
  created_at timestamptz not null default now(),
  foreign key (person_id, data_category) references persons (id, data_category)
);
create index contact_assignment_events_person_idx on contact_assignment_events (person_id, created_at desc);

-- ------------------------------------------------------------------ 4. Communications and follow-ups link to offers
alter table client_interactions drop constraint client_interactions_kind_check;
alter table client_interactions add constraint client_interactions_kind_check
  check (kind in ('note','call','meeting','email','callback_request','whatsapp'));
alter table client_interactions
  add column direction text not null default 'internal' check (direction in ('outbound','inbound','internal')),
  add column event text not null default 'logged' check (event in ('logged','whatsapp_opened','message_sent','reply')),
  add column offer_id uuid,
  add column occurred_at timestamptz not null default now(),
  add constraint client_interactions_offer_cat_fk foreign key (offer_id, data_category) references sales_offers (id, data_category);
create index client_interactions_offer_idx on client_interactions (offer_id);

alter table tasks
  add column offer_id uuid,
  add constraint tasks_offer_cat_fk foreign key (offer_id, data_category) references sales_offers (id, data_category);
create index tasks_offer_idx on tasks (offer_id) where offer_id is not null;

-- ------------------------------------------------------------------ 5. Enquiry, offer and sale numbers
alter table number_sequences drop constraint number_sequences_kind_check;
alter table number_sequences add constraint number_sequences_kind_check
  check (kind in ('client','account','note','task','policy','enquiry','offer','sale'));

create or replace function app.next_number(p_tenant uuid, p_kind text, p_category text) returns text
language plpgsql security definer set search_path = public as $$
declare v bigint;
begin
  insert into number_sequences (tenant_id, kind, data_category) values (p_tenant, p_kind, p_category)
  on conflict (tenant_id, kind, data_category) do update set last_value = number_sequences.last_value + 1
  returning last_value into v;
  return (case p_kind when 'client' then 'CL' when 'account' then 'AC' when 'note' then 'NT' when 'policy' then 'PL'
                      when 'enquiry' then 'EN' when 'offer' then 'OF' when 'sale' then 'SL' else 'TK' end)
      || (case p_category when 'sample' then '-S' else '-' end) || v;
end $$;
revoke all on function app.next_number(uuid, text, text) from public, anon, authenticated;

create or replace function app.assign_reference() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'persons' then
    if new.client_number is null then new.client_number := app.next_number(new.tenant_id, 'client', new.data_category); end if;
  elsif tg_table_name = 'customers' then
    if new.account_number is null then new.account_number := app.next_number(new.tenant_id, 'account', new.data_category); end if;
  elsif tg_table_name = 'client_interactions' then
    if new.reference is null then new.reference := app.next_number(new.tenant_id, 'note', new.data_category); end if;
  elsif tg_table_name = 'tasks' then
    if new.reference is null then new.reference := app.next_number(new.tenant_id, 'task', new.data_category); end if;
  elsif tg_table_name = 'policies' then
    if new.reference is null then new.reference := app.next_number(new.tenant_id, 'policy', new.data_category); end if;
  elsif tg_table_name = 'sales_enquiries' then
    if new.reference is null then new.reference := app.next_number(new.tenant_id, 'enquiry', new.data_category); end if;
  elsif tg_table_name = 'sales_offers' then
    if new.reference is null then new.reference := app.next_number(new.tenant_id, 'offer', new.data_category); end if;
  elsif tg_table_name = 'sales_records' then
    if new.reference is null then new.reference := app.next_number(new.tenant_id, 'sale', new.data_category); end if;
  end if;
  return new;
end $$;
create trigger assign_reference before insert on sales_enquiries for each row execute function app.assign_reference();
create trigger assign_reference before insert on sales_offers    for each row execute function app.assign_reference();
create trigger assign_reference before insert on sales_records   for each row execute function app.assign_reference();

-- ------------------------------------------------------------------ 6. Access helpers
create or replace function app.my_member_id() returns uuid language sql stable security definer set search_path = public as $$
  select m.id from sales_team_members m
  where m.user_id = auth.uid() and m.tenant_id = app.tenant_id() and m.status <> 'suspended'
  limit 1
$$;

create or replace function app.book_restricted() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(app.member_role() in ('sub_broker','agent'), false)
$$;

create or replace function app.can_manage_team() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(app.member_role() in ('brokerage_owner','brokerage_admin'), false)
$$;

create or replace function app.can_see_person(p_person uuid) returns boolean language sql stable security definer set search_path = public as $$
  select p_person is not null and exists (
    select 1 from persons p where p.id = p_person and p.assigned_member_id is not null and p.assigned_member_id = app.my_member_id())
$$;

create or replace function app.can_see_customer(p_customer uuid) returns boolean language sql stable security definer set search_path = public as $$
  select p_customer is not null and (
    exists (select 1 from customers c where c.id = p_customer and c.assigned_member_id is not null and c.assigned_member_id = app.my_member_id())
    or exists (select 1 from customer_persons cp join persons p on p.id = cp.person_id
               where cp.customer_id = p_customer and p.assigned_member_id is not null and p.assigned_member_id = app.my_member_id()))
$$;

create or replace function app.norm_phone(p text) returns text language sql immutable set search_path = public as $$
  select nullif(case when d like '0%' and length(d) = 10 then '27' || substr(d, 2) else d end, '')
  from (select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') as d) x
$$;

create or replace function app.new_referral_code(p_name text) returns text language plpgsql volatile security definer set search_path = public, extensions as $$
declare stem text := left(upper(regexp_replace(split_part(trim(coalesce(p_name, '')), ' ', 1), '[^A-Za-z0-9]', '', 'g')), 10);
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; code text; i int;
begin
  if length(stem) < 2 then stem := 'BC'; end if;
  loop
    code := stem || '-';
    for i in 1..4 loop code := code || substr(alphabet, 1 + (get_byte(gen_random_bytes(1), 0) % 32), 1); end loop;
    exit when not exists (select 1 from sales_team_members where referral_code = code);
  end loop;
  return code;
end $$;

create or replace function app.referral_path(p_code text, p_category text) returns text language sql immutable set search_path = public as $$
  select '/r/' || p_code || case when p_category = 'sample' then '?mode=sample' else '' end
$$;

create or replace function app.member_json(p_member uuid, p_category text default null) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('member_id', m.id, 'name', m.full_name, 'role', m.sales_role,
    'role_label', case m.sales_role when 'broker' then 'Broker' when 'sub_broker' then 'Sub-broker' else 'Agent' end,
    'referral_code', m.referral_code, 'referral_path', app.referral_path(m.referral_code, coalesce(p_category, 'live')),
    'service_area', m.service_area, 'status', m.status, 'user_id', m.user_id)
  from sales_team_members m where m.id = p_member
$$;

revoke all on function app.new_referral_code(text) from public, anon, authenticated;

-- ------------------------------------------------------------------ 7. Row-level security
-- New tables follow the copilot records: brokerage staff, the active category, writers only, Live once operational.
do $$ declare t text; begin
  foreach t in array array['sales_enquiries','sales_offers','sales_records','contact_assignment_events'] loop
    execute format('alter table %I enable row level security', t);
    execute format($p$create policy staff_tenant on %I for all to authenticated
      using (tenant_id = (select app.tenant_id()) and (select app.is_staff()))
      with check (tenant_id = (select app.tenant_id()) and (select app.is_staff()))$p$, t);
    execute format($p$create policy category_scope on %I as restrictive for all to authenticated
      using (data_category = (select app.active_category())) with check (data_category = (select app.active_category()))$p$, t);
    execute format($p$create policy writer_insert on %I as restrictive for insert to authenticated with check ((select app.can_write()))$p$, t);
    execute format($p$create policy writer_update on %I as restrictive for update to authenticated using ((select app.can_write()))$p$, t);
    execute format($p$create policy writer_delete on %I as restrictive for delete to authenticated using ((select app.can_write()))$p$, t);
  end loop;
end $$;

alter table sales_team_members enable row level security;
create policy staff_read on sales_team_members for select to authenticated
  using (tenant_id = (select app.tenant_id()) and (select app.is_staff()));
create policy self_read on sales_team_members for select to authenticated using (user_id = auth.uid());

-- A brokerage still in onboarding works in Sample; Live waits for activation.
do $$ declare t text; begin
  foreach t in array array['customers','leads','quotes','conversations','conversation_messages','communications','policies'] loop
    execute format('drop policy if exists operational_tenant on %I', t);
    execute format($p$create policy operational_tenant on %I as restrictive for all to authenticated
      using ((select app.tenant_operational()) or (select app.is_platform_staff()) or data_category = 'sample')$p$, t);
  end loop;
  foreach t in array array['sales_enquiries','sales_offers','sales_records','contact_assignment_events'] loop
    execute format($p$create policy operational_tenant on %I as restrictive for all to authenticated
      using ((select app.tenant_operational()) or (select app.is_platform_staff()) or data_category = 'sample')$p$, t);
  end loop;
end $$;

-- Agents and sub-brokers see only the clients assigned to them, on every surface (grid, record, copilot, direct URL).
create policy book_scope on persons as restrictive for all to authenticated
  using (not (select app.book_restricted()) or assigned_member_id = (select app.my_member_id()))
  with check (not (select app.book_restricted()) or assigned_member_id = (select app.my_member_id()));
create policy book_scope on customers as restrictive for all to authenticated
  using (not (select app.book_restricted()) or assigned_member_id = (select app.my_member_id()) or app.can_see_customer(id))
  with check (not (select app.book_restricted()) or assigned_member_id = (select app.my_member_id()) or app.can_see_customer(id));
do $$ declare t text; begin
  foreach t in array array['customer_persons','policy_parties','sales_offers','sales_records','contact_assignment_events'] loop
    execute format($p$create policy book_scope on %I as restrictive for all to authenticated
      using (not (select app.book_restricted()) or app.can_see_person(person_id))
      with check (not (select app.book_restricted()) or app.can_see_person(person_id))$p$, t);
  end loop;
  foreach t in array array['leads','quotes','policies','communications'] loop
    execute format($p$create policy book_scope on %I as restrictive for all to authenticated
      using (not (select app.book_restricted()) or app.can_see_customer(customer_id))
      with check (not (select app.book_restricted()) or app.can_see_customer(customer_id))$p$, t);
  end loop;
end $$;
create policy book_scope on sales_enquiries as restrictive for all to authenticated
  using (not (select app.book_restricted()) or assigned_member_id = (select app.my_member_id()) or app.can_see_person(person_id))
  with check (not (select app.book_restricted()) or assigned_member_id = (select app.my_member_id()) or app.can_see_person(person_id));
create policy book_scope on client_interactions as restrictive for all to authenticated
  using (not (select app.book_restricted()) or app.can_see_person(person_id) or (person_id is null and app.can_see_customer(customer_id)))
  with check (not (select app.book_restricted()) or app.can_see_person(person_id) or (person_id is null and app.can_see_customer(customer_id)));
create policy book_scope on tasks as restrictive for all to authenticated
  using (not (select app.book_restricted()) or assigned_to = auth.uid() or app.can_see_person(person_id) or (person_id is null and app.can_see_customer(customer_id)))
  with check (not (select app.book_restricted()) or assigned_to = auth.uid() or app.can_see_person(person_id) or (person_id is null and app.can_see_customer(customer_id)));
create policy book_scope on quote_options as restrictive for all to authenticated
  using (not (select app.book_restricted()) or exists (select 1 from quotes q where q.id = quote_options.quote_id));

-- New records are assigned to whoever creates them unless a function says otherwise.
alter table persons alter column assigned_member_id set default app.my_member_id();
alter table customers alter column assigned_member_id set default app.my_member_id();

-- ------------------------------------------------------------------ 8. Backfill: existing owners and representatives get a sales profile
insert into sales_team_members (tenant_id, user_id, full_name, email, sales_role, referral_code, status)
select m.tenant_id, u.id, u.full_name, u.email,
       case when m.role in ('brokerage_owner','brokerage_admin') then 'broker' else 'sub_broker' end,
       app.new_referral_code(u.full_name), 'active'
  from organisation_memberships m
  join app_users u on u.id = m.user_id
  join organisations o on o.id = m.tenant_id and o.kind = 'brokerage'
 where m.status = 'active' and m.role in ('brokerage_owner','brokerage_admin','representative')
on conflict do nothing;

-- ------------------------------------------------------------------ 9. Shared guard and lookups
-- Every sales job: copilot_guard, plus Live writes only once the brokerage is active.
create or replace function public.sales_guard(p_category text, p_write boolean default false) returns uuid
language plpgsql stable set search_path = public as $$
declare t uuid := copilot_guard(p_category);
begin
  if p_write and not app.can_write() then
    raise exception using message = 'forbidden', detail = 'Your role is read-only.';
  end if;
  if p_write and p_category = 'live' and not app.tenant_operational() and not app.is_platform_staff() then
    raise exception using message = 'forbidden',
      detail = 'Live unlocks once B-Covered activates your brokerage. Switch to Sample to run the full journey now.';
  end if;
  return t;
end $$;

create or replace function public.sales_person_json(p_person uuid) returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', p.id, 'client_number', p.client_number, 'name', trim(coalesce(p.preferred_name, p.first_names) || ' ' || p.surname),
    'first_names', p.first_names, 'surname', p.surname, 'contact_stage', p.contact_stage, 'category', p.data_category,
    'open_path', '/broker/book/clients/' || p.id,
    'account', (select jsonb_build_object('id', c.id, 'number', c.account_number, 'name', c.full_name, 'phone', c.phone, 'email', c.email, 'status', c.status)
                  from customer_persons cp join customers c on c.id = cp.customer_id
                 where cp.person_id = p.id and cp.effective_to is null order by cp.is_primary desc, (cp.role = 'self') desc limit 1),
    'assigned', app.member_json(p.assigned_member_id, p.data_category),
    'referred_by', app.member_json(p.referrer_member_id, p.data_category))
  from persons p where p.id = p_person
$$;

create or replace function public.sales_primary_account(p_person uuid) returns uuid language sql stable set search_path = public as $$
  select cp.customer_id from customer_persons cp
  where cp.person_id = p_person and cp.effective_to is null order by cp.is_primary desc, (cp.role = 'self') desc limit 1
$$;

-- ------------------------------------------------------------------ 10. Workspace setup and profile
-- Signup metadata ("brokerage_name") lets setup finish on first sign-in when email confirmation was required.
alter table app_users add column raw_meta_brokerage text;

create or replace function public.sales_setup_workspace(p_brokerage_name text default null, p_full_name text default null,
  p_phone text default null, p_service_area text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); u app_users; org organisations; mem sales_team_members; existing uuid; v_name text; v_slug text; reopened boolean := false;
begin
  if uid is null then raise exception using message = 'forbidden', detail = 'Sign in first.'; end if;
  select * into u from app_users where id = uid;
  if u.id is null then
    insert into app_users (id, email, full_name)
    select a.id, a.email, coalesce(nullif(trim(p_full_name), ''), a.raw_user_meta_data ->> 'full_name', a.email) from auth.users a where a.id = uid
    returning * into u;
  end if;
  if nullif(trim(p_full_name), '') is not null and u.full_name is distinct from trim(p_full_name) then
    update app_users set full_name = trim(p_full_name), updated_at = now() where id = uid returning * into u;
  end if;

  -- Reopen: the brokerage this user owns (prefer the active workspace), else one they belong to as a broker.
  select m.tenant_id into existing from organisation_memberships m join organisations o on o.id = m.tenant_id and o.kind = 'brokerage'
   where m.user_id = uid and m.status = 'active' and m.role in ('brokerage_owner','brokerage_admin')
   order by (m.tenant_id = u.active_organisation_id) desc, m.created_at limit 1;
  -- Sub-brokers and agents asking to "set up" are taken back to the brokerage they work in.
  if existing is null and nullif(trim(coalesce(p_brokerage_name, '')), '') is null then
    select m.tenant_id into existing from organisation_memberships m join organisations o on o.id = m.tenant_id and o.kind = 'brokerage'
     where m.user_id = uid and m.status = 'active'
     order by (m.tenant_id = u.active_organisation_id) desc, m.created_at limit 1;
  end if;

  if existing is null then
    v_name := nullif(trim(coalesce(p_brokerage_name, u.raw_meta_brokerage)), '');
    if v_name is null then
      raise exception using message = 'needs_input', detail = 'What is your brokerage called?';
    end if;
    v_slug := trim(both '-' from left(lower(regexp_replace(v_name, '[^A-Za-z0-9]+', '-', 'g')), 40));
    if v_slug = '' then v_slug := 'brokerage'; end if;
    while exists (select 1 from organisations where slug = v_slug) loop
      v_slug := left(v_slug, 34) || '-' || substr(md5(random()::text), 1, 5);
    end loop;
    insert into organisations (name, slug, kind, trading_name, lifecycle_status, is_demo)
    values (v_name, v_slug, 'brokerage', v_name, 'onboarding', false) returning * into org;
    insert into organisation_memberships (tenant_id, user_id, role) values (org.id, uid, 'brokerage_owner');
    insert into brokerage_applications (tenant_id, route, status) values (org.id, 'application', 'draft');
    existing := org.id;
    insert into audit_events (tenant_id, actor_type, actor_id, action, entity_table, entity_id, copilot)
    values (org.id, 'user', uid::text, 'workspace.created', 'organisations', org.id, 'workspace');
  else
    reopened := true;
    select * into org from organisations where id = existing;
  end if;

  update app_users set active_organisation_id = existing, updated_at = now() where id = uid;

  select * into mem from sales_team_members where tenant_id = existing and user_id = uid;
  if mem.id is null then
    select * into mem from sales_team_members where tenant_id = existing and user_id is null and lower(email) = lower(u.email);
    if mem.id is not null then
      update sales_team_members set user_id = uid, status = 'active', updated_at = now() where id = mem.id returning * into mem;
    end if;
  end if;
  if mem.id is null then
    insert into sales_team_members (tenant_id, user_id, full_name, email, phone, sales_role, service_area, referral_code, status)
    values (existing, uid, u.full_name, u.email, nullif(trim(p_phone), ''),
      case when (select role from organisation_memberships where tenant_id = existing and user_id = uid) in ('sub_broker','agent')
           then (select role from organisation_memberships where tenant_id = existing and user_id = uid)
           when (select role from organisation_memberships where tenant_id = existing and user_id = uid) = 'representative' then 'sub_broker'
           else 'broker' end,
      nullif(trim(p_service_area), ''), app.new_referral_code(u.full_name), 'active')
    returning * into mem;
  elsif nullif(trim(p_phone), '') is not null or nullif(trim(p_service_area), '') is not null then
    update sales_team_members set phone = coalesce(nullif(trim(p_phone), ''), phone),
      service_area = coalesce(nullif(trim(p_service_area), ''), service_area), updated_at = now()
     where id = mem.id returning * into mem;
  end if;

  return jsonb_build_object('outcome', 'saved', 'reopened', reopened,
    'brokerage', jsonb_build_object('id', org.id, 'name', org.name, 'lifecycle_status', org.lifecycle_status, 'live_available', org.lifecycle_status = 'active'),
    'member', app.member_json(mem.id, 'live'),
    'summary', case when reopened then format('Reopened %s. Your referral code is %s.', org.name, mem.referral_code)
                    else format('Created %s. Your referral code is %s.', org.name, mem.referral_code) end,
    'open_path', '/broker/book');
end $$;

create or replace function app.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into app_users (id, email, full_name, raw_meta_brokerage)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', new.email), new.raw_user_meta_data ->> 'brokerage_name')
  on conflict (id) do nothing;
  return new;
end $$;

create or replace function public.sales_my_profile() returns jsonb language plpgsql stable set search_path = public as $$
declare uid uuid := auth.uid(); t uuid := app.tenant_id(); mem uuid; org organisations;
begin
  if uid is null then return jsonb_build_object('signed_in', false, 'has_workspace', false); end if;
  if t is null then
    return jsonb_build_object('signed_in', true, 'has_workspace', false,
      'pending_brokerage', (select raw_meta_brokerage from app_users where id = uid),
      'name', (select full_name from app_users where id = uid), 'email', (select email from app_users where id = uid));
  end if;
  select * into org from organisations where id = t;
  mem := app.my_member_id();
  return jsonb_build_object('signed_in', true, 'has_workspace', true,
    'user_id', uid, 'name', (select full_name from app_users where id = uid), 'email', (select email from app_users where id = uid),
    'membership_role', app.member_role(), 'book_restricted', app.book_restricted(), 'can_manage_team', app.can_manage_team(),
    'brokerage', jsonb_build_object('id', org.id, 'name', org.name, 'lifecycle_status', org.lifecycle_status,
       'live_available', org.lifecycle_status = 'active' or app.is_platform_staff()),
    'member', app.member_json(mem, 'live'));
end $$;

-- ------------------------------------------------------------------ 11. Team: invite, list, invite link, accept
create or replace function app.issue_team_invitation(p_member uuid) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare m sales_team_members; token text := encode(gen_random_bytes(24), 'hex'); inv uuid;
begin
  select * into m from sales_team_members where id = p_member;
  if m.email is null then return null; end if;
  update brokerage_invitations set revoked_at = now()
   where sales_member_id = m.id and accepted_at is null and revoked_at is null;
  insert into brokerage_invitations (tenant_id, email, role, kind, token_hash, expires_at, invited_by, sales_member_id)
  values (m.tenant_id, lower(m.email), m.sales_role, 'team', encode(digest(token, 'sha256'), 'hex'), now() + interval '14 days', auth.uid(), m.id)
  returning id into inv;
  update sales_team_members set invitation_id = inv, updated_at = now() where id = m.id;
  return token;
end $$;
revoke all on function app.issue_team_invitation(uuid) from public, anon, authenticated;

create or replace function app.invite_status(p_member uuid) returns text language sql stable security definer set search_path = public as $$
  select case
    when m.user_id is not null and m.status = 'active' then 'joined'
    when m.status = 'suspended' then 'suspended'
    when m.email is null then 'needs_email'
    when i.id is null then 'not_sent'
    when i.accepted_at is not null then 'joined'
    when i.revoked_at is not null then 'revoked'
    when i.expires_at < now() then 'expired'
    else 'pending' end
  from sales_team_members m left join brokerage_invitations i on i.id = m.invitation_id where m.id = p_member
$$;

create or replace function public.sales_invite_member(p_category text, p_full_name text, p_role text, p_idempotency_key text,
  p_email text default null, p_phone text default null, p_service_area text default null, p_copilot text default 'workspace')
returns jsonb language plpgsql security definer set search_path = public as $$
declare t uuid := sales_guard(p_category); replay jsonb := copilot_replay(p_idempotency_key); m sales_team_members;
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), ''); v_name text := nullif(trim(coalesce(p_full_name, '')), '');
  matches int; token text; found boolean := false; receipt jsonb;
begin
  if replay is not null then return replay; end if;
  if not app.can_manage_team() then
    raise exception using message = 'forbidden', detail = 'Only the broker (brokerage owner or administrator) can invite team members.';
  end if;
  if p_role not in ('sub_broker','agent') then
    raise exception using message = 'validation', detail = 'Invite team members as a sub-broker or an agent.';
  end if;
  if v_name is null and v_email is null then
    raise exception using message = 'needs_input', detail = 'Who should I invite? Give their name.';
  end if;
  if v_email is not null and v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception using message = 'validation', detail = 'That email address does not look right.';
  end if;

  if v_email is not null then select * into m from sales_team_members where tenant_id = t and lower(email) = v_email; end if;
  if m.id is null and v_name is not null then
    select count(*) into matches from sales_team_members where tenant_id = t
      and (lower(full_name) = lower(v_name) or (position(' ' in v_name) = 0 and lower(split_part(full_name, ' ', 1)) = lower(v_name)));
    if matches > 1 then
      return jsonb_build_object('outcome', 'needs_input', 'reason', 'ambiguous_member', 'category', p_category,
        'summary', format('More than one team member is called %s. Give their email address.', v_name),
        'choices', (select jsonb_agg(app.member_json(id, p_category)) from sales_team_members where tenant_id = t
          and (lower(full_name) = lower(v_name) or lower(split_part(full_name, ' ', 1)) = lower(v_name))));
    end if;
    select * into m from sales_team_members where tenant_id = t
      and (lower(full_name) = lower(v_name) or (position(' ' in v_name) = 0 and lower(split_part(full_name, ' ', 1)) = lower(v_name)));
  end if;

  if m.id is not null then
    found := true;
    update sales_team_members set
      email = coalesce(email, v_email), phone = coalesce(nullif(trim(p_phone), ''), phone),
      service_area = coalesce(nullif(trim(p_service_area), ''), service_area),
      sales_role = case when user_id is null and sales_role <> 'broker' then p_role else sales_role end, updated_at = now()
     where id = m.id returning * into m;
    if m.user_id is null and m.email is not null and app.invite_status(m.id) in ('not_sent','expired','revoked') then
      token := app.issue_team_invitation(m.id);
    end if;
  else
    if v_name is null then raise exception using message = 'needs_input', detail = 'Give the team member''s full name.'; end if;
    insert into sales_team_members (tenant_id, full_name, email, phone, sales_role, service_area, referral_code, status, invited_by)
    values (t, v_name, v_email, nullif(trim(p_phone), ''), p_role, nullif(trim(p_service_area), ''), app.new_referral_code(v_name), 'invited', auth.uid())
    returning * into m;
    token := app.issue_team_invitation(m.id);
  end if;

  receipt := copilot_log_saved(p_category, p_copilot, 'sales.team.invite',
    jsonb_build_object('full_name', p_full_name, 'role', p_role, 'email', v_email, 'service_area', p_service_area), p_idempotency_key,
    jsonb_build_array(jsonb_build_object('table', 'sales_team_members', 'id', m.id, 'reference', m.referral_code)),
    jsonb_build_object('record_type', 'team_member', 'id', m.id, 'reference', m.referral_code,
      'member', app.member_json(m.id, p_category), 'invite_status', app.invite_status(m.id), 'existing', found,
      'summary', case
        when found and m.user_id is not null then format('%s is already on your team as %s. Customer referral code %s', m.full_name,
             case m.sales_role when 'broker' then 'a broker' when 'sub_broker' then 'a sub-broker' else 'an agent' end, m.referral_code)
        when found then format('%s is already invited (%s). Customer referral code %s', m.full_name, replace(app.invite_status(m.id), '_', ' '), m.referral_code)
        else format('Added %s as %s%s. Customer referral code %s', m.full_name,
             case p_role when 'sub_broker' then 'a sub-broker' else 'an agent' end,
             coalesce(' in ' || m.service_area, ''), m.referral_code) end,
      'open_path', '/broker/book?tab=team'),
    'sales_team_members', m.id);
  -- The one-time invite link is returned to the caller but never stored in the log.
  return receipt || jsonb_build_object('invite_path', case when token is not null then '/team/join/' || token end);
end $$;

create or replace function public.sales_invite_link(p_category text, p_member_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t uuid := sales_guard(p_category); m sales_team_members; token text;
begin
  if not app.can_manage_team() then raise exception using message = 'forbidden', detail = 'Only the broker can issue invitation links.'; end if;
  select * into m from sales_team_members where id = p_member_id and tenant_id = t;
  if m.id is null then raise exception using message = 'not_found', detail = 'That team member is not in your brokerage.'; end if;
  if m.user_id is not null then raise exception using message = 'validation', detail = format('%s has already joined.', m.full_name); end if;
  if m.email is null then raise exception using message = 'needs_input', detail = format('Add %s''s email address first.', m.full_name); end if;
  token := app.issue_team_invitation(m.id);
  return jsonb_build_object('member', app.member_json(m.id, p_category), 'invite_status', app.invite_status(m.id), 'invite_path', '/team/join/' || token);
end $$;

create or replace function public.sales_list_team(p_category text) returns jsonb language plpgsql stable set search_path = public as $$
declare t uuid := sales_guard(p_category);
begin
  return coalesce((select jsonb_agg(app.member_json(m.id, p_category) || jsonb_build_object(
      'email', m.email, 'phone', m.phone, 'invite_status', app.invite_status(m.id), 'is_me', m.user_id = auth.uid(),
      'clients', (select count(*) from persons p where p.assigned_member_id = m.id),
      'referrals', (select count(*) from persons p where p.referrer_member_id = m.id))
    order by (m.sales_role = 'broker') desc, m.full_name)
    from sales_team_members m where m.tenant_id = t), '[]');
end $$;

create or replace function public.sales_accept_invitation(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare inv brokerage_invitations; t uuid; m sales_team_members;
begin
  if auth.uid() is null then raise exception using message = 'forbidden', detail = 'Sign in first.'; end if;
  insert into app_users (id, email, full_name) select a.id, a.email, coalesce(a.raw_user_meta_data ->> 'full_name', a.email) from auth.users a
   where a.id = auth.uid() on conflict (id) do nothing;
  select * into inv from brokerage_invitations where token_hash = encode(digest(p_token, 'sha256'), 'hex');
  if inv.id is not null and inv.accepted_by = auth.uid() then
    t := inv.tenant_id;
    update app_users set active_organisation_id = t where id = auth.uid();
  else
    t := app.accept_invitation(p_token);
  end if;
  update sales_team_members set user_id = auth.uid(), status = 'active', updated_at = now()
   where id = inv.sales_member_id and (user_id is null or user_id = auth.uid())
  returning * into m;
  return jsonb_build_object('tenant_id', t, 'brokerage', (select name from organisations where id = t),
    'member', app.member_json(m.id, 'live'), 'open_path', '/broker/book');
end $$;

-- Public view of an invitation, so the join page can greet the person before they sign up.
create or replace function public.sales_invitation_preview(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare inv brokerage_invitations; m sales_team_members;
begin
  select * into inv from brokerage_invitations where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
  if inv.id is null or inv.sales_member_id is null then return jsonb_build_object('valid', false, 'reason', 'This invitation link is not recognised.'); end if;
  select * into m from sales_team_members where id = inv.sales_member_id;
  return jsonb_build_object(
    'valid', inv.accepted_at is null and inv.revoked_at is null and inv.expires_at > now(),
    'reason', case when inv.accepted_at is not null then 'This invitation has already been accepted. Sign in instead.'
                   when inv.revoked_at is not null then 'This invitation was replaced by a newer link. Ask your broker for the latest one.'
                   when inv.expires_at <= now() then 'This invitation has expired. Ask your broker to send a new one.' end,
    'email', inv.email, 'name', m.full_name,
    'role_label', case m.sales_role when 'sub_broker' then 'Sub-broker' when 'agent' then 'Agent' else 'Broker' end,
    'brokerage', (select coalesce(trading_name, name) from organisations where id = inv.tenant_id),
    'invited_by', (select full_name from app_users where id = inv.invited_by));
end $$;

-- ------------------------------------------------------------------ 12. Referral codes and enquiries
create or replace function public.referral_resolve(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare m sales_team_members; org organisations; v text := upper(trim(coalesce(p_code, '')));
begin
  select * into m from sales_team_members where referral_code = v;
  if m.id is null or m.status = 'suspended' then
    return jsonb_build_object('valid', false, 'code', v, 'reason', 'We could not find that referral code. Check it and try again.');
  end if;
  select * into org from organisations where id = m.tenant_id;
  return jsonb_build_object('valid', true, 'code', m.referral_code,
    'referrer_name', split_part(m.full_name, ' ', 1) || coalesce(' ' || nullif(left(split_part(m.full_name, ' ', 2), 1), '') || '.', ''),
    'role_label', case m.sales_role when 'broker' then 'Broker' when 'sub_broker' then 'Sub-broker' else 'Agent' end,
    'brokerage', coalesce(org.trading_name, org.name),
    'live_accepting', org.lifecycle_status = 'active');
end $$;

-- One place creates enquiries for the public form and for staff capture. Callers check permissions first.
create or replace function app.create_enquiry(p_tenant uuid, p_category text, p_source text, p_code text, p_referrer uuid, p_assignee uuid,
  p_first_names text, p_surname text, p_phone text, p_email text, p_interest text, p_message text, p_consent_at timestamptz,
  p_link_person uuid, p_force_new boolean, p_name_match boolean, p_hold_matches boolean, p_created_by uuid, p_key text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare e sales_enquiries; pr persons; acct uuid; cands jsonb; v_name text := trim(p_first_names) || ' ' || trim(p_surname);
  v_phone text := app.norm_phone(p_phone); v_email text := nullif(lower(trim(coalesce(p_email, ''))), ''); assignee_user uuid; task_id uuid;
begin
  select * into e from sales_enquiries where tenant_id = p_tenant and idempotency_key = p_key;
  if e.id is not null then
    return jsonb_build_object('outcome', 'saved', 'replayed', true, 'enquiry_id', e.id, 'reference', e.reference, 'person_id', e.person_id,
      'match_status', e.match_status);
  end if;

  if p_link_person is null and not p_force_new then
    select jsonb_agg(jsonb_build_object('record_type', 'client', 'id', x.id, 'number', x.client_number,
             'name', trim(coalesce(x.preferred_name, x.first_names) || ' ' || x.surname),
             'detail', coalesce('Assigned to ' || (select full_name from sales_team_members where id = x.assigned_member_id), 'Unassigned'),
             'open_path', '/broker/book/clients/' || x.id, 'category', x.data_category))
      into cands
      from persons x
     where x.tenant_id = p_tenant and x.data_category = p_category
       and (exists (select 1 from customer_persons cp join customers c on c.id = cp.customer_id
                     where cp.person_id = x.id and cp.effective_to is null
                       and ((v_phone is not null and app.norm_phone(c.phone) = v_phone) or (v_email is not null and lower(c.email) = v_email)))
            or (p_name_match and similarity(x.first_names || ' ' || x.surname, v_name) > 0.6));
    if cands is not null and not p_hold_matches then
      return jsonb_build_object('outcome', 'needs_input', 'reason', 'possible_duplicate', 'category', p_category,
        'summary', format('%s may already be on the system. Link this enquiry to the existing client, or confirm this is a new person.', v_name),
        'choices', cands);
    end if;
  end if;

  insert into sales_enquiries (tenant_id, data_category, source, referral_code, referrer_member_id, assigned_member_id, first_names, surname,
    phone, email, interest, message, consent_at, match_status, match_candidates, created_by, idempotency_key)
  values (p_tenant, p_category, p_source, p_code, p_referrer, p_assignee, trim(p_first_names), trim(p_surname), nullif(trim(coalesce(p_phone, '')), ''),
    v_email, nullif(trim(coalesce(p_interest, '')), ''), nullif(trim(coalesce(p_message, '')), ''), p_consent_at,
    case when p_link_person is not null then 'linked' when cands is not null then 'possible_match' else 'new' end, coalesce(cands, '[]'),
    p_created_by, p_key)
  returning * into e;

  if p_link_person is not null then
    select * into pr from persons where id = p_link_person and tenant_id = p_tenant and data_category = p_category;
    if pr.id is null then raise exception using message = 'not_found', detail = 'That client is not in this brokerage and category.'; end if;
    update sales_enquiries set person_id = pr.id, customer_id = sales_primary_account(pr.id),
      assigned_member_id = coalesce(pr.assigned_member_id, p_assignee) where id = e.id returning * into e;
    if pr.assigned_member_id is null then update persons set assigned_member_id = p_assignee, updated_at = now() where id = pr.id; end if;
  elsif cands is null then
    insert into customers (tenant_id, customer_type, full_name, email, phone, status, is_synthetic, created_by, data_origin, data_category, assigned_member_id)
    values (p_tenant, 'personal', v_name, v_email, nullif(trim(coalesce(p_phone, '')), ''), 'prospect', p_category = 'sample', p_created_by,
      case p_category when 'sample' then 'demo' else 'live' end, p_category, p_assignee)
    returning id into acct;
    insert into persons (tenant_id, first_names, surname, is_synthetic, data_category, assigned_member_id, referrer_member_id, first_enquiry_id, contact_stage)
    values (p_tenant, trim(p_first_names), trim(p_surname), p_category = 'sample', p_category, p_assignee, p_referrer, e.id, 'prospect')
    returning * into pr;
    insert into customer_persons (tenant_id, customer_id, person_id, role, is_primary, data_category) values (p_tenant, acct, pr.id, 'self', true, p_category);
    update sales_enquiries set person_id = pr.id, customer_id = acct where id = e.id returning * into e;
  end if;

  select user_id into assignee_user from sales_team_members where id = e.assigned_member_id;
  insert into tasks (tenant_id, customer_id, person_id, subject_table, subject_id, kind, audience, title, detail, status, assigned_to, due_date,
    created_by_agent, dedupe_key, data_category)
  values (p_tenant, e.customer_id, e.person_id, 'sales_enquiries', e.id, 'follow_up', 'broker',
    case when e.match_status = 'possible_match' then format('Confirm the match for enquiry %s: %s', e.reference, v_name)
         else format('Contact new enquiry %s: %s', e.reference, v_name) end,
    nullif(concat_ws(' · ', e.interest, e.phone, e.email), ''), 'open', assignee_user, now() + interval '1 day', null, 'enquiry:' || e.id, p_category)
  returning id into task_id;

  insert into audit_events (tenant_id, actor_type, actor_id, action, entity_table, entity_id, after, data_category)
  values (p_tenant, case when p_created_by is null then 'system' else 'user' end, coalesce(p_created_by::text, 'referral_form'),
    'sales.enquiry.created', 'sales_enquiries', e.id,
    jsonb_build_object('reference', e.reference, 'source', p_source, 'referral_code', p_code, 'match_status', e.match_status), p_category);

  return jsonb_build_object('outcome', 'saved', 'replayed', false, 'enquiry_id', e.id, 'reference', e.reference, 'person_id', e.person_id,
    'customer_id', e.customer_id, 'match_status', e.match_status, 'follow_up_task_id', task_id);
end $$;
revoke all on function app.create_enquiry(uuid,text,text,text,uuid,uuid,text,text,text,text,text,text,timestamptz,uuid,boolean,boolean,boolean,uuid,text)
  from public, anon, authenticated;

create or replace function public.referral_submit_enquiry(p_code text, p_first_names text, p_surname text, p_phone text, p_email text,
  p_interest text, p_message text, p_consent boolean, p_client_key text, p_category text default 'live')
returns jsonb language plpgsql security definer set search_path = public as $$
declare m sales_team_members; org organisations; v text := upper(trim(coalesce(p_code, ''))); r jsonb; cat text := coalesce(p_category, 'live');
  recent int;
begin
  if cat not in ('sample','live') then raise exception using message = 'validation', detail = 'Unknown category.'; end if;
  select * into m from sales_team_members where referral_code = v;
  if m.id is null or m.status = 'suspended' then
    raise exception using message = 'validation', detail = 'We could not find that referral code. Check it and try again.';
  end if;
  select * into org from organisations where id = m.tenant_id;
  if cat = 'live' and org.lifecycle_status <> 'active' then
    raise exception using message = 'validation', detail = format('%s is not accepting enquiries online yet. Please contact them directly.', coalesce(org.trading_name, org.name));
  end if;
  if coalesce(trim(p_first_names), '') = '' or coalesce(trim(p_surname), '') = '' then
    raise exception using message = 'needs_input', detail = 'Please give your first name and surname.';
  end if;
  if app.norm_phone(p_phone) is null and nullif(trim(coalesce(p_email, '')), '') is null then
    raise exception using message = 'needs_input', detail = 'Please give a phone number or email address so we can contact you.';
  end if;
  if not coalesce(p_consent, false) then
    raise exception using message = 'needs_input', detail = 'Please agree that we may use your details to contact you about cover.';
  end if;
  if coalesce(length(p_client_key), 0) < 8 then raise exception using message = 'validation', detail = 'Missing submission key.'; end if;
  select count(*) into recent from sales_enquiries where referral_code = v and created_at > now() - interval '1 hour';
  if recent >= 30 then
    raise exception using message = 'validation', detail = 'We are receiving a lot of enquiries for this code. Please try again later.';
  end if;

  r := app.create_enquiry(m.tenant_id, cat, case when p_client_key like 'link:%' then 'referral_link' else 'referral_code' end, v, m.id, m.id,
    p_first_names, p_surname, p_phone, p_email, p_interest, p_message, now(), null, false, false, true, null, 'public:' || p_client_key);
  -- The customer sees only the reference and who will contact them.
  return jsonb_build_object('ok', true, 'reference', r ->> 'reference',
    'referrer_name', split_part(m.full_name, ' ', 1), 'brokerage', coalesce(org.trading_name, org.name), 'category', cat);
end $$;

create or replace function public.sales_capture_enquiry(p_category text, p_first_names text, p_surname text, p_idempotency_key text,
  p_phone text default null, p_email text default null, p_interest text default null, p_note text default null,
  p_referral_code text default null, p_source text default 'phone', p_assign_member_id uuid default null,
  p_link_person_id uuid default null, p_force_new boolean default false, p_copilot text default 'workspace')
returns jsonb language plpgsql security definer set search_path = public as $$
declare t uuid := sales_guard(p_category, true); replay jsonb := copilot_replay(p_idempotency_key); me uuid := app.my_member_id();
  ref sales_team_members; assignee uuid; r jsonb; v_code text := nullif(upper(trim(coalesce(p_referral_code, ''))), '');
begin
  if replay is not null then return replay; end if;
  if coalesce(trim(p_first_names), '') = '' or coalesce(trim(p_surname), '') = '' then
    raise exception using message = 'needs_input', detail = 'Give the prospect''s first names and surname.';
  end if;
  if v_code is not null then
    select * into ref from sales_team_members where referral_code = v_code;
    if ref.id is null or ref.status = 'suspended' then
      raise exception using message = 'validation', detail = format('Referral code %s is not recognised. Check the code and try again.', v_code);
    end if;
    if ref.tenant_id <> t then
      raise exception using message = 'validation', detail = format('Referral code %s belongs to a different brokerage.', v_code);
    end if;
  end if;
  assignee := coalesce(p_assign_member_id, ref.id, me);
  if assignee is null then
    raise exception using message = 'needs_input', detail = 'You do not have a sales profile in this brokerage yet. Open My workspace to set it up.';
  end if;
  if not exists (select 1 from sales_team_members where id = assignee and tenant_id = t) then
    raise exception using message = 'not_found', detail = 'That team member is not in your brokerage.';
  end if;
  if app.book_restricted() and assignee is distinct from me then
    raise exception using message = 'forbidden', detail = 'You can only load enquiries against your own code. Ask your broker to load it for a colleague.';
  end if;
  -- Linking to an existing client keeps that client's assignment and original referrer; the enquiry records this referral.
  r := app.create_enquiry(t, p_category, case when v_code is not null then 'referral_code' when p_copilot in ('ar','ava','russ') then 'copilot'
      when p_source in ('phone','manual') then p_source else 'manual' end,
    v_code, ref.id, assignee, p_first_names, p_surname, p_phone, p_email, p_interest, p_note, now(),
    p_link_person_id, p_force_new, true, false, auth.uid(), 'staff:' || p_idempotency_key);
  if r ->> 'outcome' = 'needs_input' then return r; end if;

  return copilot_log_saved(p_category, p_copilot, 'sales.enquiry.capture',
    jsonb_build_object('first_names', p_first_names, 'surname', p_surname, 'referral_code', v_code, 'link_person_id', p_link_person_id), p_idempotency_key,
    jsonb_build_array(jsonb_build_object('table', 'sales_enquiries', 'id', (r ->> 'enquiry_id')::uuid, 'reference', r ->> 'reference'),
                      jsonb_build_object('table', 'persons', 'id', (r ->> 'person_id')::uuid)),
    copilot_numbers((r ->> 'person_id')::uuid, sales_primary_account((r ->> 'person_id')::uuid), null) || jsonb_build_object(
      'record_type', 'enquiry', 'id', (r ->> 'enquiry_id')::uuid, 'reference', r ->> 'reference', 'person_id', (r ->> 'person_id')::uuid,
      'person', sales_person_json((r ->> 'person_id')::uuid), 'linked_existing', p_link_person_id is not null,
      'summary', format('%s enquiry %s for %s%s, assigned to %s%s',
        case when p_link_person_id is not null then 'Linked' else 'Loaded' end, r ->> 'reference',
        trim(p_first_names) || ' ' || trim(p_surname),
        coalesce(' (' || (select client_number from persons where id = (r ->> 'person_id')::uuid) || ')', ''),
        (select full_name from sales_team_members where id = coalesce((select assigned_member_id from persons where id = (r ->> 'person_id')::uuid), assignee)),
        coalesce(' · referred by ' || (select full_name || ' (' || referral_code || ')' from sales_team_members
                 where id = coalesce((select referrer_member_id from persons where id = (r ->> 'person_id')::uuid), ref.id)), '')),
      'open_path', '/broker/book/clients/' || (r ->> 'person_id')),
    'sales_enquiries', (r ->> 'enquiry_id')::uuid);
end $$;

create or replace function public.sales_resolve_enquiry_match(p_category text, p_enquiry_id uuid, p_idempotency_key text,
  p_person_id uuid default null, p_create_new boolean default false, p_copilot text default 'workspace')
returns jsonb language plpgsql security definer set search_path = public as $$
declare t uuid := sales_guard(p_category, true); replay jsonb := copilot_replay(p_idempotency_key); e sales_enquiries; pr persons; acct uuid;
begin
  if replay is not null then return replay; end if;
  select * into e from sales_enquiries where id = p_enquiry_id and tenant_id = t and data_category = p_category for update;
  if e.id is null then raise exception using message = 'not_found', detail = 'That enquiry is not available.'; end if;
  if app.book_restricted() and e.assigned_member_id is distinct from app.my_member_id() then
    raise exception using message = 'forbidden', detail = 'This enquiry belongs to a colleague.';
  end if;
  if e.match_status <> 'possible_match' then
    raise exception using message = 'validation', detail = format('Enquiry %s is already linked.', e.reference);
  end if;
  if p_person_id is not null then
    select * into pr from persons where id = p_person_id and tenant_id = t and data_category = p_category;
    if pr.id is null then raise exception using message = 'not_found', detail = 'That client is not available.'; end if;
    update sales_enquiries set person_id = pr.id, customer_id = sales_primary_account(pr.id), match_status = 'linked',
      assigned_member_id = coalesce(pr.assigned_member_id, e.assigned_member_id) where id = e.id;
    if pr.assigned_member_id is null then update persons set assigned_member_id = e.assigned_member_id where id = pr.id; end if;
  elsif p_create_new then
    insert into customers (tenant_id, customer_type, full_name, email, phone, status, is_synthetic, created_by, data_origin, data_category, assigned_member_id)
    values (t, 'personal', e.first_names || ' ' || e.surname, e.email, e.phone, 'prospect', p_category = 'sample', auth.uid(),
      case p_category when 'sample' then 'demo' else 'live' end, p_category, e.assigned_member_id)
    returning id into acct;
    insert into persons (tenant_id, first_names, surname, is_synthetic, data_category, assigned_member_id, referrer_member_id, first_enquiry_id, contact_stage)
    values (t, e.first_names, e.surname, p_category = 'sample', p_category, e.assigned_member_id, e.referrer_member_id, e.id, 'prospect')
    returning * into pr;
    insert into customer_persons (tenant_id, customer_id, person_id, role, is_primary, data_category) values (t, acct, pr.id, 'self', true, p_category);
    update sales_enquiries set person_id = pr.id, customer_id = acct, match_status = 'new' where id = e.id;
  else
    raise exception using message = 'needs_input', detail = 'Choose the existing client, or confirm this is a new person.';
  end if;
  update tasks set customer_id = sales_primary_account(pr.id), person_id = pr.id, title = format('Contact enquiry %s: %s %s', e.reference, e.first_names, e.surname)
   where dedupe_key = 'enquiry:' || e.id and status = 'open';
  return copilot_log_saved(p_category, p_copilot, 'sales.enquiry.resolve', jsonb_build_object('enquiry_id', e.id, 'person_id', p_person_id, 'create_new', p_create_new),
    p_idempotency_key, jsonb_build_array(jsonb_build_object('table', 'sales_enquiries', 'id', e.id, 'reference', e.reference)),
    copilot_numbers(pr.id, sales_primary_account(pr.id), null) || jsonb_build_object('record_type', 'enquiry', 'id', e.id, 'reference', e.reference,
      'person_id', pr.id, 'summary', format('Enquiry %s linked to %s (%s)', e.reference, pr.first_names || ' ' || pr.surname, pr.client_number),
      'open_path', '/broker/book/clients/' || pr.id),
    'sales_enquiries', e.id);
end $$;

-- ------------------------------------------------------------------ 13. Client grid and record
create or replace function public.sales_stage(p_person uuid, p_contact_stage text) returns text language sql stable set search_path = public as $$
  select case
    when exists (select 1 from sales_offers o where o.person_id = p_person and o.status = 'accepted') then 'accepted'
    when exists (select 1 from sales_offers o where o.person_id = p_person and o.status = 'sent') then 'offer_sent'
    when exists (select 1 from sales_records s where s.person_id = p_person) then 'sold'
    when p_contact_stage = 'prospect' then 'new_enquiry'
    else 'client' end
$$;

create or replace function public.sales_book_grid(p_category text, p_scope text default 'team', p_member_id uuid default null,
  p_stage text default null, p_query text default null, p_limit int default 100, p_offset int default 0)
returns jsonb language plpgsql stable set search_path = public, extensions as $$
declare t uuid := sales_guard(p_category); me uuid := app.my_member_id(); q text := nullif(trim(coalesce(p_query, '')), ''); rows jsonb; totals jsonb;
begin
  with base as (
    select p.*, sales_stage(p.id, p.contact_stage) as stage,
      coalesce((select max(i.occurred_at) from client_interactions i where i.person_id = p.id),
               (select max(o.updated_at) from sales_offers o where o.person_id = p.id), p.updated_at) as last_activity
      from persons p
     where p.tenant_id = t
       and (coalesce(p_scope, 'team') <> 'mine' or p.assigned_member_id = me)
       and (p_member_id is null or p.assigned_member_id = p_member_id or p.referrer_member_id = p_member_id)
       and (q is null or lower(p.client_number) = lower(q) or (p.first_names || ' ' || p.surname) ilike '%' || q || '%'
            or exists (select 1 from customer_persons cp join customers c on c.id = cp.customer_id
                        where cp.person_id = p.id and (c.phone ilike '%' || q || '%' or c.email ilike '%' || q || '%' or lower(c.account_number) = lower(q))))
  ), filtered as (
    select * from base where p_stage is null or stage = p_stage
  )
  select
    coalesce((select jsonb_agg(r order by (r ->> 'last_activity') desc nulls last) from (
      select jsonb_build_object(
        'id', f.id, 'client_number', f.client_number, 'name', trim(coalesce(f.preferred_name, f.first_names) || ' ' || f.surname),
        'contact_stage', f.contact_stage, 'stage', f.stage, 'category', f.data_category,
        'account', (select jsonb_build_object('id', c.id, 'number', c.account_number, 'phone', c.phone, 'email', c.email)
                      from customer_persons cp join customers c on c.id = cp.customer_id
                     where cp.person_id = f.id and cp.effective_to is null order by cp.is_primary desc limit 1),
        'assigned', app.member_json(f.assigned_member_id, p_category),
        'referred_by', app.member_json(f.referrer_member_id, p_category),
        'last_communication', (select jsonb_build_object('at', i.occurred_at, 'kind', i.kind, 'direction', i.direction, 'event', i.event,
                                 'summary', left(i.body, 120))
                                 from client_interactions i where i.person_id = f.id or i.customer_id = sales_primary_account(f.id)
                                 order by i.occurred_at desc limit 1),
        'next_follow_up', (select jsonb_build_object('id', k.id, 'title', k.title, 'due_date', k.due_date)
                             from tasks k where k.status = 'open' and k.person_id = f.id order by k.due_date nulls last limit 1),
        'offers', (select count(*) from sales_offers o where o.person_id = f.id),
        'sales', (select count(*) from sales_records s where s.person_id = f.id),
        'last_activity', f.last_activity,
        'open_path', '/broker/book/clients/' || f.id) as r
      from filtered f
      order by f.last_activity desc nulls last
      limit greatest(1, least(coalesce(p_limit, 100), 500)) offset greatest(0, coalesce(p_offset, 0))) x), '[]'),
    (select jsonb_build_object('people', count(*),
        'prospects', count(*) filter (where contact_stage = 'prospect'),
        'new_enquiry', count(*) filter (where stage = 'new_enquiry'),
        'offer_sent', count(*) filter (where stage = 'offer_sent'),
        'accepted', count(*) filter (where stage = 'accepted'),
        'sold', count(*) filter (where stage = 'sold' or exists (select 1 from sales_records s where s.person_id = base.id)))
       from base)
    into rows, totals;
  return jsonb_build_object('category', p_category, 'scope', coalesce(p_scope, 'team'), 'rows', rows, 'totals', totals,
    'member', case when p_member_id is not null then app.member_json(p_member_id, p_category) end,
    'can_see_team', not app.book_restricted(),
    'pending_matches', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'reference', e.reference,
        'name', e.first_names || ' ' || e.surname, 'phone', e.phone, 'email', e.email, 'interest', e.interest, 'created_at', e.created_at,
        'referrer', app.member_json(e.referrer_member_id, p_category), 'assigned', app.member_json(e.assigned_member_id, p_category),
        'candidates', e.match_candidates) order by e.created_at desc)
      from sales_enquiries e where e.match_status = 'possible_match'
        and (coalesce(p_scope, 'team') <> 'mine' or e.assigned_member_id = me)
        and (p_member_id is null or e.assigned_member_id = p_member_id or e.referrer_member_id = p_member_id)), '[]'));
end $$;

create or replace function public.sales_offer_json(o sales_offers) returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object('id', o.id, 'reference', o.reference, 'status', o.status, 'category', o.data_category,
    'insurer', o.insurer_name, 'product', o.product, 'premium_amount', o.premium_amount, 'premium_frequency', o.premium_frequency,
    'from_sample_quote', o.from_sample_quote, 'quote_id', o.quote_id, 'notes', o.notes,
    'sent_at', o.sent_at, 'sent_channel', o.sent_channel, 'accepted_at', o.accepted_at, 'created_at', o.created_at,
    'responsible', app.member_json(o.responsible_member_id, o.data_category),
    'sale', (select jsonb_build_object('id', s.id, 'reference', s.reference, 'insurer_reference', s.insurer_reference,
               'cover_start_date', s.cover_start_date, 'created_at', s.created_at) from sales_records s where s.offer_id = o.id),
    'person_id', o.person_id)
$$;

create or replace function public.sales_client_record(p_category text, p_person_id uuid) returns jsonb
language plpgsql stable set search_path = public as $$
declare t uuid := sales_guard(p_category); pr persons; accts uuid[];
begin
  select * into pr from persons where id = p_person_id;
  if pr.id is null then
    raise exception using message = 'not_found', detail = 'That client is not available to you in this category.';
  end if;
  select coalesce(array_agg(customer_id), '{}') into accts from customer_persons where person_id = pr.id and effective_to is null;
  return sales_person_json(pr.id) || jsonb_build_object(
    'stage', sales_stage(pr.id, pr.contact_stage),
    'date_of_birth', pr.date_of_birth,
    'brokerage', (select name from organisations where id = t),
    'enquiries', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'reference', e.reference, 'source', e.source, 'referral_code', e.referral_code,
                   'referrer', app.member_json(e.referrer_member_id, p_category), 'interest', e.interest, 'message', e.message,
                   'match_status', e.match_status, 'created_at', e.created_at) order by e.created_at desc)
                   from sales_enquiries e where e.person_id = pr.id), '[]'),
    'offers', coalesce((select jsonb_agg(sales_offer_json(o) order by o.created_at desc) from sales_offers o where o.person_id = pr.id), '[]'),
    'sales', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'reference', s.reference, 'offer_id', s.offer_id,
                   'offer_reference', (select reference from sales_offers where id = s.offer_id),
                   'insurer_reference', s.insurer_reference, 'cover_start_date', s.cover_start_date, 'premium_amount', s.premium_amount,
                   'premium_frequency', s.premium_frequency, 'sold_by', app.member_json(s.sold_by_member_id, p_category),
                   'referrer', app.member_json(s.referrer_member_id, p_category), 'created_at', s.created_at) order by s.created_at desc)
                   from sales_records s where s.person_id = pr.id), '[]'),
    'communications', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'reference', i.reference, 'kind', i.kind, 'direction', i.direction,
                   'event', i.event, 'body', i.body, 'occurred_at', i.occurred_at, 'created_at', i.created_at, 'copilot', i.copilot,
                   'author', (select full_name from app_users where id = i.created_by),
                   'offer', (select jsonb_build_object('id', o.id, 'reference', o.reference) from sales_offers o where o.id = i.offer_id))
                   order by i.occurred_at desc)
                   from client_interactions i where i.person_id = pr.id or (i.person_id is null and i.customer_id = any (accts))), '[]'),
    'follow_ups', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'reference', k.reference, 'title', k.title, 'detail', k.detail,
                   'due_date', k.due_date, 'status', k.status, 'offer_id', k.offer_id,
                   'assigned_to', (select full_name from app_users where id = k.assigned_to)) order by k.status, k.due_date nulls last)
                   from tasks k where (k.person_id = pr.id or (k.person_id is null and k.customer_id = any (accts))) and k.status = 'open'), '[]'),
    'assignment_history', coalesce((select jsonb_agg(jsonb_build_object('at', a.created_at, 'from', app.member_json(a.from_member_id, p_category),
                   'to', app.member_json(a.to_member_id, p_category), 'reason', a.reason,
                   'by', (select full_name from app_users where id = a.changed_by)) order by a.created_at desc)
                   from contact_assignment_events a where a.person_id = pr.id), '[]'),
    'quotes', coalesce((select jsonb_agg(jsonb_build_object('quote_id', q.id, 'option_id', qo.id, 'product', q.product_category,
                   'insurer', (select name from insurers where id = qo.insurer_id), 'label', qo.option_label,
                   'monthly_premium', qo.monthly_premium, 'is_sample', q.is_simulated, 'status', q.status) order by qo.monthly_premium)
                   from quotes q join quote_options qo on qo.quote_id = q.id
                   where q.customer_id = any (accts) and q.status not in ('rejected','expired')), '[]'),
    'can_reassign', app.can_manage_team(),
    'team', case when app.can_manage_team() then
              (select jsonb_agg(app.member_json(m.id, p_category) order by m.full_name) from sales_team_members m where m.tenant_id = t and m.status <> 'suspended')
            else '[]'::jsonb end);
end $$;

create or replace function public.sales_reassign_client(p_category text, p_person_id uuid, p_member_id uuid, p_idempotency_key text,
  p_reason text default null, p_copilot text default 'workspace')
returns jsonb language plpgsql set search_path = public as $$
declare t uuid := sales_guard(p_category, true); replay jsonb := copilot_replay(p_idempotency_key); pr persons; m sales_team_members;
begin
  if replay is not null then return replay; end if;
  if not app.can_manage_team() then raise exception using message = 'forbidden', detail = 'Only the broker can reassign clients.'; end if;
  select * into pr from persons where id = p_person_id;
  if pr.id is null then raise exception using message = 'not_found', detail = 'That client is not available in this category.'; end if;
  select * into m from sales_team_members where id = p_member_id and tenant_id = t;
  if m.id is null then raise exception using message = 'not_found', detail = 'That team member is not in your brokerage.'; end if;
  insert into contact_assignment_events (tenant_id, data_category, person_id, from_member_id, to_member_id, reason, changed_by)
  values (t, p_category, pr.id, pr.assigned_member_id, m.id, p_reason, auth.uid());
  update persons set assigned_member_id = m.id, updated_at = now() where id = pr.id;
  update customers c set assigned_member_id = m.id, updated_at = now()
   where c.id in (select customer_id from customer_persons where person_id = pr.id and effective_to is null and role = 'self');
  update sales_offers set responsible_member_id = m.id, updated_at = now() where person_id = pr.id and status in ('draft','sent','accepted');
  update tasks set assigned_to = m.user_id where person_id = pr.id and status = 'open' and m.user_id is not null;
  return copilot_log_saved(p_category, p_copilot, 'sales.client.reassign', jsonb_build_object('person_id', pr.id, 'member_id', m.id, 'reason', p_reason),
    p_idempotency_key, jsonb_build_array(jsonb_build_object('table', 'persons', 'id', pr.id, 'reference', pr.client_number)),
    copilot_numbers(pr.id, sales_primary_account(pr.id), null) || jsonb_build_object('record_type', 'client', 'id', pr.id, 'reference', pr.client_number,
      'summary', format('Reassigned %s (%s) to %s; referrer kept', pr.first_names || ' ' || pr.surname, pr.client_number, m.full_name),
      'open_path', '/broker/book/clients/' || pr.id),
    'persons', pr.id);
end $$;

-- ------------------------------------------------------------------ 14. Offers
create or replace function public.sales_offer_message(p_category text, p_offer_id uuid) returns jsonb
language plpgsql stable set search_path = public as $$
declare t uuid := sales_guard(p_category); o sales_offers; pr persons; c customers; m sales_team_members; org organisations; txt text; phone text;
begin
  select * into o from sales_offers where id = p_offer_id;
  if o.id is null then raise exception using message = 'not_found', detail = 'That offer is not available in this category.'; end if;
  select * into pr from persons where id = o.person_id;
  select * into c from customers where id = coalesce(o.customer_id, sales_primary_account(pr.id));
  select * into m from sales_team_members where id = coalesce(o.responsible_member_id, app.my_member_id());
  select * into org from organisations where id = t;
  txt := case when o.data_category = 'sample' or o.from_sample_quote then '[SAMPLE: demonstration only, not a real offer]' || E'\n' else '' end
    || format('Hi %s, here is the %s cover we discussed:', coalesce(pr.preferred_name, split_part(pr.first_names, ' ', 1)), replace(o.product, '_', ' ')) || E'\n'
    || format('Insurer: %s', o.insurer_name) || E'\n'
    || format('Premium: R%s %s', to_char(o.premium_amount, 'FM999G999G990D00'),
              case o.premium_frequency when 'monthly' then 'per month' when 'quarterly' then 'per quarter' when 'annually' then 'per year' else 'once-off' end) || E'\n'
    || format('Reference: %s', o.reference) || E'\n'
    || 'Reply to this message to go ahead or ask any questions. Cover only starts once the insurer confirms it.' || E'\n'
    || coalesce(m.full_name, 'Your broker') || coalesce(', ' || coalesce(org.trading_name, org.name), '') || coalesce(' · ' || m.phone, '');
  phone := app.norm_phone(c.phone);
  return jsonb_build_object('offer_id', o.id, 'reference', o.reference, 'text', txt, 'phone', phone, 'email', c.email,
    'email_subject', format('Your %s cover offer (%s)', replace(o.product, '_', ' '), o.reference), 'category', o.data_category);
end $$;

create or replace function public.sales_create_offer(p_category text, p_person_id uuid, p_idempotency_key text,
  p_quote_option_id uuid default null, p_insurer_name text default null, p_product text default null,
  p_premium_amount numeric default null, p_premium_frequency text default 'monthly', p_enquiry_id uuid default null,
  p_notes text default null, p_copilot text default 'workspace')
returns jsonb language plpgsql set search_path = public as $$
declare t uuid := sales_guard(p_category, true); replay jsonb := copilot_replay(p_idempotency_key); pr persons; acct uuid; qo quote_options; q quotes;
  o sales_offers; v_insurer uuid; v_insurer_name text := nullif(trim(coalesce(p_insurer_name, '')), ''); v_product text := nullif(trim(coalesce(p_product, '')), '');
  v_premium numeric := p_premium_amount; v_freq text := coalesce(p_premium_frequency, 'monthly'); choices jsonb; msg jsonb;
begin
  if replay is not null then return replay; end if;
  select * into pr from persons where id = p_person_id;
  if pr.id is null then raise exception using message = 'not_found', detail = 'That client is not available in this category.'; end if;
  acct := sales_primary_account(pr.id);

  if p_quote_option_id is not null then
    select * into qo from quote_options where id = p_quote_option_id;
    select * into q from quotes where id = qo.quote_id;
    if qo.id is null or q.id is null then raise exception using message = 'not_found', detail = 'That quote is not available in this category.'; end if;
    if not exists (select 1 from customer_persons where person_id = pr.id and customer_id = q.customer_id) then
      raise exception using message = 'not_linked', detail = 'That quote belongs to a different client.';
    end if;
    v_insurer := qo.insurer_id;
    v_insurer_name := (select name from insurers where id = qo.insurer_id);
    v_product := coalesce(v_product, q.product_category);
    v_premium := coalesce(v_premium, qo.monthly_premium);
    v_freq := 'monthly';
  elsif v_insurer_name is null or v_product is null or v_premium is null then
    select jsonb_agg(jsonb_build_object('record_type', 'quote_option', 'id', x.id, 'number', x.option_label,
             'name', (select name from insurers where id = x.insurer_id) || ' · ' || replace(q2.product_category, '_', ' '),
             'detail', format('R%s per month%s', to_char(x.monthly_premium, 'FM999G999G990D00'), case when q2.is_simulated then ' · Sample quote' else '' end),
             'insurer', (select name from insurers where id = x.insurer_id), 'product', q2.product_category, 'monthly_premium', x.monthly_premium,
             'is_sample', q2.is_simulated, 'category', p_category, 'open_path', '/broker/quotes/' || q2.id) order by x.monthly_premium)
      into choices
      from quotes q2 join quote_options x on x.quote_id = q2.id
     where q2.customer_id in (select customer_id from customer_persons where person_id = pr.id and effective_to is null)
       and q2.status not in ('rejected','expired')
       and (v_product is null or q2.product_category ilike '%' || v_product || '%');
    if choices is not null and jsonb_array_length(choices) = 1 and v_insurer_name is null and v_premium is null then
      return sales_create_offer(p_category, p_person_id, p_idempotency_key, ((choices -> 0) ->> 'id')::uuid, null, p_product, null, 'monthly',
        p_enquiry_id, p_notes, p_copilot);
    end if;
    return jsonb_build_object('outcome', 'needs_input', 'reason', case when choices is null then 'offer_details' else 'choose_quote' end,
      'category', p_category, 'person', sales_person_json(pr.id),
      'summary', case when choices is null
        then format('No saved quotes for %s (%s). Give the insurer, product, premium and payment frequency.', pr.first_names || ' ' || pr.surname, pr.client_number)
        else format('%s quotes qualify for %s (%s). Choose one, or capture the offer details.', jsonb_array_length(choices), pr.first_names || ' ' || pr.surname, pr.client_number) end,
      'choices', coalesce(choices, '[]'::jsonb),
      'missing', to_jsonb(array_remove(array[case when v_insurer_name is null then 'insurer_name' end, case when v_product is null then 'product' end,
                 case when v_premium is null then 'premium_amount' end], null)));
  end if;

  if v_freq not in ('monthly','quarterly','annually','single') then
    raise exception using message = 'validation', detail = 'Payment frequency must be monthly, quarterly, annually or single.';
  end if;
  if v_premium is null or v_premium <= 0 then raise exception using message = 'validation', detail = 'Give a premium greater than zero.'; end if;
  if v_insurer is null then select id into v_insurer from insurers where lower(name) = lower(v_insurer_name) limit 1; end if;

  insert into sales_offers (tenant_id, data_category, person_id, customer_id, enquiry_id, quote_id, quote_option_id, from_sample_quote,
    insurer_id, insurer_name, product, premium_amount, premium_frequency, status, notes, responsible_member_id, created_by, idempotency_key)
  values (t, p_category, pr.id, acct, coalesce(p_enquiry_id, pr.first_enquiry_id), q.id, qo.id, coalesce(q.is_simulated, false),
    v_insurer, v_insurer_name, v_product, round(v_premium, 2), v_freq, 'draft', p_notes, coalesce(pr.assigned_member_id, app.my_member_id()),
    auth.uid(), p_idempotency_key)
  returning * into o;
  msg := sales_offer_message(p_category, o.id);
  update sales_offers set customer_message = msg ->> 'text' where id = o.id returning * into o;

  return copilot_log_saved(p_category, p_copilot, 'sales.offer.create',
    jsonb_build_object('person_id', pr.id, 'quote_option_id', p_quote_option_id, 'insurer', v_insurer_name, 'product', v_product,
      'premium_amount', v_premium, 'premium_frequency', v_freq), p_idempotency_key,
    jsonb_build_array(jsonb_build_object('table', 'sales_offers', 'id', o.id, 'reference', o.reference)),
    copilot_numbers(pr.id, acct, null) || jsonb_build_object('record_type', 'offer', 'id', o.id, 'reference', o.reference,
      'offer', sales_offer_json(o), 'message', msg,
      'summary', format('Prepared offer %s for %s (%s): %s %s, R%s %s%s', o.reference, pr.first_names || ' ' || pr.surname, pr.client_number,
        o.insurer_name, replace(o.product, '_', ' '), to_char(o.premium_amount, 'FM999G999G990D00'), o.premium_frequency,
        case when o.from_sample_quote then ' (from a Sample quote)' else '' end),
      'open_path', '/broker/book/clients/' || pr.id || '?offer=' || o.id),
    'sales_offers', o.id);
end $$;

create or replace function public.sales_log_share_opened(p_category text, p_offer_id uuid, p_idempotency_key text, p_channel text default 'whatsapp')
returns jsonb language plpgsql set search_path = public as $$
declare t uuid := sales_guard(p_category, true); o sales_offers; i client_interactions;
begin
  select * into o from sales_offers where id = p_offer_id;
  if o.id is null then raise exception using message = 'not_found', detail = 'That offer is not available in this category.'; end if;
  insert into client_interactions (tenant_id, data_category, kind, body, person_id, customer_id, direction, event, offer_id, created_by, idempotency_key)
  values (t, p_category, case p_channel when 'email' then 'email' else 'whatsapp' end,
    format('%s opened to share offer %s (not yet confirmed as sent)', case p_channel when 'email' then 'Email' else 'WhatsApp' end, o.reference),
    o.person_id, o.customer_id, 'outbound', 'whatsapp_opened', o.id, auth.uid(), p_idempotency_key)
  on conflict (tenant_id, idempotency_key) do nothing
  returning * into i;
  return jsonb_build_object('outcome', 'saved', 'offer_id', o.id, 'interaction_id', i.id, 'reference', i.reference);
end $$;

create or replace function public.sales_mark_offer_sent(p_category text, p_offer_id uuid, p_idempotency_key text,
  p_channel text default 'whatsapp', p_note text default null, p_copilot text default 'workspace')
returns jsonb language plpgsql set search_path = public as $$
declare t uuid := sales_guard(p_category, true); replay jsonb := copilot_replay(p_idempotency_key); o sales_offers; i client_interactions;
begin
  if replay is not null then return replay; end if;
  if p_channel not in ('whatsapp','email','call','in_person','other') then
    raise exception using message = 'validation', detail = 'Channel must be WhatsApp, email, call, in person or other.';
  end if;
  select * into o from sales_offers where id = p_offer_id for update;
  if o.id is null then raise exception using message = 'not_found', detail = 'That offer is not available in this category.'; end if;
  if o.status in ('declined','withdrawn') then
    raise exception using message = 'validation', detail = format('Offer %s is %s.', o.reference, o.status);
  end if;
  update sales_offers set status = case when status = 'draft' then 'sent' else status end, sent_at = coalesce(sent_at, now()),
    sent_channel = coalesce(sent_channel, p_channel), updated_at = now() where id = o.id returning * into o;
  insert into client_interactions (tenant_id, data_category, kind, body, person_id, customer_id, direction, event, offer_id, copilot, created_by, idempotency_key)
  values (t, p_category, case p_channel when 'whatsapp' then 'whatsapp' when 'email' then 'email' when 'call' then 'call' when 'in_person' then 'meeting' else 'note' end,
    format('Offer %s sent by %s', o.reference, replace(p_channel, '_', ' ')) || coalesce(': ' || nullif(trim(p_note), ''), ''),
    o.person_id, o.customer_id, 'outbound', 'message_sent', o.id, nullif(p_copilot, 'workspace'), auth.uid(), p_idempotency_key)
  returning * into i;
  return copilot_log_saved(p_category, p_copilot, 'sales.offer.sent', jsonb_build_object('offer_id', o.id, 'channel', p_channel, 'note', p_note), p_idempotency_key,
    jsonb_build_array(jsonb_build_object('table', 'sales_offers', 'id', o.id, 'reference', o.reference),
                      jsonb_build_object('table', 'client_interactions', 'id', i.id, 'reference', i.reference)),
    copilot_numbers(o.person_id, o.customer_id, null) || jsonb_build_object('record_type', 'offer', 'id', o.id, 'reference', o.reference,
      'offer', sales_offer_json(o), 'interaction_reference', i.reference,
      'summary', format('Logged offer %s as sent by %s (%s)', o.reference, replace(p_channel, '_', ' '), i.reference),
      'open_path', '/broker/book/clients/' || o.person_id || '?offer=' || o.id),
    'sales_offers', o.id);
end $$;

create or replace function public.sales_record_acceptance(p_category text, p_offer_id uuid, p_idempotency_key text,
  p_accepted_on date default null, p_note text default null, p_copilot text default 'workspace')
returns jsonb language plpgsql set search_path = public as $$
declare t uuid := sales_guard(p_category, true); replay jsonb := copilot_replay(p_idempotency_key); o sales_offers; k tasks; uid_for uuid; already boolean;
begin
  if replay is not null then return replay; end if;
  select * into o from sales_offers where id = p_offer_id for update;
  if o.id is null then raise exception using message = 'not_found', detail = 'That offer is not available in this category.'; end if;
  if o.status in ('declined','withdrawn') then raise exception using message = 'validation', detail = format('Offer %s is %s.', o.reference, o.status); end if;
  already := o.status in ('accepted','sold');
  if not already then
    update sales_offers set status = 'accepted', accepted_at = coalesce(p_accepted_on::timestamptz, now()), sent_at = coalesce(sent_at, now()), updated_at = now()
     where id = o.id returning * into o;
    insert into client_interactions (tenant_id, data_category, kind, body, person_id, customer_id, direction, event, offer_id, copilot, created_by, idempotency_key)
    values (t, p_category, 'note', format('Client accepted offer %s', o.reference) || coalesce(': ' || nullif(trim(p_note), ''), ''),
      o.person_id, o.customer_id, 'inbound', 'reply', o.id, nullif(p_copilot, 'workspace'), auth.uid(), p_idempotency_key);
    select user_id into uid_for from sales_team_members where id = o.responsible_member_id;
    insert into tasks (tenant_id, customer_id, person_id, subject_table, subject_id, kind, audience, title, detail, status, assigned_to, due_date,
      created_by_agent, dedupe_key, data_category, offer_id)
    values (t, o.customer_id, o.person_id, 'sales_offers', o.id, 'follow_up', 'broker', format('Confirm cover with %s for %s', o.insurer_name, o.reference),
      'Record the sale once the insurer confirms cover and gives a policy or confirmation reference.', 'open', coalesce(uid_for, auth.uid()),
      now() + interval '2 days', nullif(p_copilot, 'workspace'), 'accepted:' || o.id, p_category, o.id)
    returning * into k;
  end if;
  return copilot_log_saved(p_category, p_copilot, 'sales.offer.accept', jsonb_build_object('offer_id', o.id, 'accepted_on', p_accepted_on), p_idempotency_key,
    jsonb_build_array(jsonb_build_object('table', 'sales_offers', 'id', o.id, 'reference', o.reference)),
    copilot_numbers(o.person_id, o.customer_id, null) || jsonb_build_object('record_type', 'offer', 'id', o.id, 'reference', o.reference,
      'offer', sales_offer_json(o), 'follow_up_reference', k.reference,
      'summary', case when already then format('Offer %s was already %s', o.reference, o.status)
                      else format('Recorded acceptance of offer %s on %s; follow-up %s to confirm cover', o.reference, to_char(o.accepted_at, 'DD Mon YYYY'), k.reference) end,
      'open_path', '/broker/book/clients/' || o.person_id || '?offer=' || o.id),
    'sales_offers', o.id);
end $$;

create or replace function public.sales_record_sale(p_category text, p_offer_id uuid, p_idempotency_key text,
  p_insurer_reference text default null, p_cover_start_date date default null, p_copilot text default 'workspace')
returns jsonb language plpgsql set search_path = public as $$
declare t uuid := sales_guard(p_category, true); replay jsonb := copilot_replay(p_idempotency_key); o sales_offers; s sales_records; pr persons; created boolean := false;
begin
  if replay is not null then return replay; end if;
  select * into o from sales_offers where id = p_offer_id for update;
  if o.id is null then raise exception using message = 'not_found', detail = 'That offer is not available in this category.'; end if;
  select * into s from sales_records where offer_id = o.id;
  if s.id is null then
    if o.status in ('declined','withdrawn') then raise exception using message = 'validation', detail = format('Offer %s is %s.', o.reference, o.status); end if;
    if nullif(trim(coalesce(p_insurer_reference, '')), '') is null or p_cover_start_date is null then
      raise exception using message = 'needs_input', detail = format('Give the insurer''s policy or confirmation reference and the cover start date for %s.', o.reference);
    end if;
    select * into pr from persons where id = o.person_id;
    insert into sales_records (tenant_id, data_category, offer_id, person_id, customer_id, insurer_reference, cover_start_date, premium_amount,
      premium_frequency, sold_by_member_id, referrer_member_id, enquiry_id, created_by, idempotency_key)
    values (t, p_category, o.id, o.person_id, o.customer_id, trim(p_insurer_reference), p_cover_start_date, o.premium_amount, o.premium_frequency,
      coalesce(o.responsible_member_id, app.my_member_id()), pr.referrer_member_id, coalesce(o.enquiry_id, pr.first_enquiry_id), auth.uid(), p_idempotency_key)
    on conflict (offer_id) do nothing
    returning * into s;
    if s.id is null then
      select * into s from sales_records where offer_id = o.id;
    else
      created := true;
      update sales_offers set status = 'sold', accepted_at = coalesce(accepted_at, now()), sent_at = coalesce(sent_at, now()), updated_at = now()
       where id = o.id returning * into o;
      update persons set contact_stage = 'client', updated_at = now() where id = o.person_id;
      update customers set status = 'active', updated_at = now()
       where id in (select customer_id from customer_persons where person_id = o.person_id and effective_to is null) and status = 'prospect';
      update tasks set status = 'done', updated_at = now() where offer_id = o.id and status = 'open';
      insert into client_interactions (tenant_id, data_category, kind, body, person_id, customer_id, direction, event, offer_id, copilot, created_by, idempotency_key)
      values (t, p_category, 'note', format('Sale %s recorded: %s confirmed cover, reference %s, starting %s', s.reference, o.insurer_name, s.insurer_reference,
        to_char(s.cover_start_date, 'DD Mon YYYY')), o.person_id, o.customer_id, 'internal', 'logged', o.id, nullif(p_copilot, 'workspace'), auth.uid(), 'sale:' || s.id);
    end if;
  end if;
  return copilot_log_saved(p_category, p_copilot, 'sales.sale.record',
    jsonb_build_object('offer_id', o.id, 'insurer_reference', p_insurer_reference, 'cover_start_date', p_cover_start_date), p_idempotency_key,
    jsonb_build_array(jsonb_build_object('table', 'sales_records', 'id', s.id, 'reference', s.reference)),
    copilot_numbers(o.person_id, o.customer_id, null) || jsonb_build_object('record_type', 'sale', 'id', s.id, 'reference', s.reference,
      'offer', sales_offer_json(o), 'already_recorded', not created,
      'summary', case when created
        then format('Recorded sale %s for offer %s: %s reference %s, cover from %s. %s is now a client', s.reference, o.reference, o.insurer_name,
             s.insurer_reference, to_char(s.cover_start_date, 'DD Mon YYYY'), (select client_number from persons where id = o.person_id))
        else format('Sale %s was already recorded for offer %s (reference %s); nothing was duplicated', s.reference, o.reference, s.insurer_reference) end,
      'open_path', '/broker/book/clients/' || o.person_id),
    'sales_records', s.id);
end $$;

-- ------------------------------------------------------------------ 15. Communications, follow-ups and the referral funnel
create or replace function public.sales_log_communication(p_category text, p_person_id uuid, p_kind text, p_body text, p_idempotency_key text,
  p_direction text default 'outbound', p_offer_id uuid default null, p_occurred_at timestamptz default null, p_copilot text default 'workspace')
returns jsonb language plpgsql set search_path = public as $$
declare t uuid := sales_guard(p_category, true); replay jsonb := copilot_replay(p_idempotency_key); pr persons; i client_interactions;
begin
  if replay is not null then return replay; end if;
  if coalesce(trim(p_body), '') = '' then raise exception using message = 'needs_input', detail = 'Give a short summary of the conversation.'; end if;
  if p_kind not in ('call','whatsapp','email','note','meeting') then raise exception using message = 'validation', detail = 'Choose call, WhatsApp, email, meeting or note.'; end if;
  if p_direction not in ('outbound','inbound','internal') then raise exception using message = 'validation', detail = 'Direction must be outbound, inbound or internal.'; end if;
  select * into pr from persons where id = p_person_id;
  if pr.id is null then raise exception using message = 'not_found', detail = 'That client is not available in this category.'; end if;
  if p_offer_id is not null and not exists (select 1 from sales_offers where id = p_offer_id and person_id = pr.id) then
    raise exception using message = 'not_linked', detail = 'That offer belongs to a different client.';
  end if;
  insert into client_interactions (tenant_id, data_category, kind, body, person_id, customer_id, direction, event, offer_id, occurred_at, copilot, created_by, idempotency_key)
  values (t, p_category, p_kind, trim(p_body), pr.id, sales_primary_account(pr.id), case when p_kind = 'note' then 'internal' else p_direction end,
    case when p_direction = 'inbound' then 'reply' when p_kind in ('whatsapp','email') and p_direction = 'outbound' then 'message_sent' else 'logged' end,
    p_offer_id, coalesce(p_occurred_at, now()), nullif(p_copilot, 'workspace'), auth.uid(), p_idempotency_key)
  returning * into i;
  return copilot_log_saved(p_category, p_copilot, 'sales.comms.log',
    jsonb_build_object('person_id', pr.id, 'kind', p_kind, 'direction', p_direction, 'offer_id', p_offer_id, 'body', p_body), p_idempotency_key,
    jsonb_build_array(jsonb_build_object('table', 'client_interactions', 'id', i.id, 'reference', i.reference)),
    copilot_numbers(pr.id, i.customer_id, null) || jsonb_build_object('record_type', 'interaction', 'id', i.id, 'reference', i.reference,
      'summary', format('Logged %s %s with %s (%s)%s', case i.direction when 'inbound' then 'incoming' when 'outbound' then 'outgoing' else '' end,
        case i.kind when 'whatsapp' then 'WhatsApp' else i.kind end, pr.first_names || ' ' || pr.surname, pr.client_number,
        coalesce(' on offer ' || (select reference from sales_offers where id = p_offer_id), '')),
      'open_path', '/broker/book/clients/' || pr.id),
    'client_interactions', i.id);
end $$;

create or replace function public.sales_create_follow_up(p_category text, p_person_id uuid, p_title text, p_idempotency_key text,
  p_due_date timestamptz default null, p_offer_id uuid default null, p_detail text default null, p_copilot text default 'workspace')
returns jsonb language plpgsql set search_path = public as $$
declare t uuid := sales_guard(p_category, true); replay jsonb := copilot_replay(p_idempotency_key); pr persons; k tasks;
begin
  if replay is not null then return replay; end if;
  if coalesce(trim(p_title), '') = '' then raise exception using message = 'needs_input', detail = 'What is the follow-up?'; end if;
  select * into pr from persons where id = p_person_id;
  if pr.id is null then raise exception using message = 'not_found', detail = 'That client is not available in this category.'; end if;
  if p_offer_id is not null and not exists (select 1 from sales_offers where id = p_offer_id and person_id = pr.id) then
    raise exception using message = 'not_linked', detail = 'That offer belongs to a different client.';
  end if;
  insert into tasks (tenant_id, customer_id, person_id, subject_table, subject_id, kind, audience, title, detail, status, assigned_to, due_date,
    created_by_agent, dedupe_key, data_category, offer_id)
  values (t, sales_primary_account(pr.id), pr.id, case when p_offer_id is not null then 'sales_offers' end, p_offer_id, 'follow_up', 'broker',
    trim(p_title), p_detail, 'open', auth.uid(), p_due_date, nullif(p_copilot, 'workspace'), p_idempotency_key, p_category, p_offer_id)
  returning * into k;
  return copilot_log_saved(p_category, p_copilot, 'sales.followup.create',
    jsonb_build_object('person_id', pr.id, 'title', p_title, 'due_date', p_due_date, 'offer_id', p_offer_id), p_idempotency_key,
    jsonb_build_array(jsonb_build_object('table', 'tasks', 'id', k.id, 'reference', k.reference)),
    copilot_numbers(pr.id, k.customer_id, null) || jsonb_build_object('record_type', 'task', 'id', k.id, 'reference', k.reference,
      'summary', format('Created follow-up %s for %s%s: %s', k.reference, pr.first_names || ' ' || pr.surname,
        coalesce(' on ' || to_char(k.due_date, 'Dy DD Mon'), ''), k.title),
      'open_path', '/broker/book/clients/' || pr.id),
    'tasks', k.id);
end $$;

create or replace function public.sales_complete_follow_up(p_category text, p_task_id uuid) returns jsonb
language plpgsql set search_path = public as $$
declare t uuid := sales_guard(p_category, true); k tasks;
begin
  update tasks set status = 'done', updated_at = now() where id = p_task_id and tenant_id = t and status = 'open' returning * into k;
  if k.id is null then raise exception using message = 'not_found', detail = 'That follow-up is not open or not available.'; end if;
  return jsonb_build_object('outcome', 'saved', 'id', k.id, 'reference', k.reference);
end $$;

create or replace function public.sales_referral_funnel(p_category text) returns jsonb language plpgsql stable set search_path = public as $$
declare t uuid := sales_guard(p_category);
begin
  return jsonb_build_object('category', p_category, 'members', coalesce((select jsonb_agg(x order by (x ->> 'enquiries')::int desc, x ->> 'name') from (
    select app.member_json(m.id, p_category) || jsonb_build_object(
      'enquiries', (select count(*) from sales_enquiries e where e.referrer_member_id = m.id),
      'prospects', (select count(*) from persons p where p.referrer_member_id = m.id and p.contact_stage = 'prospect'),
      'with_offer', (select count(distinct o.person_id) from sales_offers o join persons p on p.id = o.person_id where p.referrer_member_id = m.id),
      'offers_sent', (select count(*) from sales_offers o join persons p on p.id = o.person_id where p.referrer_member_id = m.id and o.status in ('sent','accepted','sold')),
      'accepted', (select count(*) from sales_offers o join persons p on p.id = o.person_id where p.referrer_member_id = m.id and o.status in ('accepted','sold')),
      'sold', (select count(*) from sales_records s where s.referrer_member_id = m.id),
      'sold_premium', (select coalesce(sum(case s.premium_frequency when 'annually' then s.premium_amount / 12 when 'quarterly' then s.premium_amount / 3 else s.premium_amount end), 0)
                         from sales_records s where s.referrer_member_id = m.id)) as x
      from sales_team_members m where m.tenant_id = t) y), '[]'));
end $$;

-- whoami also reports whether Live is open for the brokerage.
create or replace function public.copilot_whoami() returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object(
    'user_id', auth.uid(),
    'name', (select full_name from app_users where id = auth.uid()),
    'tenant_id', app.tenant_id(),
    'brokerage', (select name from organisations where id = app.tenant_id()),
    'brokerage_active', app.tenant_operational(),
    'role', app.role(),
    'is_staff', app.is_staff(),
    'can_write', app.can_write(),
    'active_category', app.active_category(),
    'hook_claims', (auth.jwt() ? 'tenant_id') and (auth.jwt() ? 'app_role'))
$$;

-- ------------------------------------------------------------------ 16. Access to the functions
do $$ declare f text; begin
  foreach f in array array['sales_guard(text,boolean)','sales_person_json(uuid)','sales_primary_account(uuid)',
    'sales_setup_workspace(text,text,text,text)','sales_my_profile()',
    'sales_invite_member(text,text,text,text,text,text,text,text)','sales_invite_link(text,uuid)','sales_list_team(text)',
    'sales_accept_invitation(text)',
    'sales_capture_enquiry(text,text,text,text,text,text,text,text,text,text,uuid,uuid,boolean,text)',
    'sales_resolve_enquiry_match(text,uuid,text,uuid,boolean,text)',
    'sales_stage(uuid,text)','sales_book_grid(text,text,uuid,text,text,integer,integer)','sales_offer_json(sales_offers)',
    'sales_client_record(text,uuid)','sales_reassign_client(text,uuid,uuid,text,text,text)',
    'sales_offer_message(text,uuid)','sales_create_offer(text,uuid,text,uuid,text,text,numeric,text,uuid,text,text)',
    'sales_log_share_opened(text,uuid,text,text)','sales_mark_offer_sent(text,uuid,text,text,text,text)',
    'sales_record_acceptance(text,uuid,text,date,text,text)','sales_record_sale(text,uuid,text,text,date,text)',
    'sales_log_communication(text,uuid,text,text,text,text,uuid,timestamptz,text)',
    'sales_create_follow_up(text,uuid,text,text,timestamptz,uuid,text,text)','sales_complete_follow_up(text,uuid)',
    'sales_referral_funnel(text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['referral_resolve(text)','referral_submit_enquiry(text,text,text,text,text,text,text,boolean,text,text)',
    'sales_invitation_preview(text)'] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $$;

commit;
