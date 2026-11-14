-- InsureFlow AI / B-Covered: records the AR, Ava and Russ copilots read and write.
-- Sample / Live category on every copilot record, enforced by the database; client, account, note and task numbers;
-- notes and interactions; the copilot action log; row-level security for signed-in (JWT) requests.
-- Apply after 20261110_0011_split_staff_policies.sql.

begin;

create extension if not exists pg_trgm with schema extensions;

-- ------------------------------------------------------------------ 0. Signed-in identity without depending on the token hook
-- The access token hook adds tenant_id and app_role claims. Until it is registered, fall back to the active membership.
create or replace function app.tenant_id() returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    nullif(auth.jwt() ->> 'tenant_id', '')::uuid,
    nullif(current_setting('app.tenant_id', true), '')::uuid,
    (select m.tenant_id from app_users u
       join organisation_memberships m on m.user_id = u.id and m.tenant_id = u.active_organisation_id and m.status = 'active'
      where u.id = auth.uid())
  )
$$;

create or replace function app.role() returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(auth.jwt() ->> 'app_role', 'none'), app.member_role(), 'visitor')
$$;

-- ------------------------------------------------------------------ 1. Sample / Live category
do $$ declare t text; begin
  foreach t in array array['customers','persons','customer_persons','policies','policy_parties','leads','quotes',
    'needs_analyses','life_quotes','records_of_advice','tasks','communications','conversations','conversation_messages',
    'business_profiles','group_schemes','employments','scheme_memberships'] loop
    execute format($f$alter table %I add column data_category text not null default 'sample' check (data_category in ('sample','live'))$f$, t);
    execute format('alter table %I alter column data_category drop default', t);
  end loop;
end $$;
alter table audit_events
  add column data_category text check (data_category in ('sample','live')),
  add column copilot text check (copilot in ('ar','ava','russ'));

-- Live only with established provenance; anything uncertain stays Sample.
update customers set data_category = 'live' where data_origin in ('imported','live') and not is_synthetic;
do $$ declare t text; begin
  foreach t in array array['customer_persons','policies','leads','quotes','needs_analyses','life_quotes','records_of_advice',
    'tasks','communications','business_profiles'] loop
    execute format('update %I x set data_category = c.data_category from customers c where c.id = x.customer_id', t);
  end loop;
  foreach t in array array['group_schemes','employments','scheme_memberships'] loop
    execute format('update %I x set data_category = c.data_category from customers c where c.id = x.employer_customer_id', t);
  end loop;
end $$;
update persons p set data_category = 'live' where not p.is_synthetic
  and exists (select 1 from customer_persons cp where cp.person_id = p.id and cp.data_category = 'live');
update policy_parties pp set data_category = p.data_category from policies p where p.id = pp.policy_id;

-- ------------------------------------------------------------------ 2. Linked records share a category
alter table customers add constraint customers_id_category_key unique (id, data_category);
alter table persons   add constraint persons_id_category_key   unique (id, data_category);
alter table policies  add constraint policies_id_category_key  unique (id, data_category);
alter table customer_persons
  add constraint customer_persons_customer_cat_fk foreign key (customer_id, data_category) references customers (id, data_category),
  add constraint customer_persons_person_cat_fk   foreign key (person_id,   data_category) references persons   (id, data_category);
alter table policy_parties
  add constraint policy_parties_policy_cat_fk foreign key (policy_id, data_category) references policies (id, data_category),
  add constraint policy_parties_person_cat_fk foreign key (person_id, data_category) references persons  (id, data_category);
do $$ declare t text; begin
  foreach t in array array['policies','leads','quotes','needs_analyses','life_quotes','records_of_advice','tasks','communications',
    'conversations','business_profiles'] loop
    execute format('alter table %I add constraint %I foreign key (customer_id, data_category) references customers (id, data_category)', t, t || '_customer_cat_fk');
  end loop;
  foreach t in array array['group_schemes','employments','scheme_memberships'] loop
    execute format('alter table %I add constraint %I foreign key (employer_customer_id, data_category) references customers (id, data_category)', t, t || '_employer_cat_fk');
  end loop;
  foreach t in array array['needs_analyses','life_quotes','records_of_advice','employments','scheme_memberships'] loop
    execute format('alter table %I add constraint %I foreign key (person_id, data_category) references persons (id, data_category)', t, t || '_person_cat_fk');
  end loop;
end $$;

-- ------------------------------------------------------------------ 3. Client, account, note and task numbers
alter table persons   add column client_number  text;
alter table customers add column account_number text;
alter table tasks
  add column reference text, add column person_id uuid, add column policy_id uuid,
  add constraint tasks_person_cat_fk foreign key (person_id, data_category) references persons  (id, data_category),
  add constraint tasks_policy_cat_fk foreign key (policy_id, data_category) references policies (id, data_category);

create table number_sequences (
  tenant_id uuid not null references organisations(id),
  kind text not null check (kind in ('client','account','note','task')),
  data_category text not null check (data_category in ('sample','live')),
  last_value bigint not null default 1001,
  primary key (tenant_id, kind, data_category)
);
alter table number_sequences enable row level security;

create or replace function app.next_number(p_tenant uuid, p_kind text, p_category text) returns text
language plpgsql security definer set search_path = public as $$
declare v bigint;
begin
  insert into number_sequences (tenant_id, kind, data_category) values (p_tenant, p_kind, p_category)
  on conflict (tenant_id, kind, data_category) do update set last_value = number_sequences.last_value + 1
  returning last_value into v;
  return (case p_kind when 'client' then 'CL' when 'account' then 'AC' when 'note' then 'NT' else 'TK' end)
      || (case p_category when 'sample' then '-S' else '-' end) || v;
end $$;
revoke all on function app.next_number(uuid, text, text) from public, anon, authenticated;

-- ------------------------------------------------------------------ 4. Notes and interactions; the copilot action log
create table client_interactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  data_category text not null check (data_category in ('sample','live')),
  reference text not null,
  kind text not null check (kind in ('note','call','meeting','email','callback_request')),
  body text not null,
  person_id uuid, customer_id uuid, policy_id uuid,
  subject_table text, subject_id uuid,
  business_line text check (business_line in ('short_term_personal','short_term_commercial','individual_life','group_risk')),
  copilot text check (copilot in ('ar','ava','russ')),
  created_by uuid not null references app_users(id),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  check (person_id is not null or customer_id is not null),
  foreign key (person_id,   data_category) references persons   (id, data_category),
  foreign key (customer_id, data_category) references customers (id, data_category),
  foreign key (policy_id,   data_category) references policies  (id, data_category),
  unique (tenant_id, idempotency_key)
);
create unique index client_interactions_reference_key on client_interactions (tenant_id, data_category, reference);
create index client_interactions_person_idx on client_interactions (person_id, created_at desc);
create index client_interactions_customer_idx on client_interactions (customer_id, created_at desc);
create index client_interactions_policy_idx on client_interactions (policy_id, created_at desc);

create table copilot_actions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  data_category text not null check (data_category in ('sample','live')),
  conversation_id uuid,
  requested_by uuid not null references app_users(id),
  copilot text not null check (copilot in ('ar','ava','russ')),
  tool text not null,
  args jsonb not null,
  outcome text not null check (outcome in ('saved','retrieved','needs_input','failed','refused')),
  affected jsonb not null default '[]',
  result jsonb,
  error text,
  idempotency_key text,
  created_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key)
);
create index copilot_actions_recent_idx on copilot_actions (tenant_id, created_at desc);

create or replace function app.assign_reference() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'persons' and new.client_number is null then
    new.client_number := app.next_number(new.tenant_id, 'client', new.data_category);
  elsif tg_table_name = 'customers' and new.account_number is null then
    new.account_number := app.next_number(new.tenant_id, 'account', new.data_category);
  elsif tg_table_name = 'client_interactions' and new.reference is null then
    new.reference := app.next_number(new.tenant_id, 'note', new.data_category);
  elsif tg_table_name = 'tasks' and new.reference is null then
    new.reference := app.next_number(new.tenant_id, 'task', new.data_category);
  end if;
  return new;
end $$;
create trigger assign_reference before insert on persons             for each row execute function app.assign_reference();
create trigger assign_reference before insert on customers           for each row execute function app.assign_reference();
create trigger assign_reference before insert on tasks               for each row execute function app.assign_reference();
create trigger assign_reference before insert on client_interactions for each row execute function app.assign_reference();

update persons   set client_number  = app.next_number(tenant_id, 'client',  data_category) where client_number  is null;
update customers set account_number = app.next_number(tenant_id, 'account', data_category) where account_number is null;
alter table persons   alter column client_number  set not null;
alter table customers alter column account_number set not null;
create unique index persons_client_number_key    on persons   (tenant_id, data_category, client_number);
create unique index customers_account_number_key on customers (tenant_id, data_category, account_number);
create unique index policies_number_key on policies (tenant_id, data_category, provider_id, policy_number) where policy_number is not null;
create index persons_name_trgm   on persons   using gin ((first_names || ' ' || surname) extensions.gin_trgm_ops);
create index customers_name_trgm on customers using gin (full_name extensions.gin_trgm_ops);

-- ------------------------------------------------------------------ 5. Row-level security for signed-in requests
-- Category comes from the x-data-category request header; Live needs a staff role, anything else sees nothing.
create or replace function app.active_category() returns text language sql stable as $$
  select case coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-data-category', 'sample')
    when 'sample' then 'sample'
    when 'live' then case when app.is_staff() then 'live' else 'denied' end
    else 'denied' end
$$;

do $$ declare t text; begin
  -- 0001–0008 policies read current_setting('app.tenant_id'), which a signed-in (JWT) request never sets.
  for t in select distinct tablename from pg_policies
           where schemaname = 'public' and policyname = 'tenant_isolation' and tablename not in ('app_users') loop
    execute format('drop policy tenant_isolation on %I', t);
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'staff_tenant') then
      execute format($p$create policy staff_tenant on %I for all to authenticated
        using (tenant_id = (select app.tenant_id()) and (select app.is_staff()))
        with check (tenant_id = (select app.tenant_id()) and (select app.is_staff()))$p$, t);
    end if;
  end loop;
end $$;

drop policy if exists tenant_isolation on app_users;
create policy self_read on app_users for select to authenticated using (id = auth.uid());
create policy colleague_read on app_users for select to authenticated using (
  (select app.is_staff()) and exists (select 1 from organisation_memberships m
    where m.user_id = app_users.id and m.tenant_id = (select app.tenant_id()) and m.status = 'active'));

drop policy if exists tenant_self on organisations;
create policy member_read on organisations for select to authenticated using (
  id = (select app.tenant_id())
  or exists (select 1 from organisation_memberships m where m.tenant_id = organisations.id and m.user_id = auth.uid() and m.status = 'active'));
create policy self_read on organisation_memberships for select to authenticated using (user_id = auth.uid());

alter table client_interactions enable row level security;
alter table copilot_actions     enable row level security;
create policy staff_tenant on client_interactions for all to authenticated
  using (tenant_id = (select app.tenant_id()) and (select app.is_staff()))
  with check (tenant_id = (select app.tenant_id()) and (select app.is_staff()) and created_by = auth.uid());
create policy staff_read on copilot_actions for select to authenticated
  using (tenant_id = (select app.tenant_id()) and (select app.is_staff()));
create policy staff_insert on copilot_actions for insert to authenticated
  with check (tenant_id = (select app.tenant_id()) and (select app.is_staff()) and requested_by = auth.uid());

do $$ declare t text; begin
  foreach t in array array['customers','persons','customer_persons','policies','policy_parties','leads','quotes','needs_analyses',
    'life_quotes','records_of_advice','tasks','communications','conversations','conversation_messages','business_profiles',
    'group_schemes','employments','scheme_memberships','client_interactions','copilot_actions'] loop
    execute format($p$create policy category_scope on %I as restrictive for all to authenticated
      using (data_category = (select app.active_category())) with check (data_category = (select app.active_category()))$p$, t);
  end loop;
  foreach t in array array['client_interactions','copilot_actions','number_sequences'] loop
    execute format($p$create policy writer_insert on %I as restrictive for insert to authenticated with check (app.can_write())$p$, t);
  end loop;
end $$;

commit;
