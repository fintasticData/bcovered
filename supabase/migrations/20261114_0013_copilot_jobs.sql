-- InsureFlow AI / B-Covered: the business operations behind the AR, Ava and Russ MCP jobs.
-- Every function runs as the signed-in broker (security invoker), so tenant, staff and Sample / Live row-level security
-- apply to each read and write. Writes take an idempotency key: a repeated key returns the original receipt.
-- Apply after 20261114_0012_copilot_records.sql.

begin;

-- ------------------------------------------------------------------ 1. Policy cover type and system reference
alter table policies
  add column cover_type text check (cover_type in ('motor','home','contents','motorbike','valuables','commercial_package',
    'commercial_property','liability','fleet','life','disability','funeral','group_life','group_disability','other')),
  add column reference text;

alter table number_sequences drop constraint number_sequences_kind_check;
alter table number_sequences add constraint number_sequences_kind_check check (kind in ('client','account','note','task','policy'));

create or replace function app.next_number(p_tenant uuid, p_kind text, p_category text) returns text
language plpgsql security definer set search_path = public as $$
declare v bigint;
begin
  insert into number_sequences (tenant_id, kind, data_category) values (p_tenant, p_kind, p_category)
  on conflict (tenant_id, kind, data_category) do update set last_value = number_sequences.last_value + 1
  returning last_value into v;
  return (case p_kind when 'client' then 'CL' when 'account' then 'AC' when 'note' then 'NT' when 'policy' then 'PL' else 'TK' end)
      || (case p_category when 'sample' then '-S' else '-' end) || v;
end $$;
revoke all on function app.next_number(uuid, text, text) from public, anon, authenticated;

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
  elsif tg_table_name = 'policies' and new.reference is null then
    new.reference := app.next_number(new.tenant_id, 'policy', new.data_category);
  end if;
  return new;
end $$;
create trigger assign_reference before insert on policies for each row execute function app.assign_reference();
update policies set reference = app.next_number(tenant_id, 'policy', data_category) where reference is null;
alter table policies alter column reference set not null;
create unique index policies_reference_key on policies (tenant_id, data_category, reference);

-- ------------------------------------------------------------------ 2. Shared helpers
-- Every job starts here: a signed-in staff member of an active brokerage, working in the category the request header names.
create or replace function public.copilot_guard(p_category text) returns uuid
language plpgsql stable set search_path = public as $$
declare t uuid := app.tenant_id(); active text := app.active_category();
begin
  if auth.uid() is null or t is null then
    raise exception using message = 'forbidden', detail = 'Sign in with an active brokerage membership to use the copilots.';
  end if;
  if not app.is_staff() then
    raise exception using message = 'forbidden', detail = 'Only brokerage staff can use the copilots.';
  end if;
  if active = 'denied' then
    raise exception using message = 'forbidden', detail = 'This category is not available to you.';
  end if;
  if p_category is distinct from active then
    raise exception using message = 'category_mismatch',
      detail = format('The request asked for %s records but the connection is scoped to %s.', coalesce(p_category, 'no'), active);
  end if;
  return t;
end $$;

create or replace function public.copilot_line_of(p_copilot text) returns text[] language sql immutable as $$
  select case p_copilot
    when 'ava'  then array['short_term_personal','individual_life']
    when 'russ' then array['short_term_commercial','group_risk']
    else array['short_term_personal','short_term_commercial','individual_life','group_risk'] end
$$;

create or replace function public.copilot_policy_path(p_line text, p_id uuid, p_customer uuid) returns text language sql immutable as $$
  select case p_line
    when 'short_term_personal' then '/broker/personal/policies/' || p_id
    when 'individual_life' then '/broker/life/policies/' || p_id
    else '/broker/accounts/' || p_customer end
$$;

create or replace function public.copilot_policy_json(p policies) returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', p.id, 'reference', p.reference, 'policy_number', p.policy_number,
    'display_number', coalesce(p.policy_number, p.reference),
    'line', p.line, 'cover_type', p.cover_type, 'status', p.status,
    'provider', (select i.name from insurers i where i.id = p.provider_id),
    'premium_amount', p.premium_amount, 'premium_frequency', p.premium_frequency,
    'inception_date', p.inception_date,
    'account', (select jsonb_build_object('id', c.id, 'number', c.account_number, 'name', c.full_name) from customers c where c.id = p.customer_id),
    'open_path', copilot_policy_path(p.line, p.id, p.customer_id),
    'category', p.data_category, 'updated_at', p.updated_at)
$$;

create or replace function public.copilot_numbers(p_person uuid, p_customer uuid, p_policy uuid) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'client_id', p_person,
    'client_number', (select client_number from persons where id = p_person),
    'client_name', (select trim(coalesce(preferred_name, first_names) || ' ' || surname) from persons where id = p_person),
    'account_id', p_customer,
    'account_number', (select account_number from customers where id = p_customer),
    'account_name', (select full_name from customers where id = p_customer),
    'policy_id', p_policy,
    'policy_number', (select coalesce(policy_number, reference) from policies where id = p_policy),
    'policy_reference', (select reference from policies where id = p_policy))
$$;

-- A repeated idempotency key returns the receipt saved the first time.
create or replace function public.copilot_replay(p_key text) returns jsonb language sql stable set search_path = public as $$
  select a.result || jsonb_build_object('replayed', true)
  from copilot_actions a
  where p_key is not null and a.tenant_id = app.tenant_id() and a.idempotency_key = p_key and a.outcome = 'saved'
$$;

create or replace function public.copilot_log_saved(p_category text, p_copilot text, p_tool text, p_args jsonb, p_key text,
  p_affected jsonb, p_result jsonb, p_entity_table text, p_entity_id uuid) returns jsonb
language plpgsql set search_path = public as $$
declare t uuid := app.tenant_id(); receipt jsonb := p_result || jsonb_build_object('outcome', 'saved', 'category', p_category, 'replayed', false);
begin
  insert into copilot_actions (tenant_id, data_category, requested_by, copilot, tool, args, outcome, affected, result, idempotency_key)
  values (t, p_category, auth.uid(), coalesce(p_copilot, 'ar'), p_tool, coalesce(p_args, '{}'), 'saved', coalesce(p_affected, '[]'), receipt, p_key);
  insert into audit_events (tenant_id, actor_type, actor_id, action, entity_table, entity_id, after, data_category, copilot)
  values (t, 'user', auth.uid()::text, 'copilot.' || p_tool, p_entity_table, p_entity_id, receipt, p_category, coalesce(p_copilot, 'ar'));
  return receipt;
end $$;

-- ------------------------------------------------------------------ 3. Search: exact number, name, similar spelling
create or replace function public.copilot_search_records(p_category text, p_query text, p_kinds text[] default null, p_limit int default 8)
returns jsonb language plpgsql stable set search_path = public, extensions as $$
declare q text := trim(coalesce(p_query, '')); ql text := lower(trim(coalesce(p_query, ''))); res jsonb;
begin
  perform copilot_guard(p_category);
  if length(q) < 2 then return '[]'::jsonb; end if;
  with clients as (
    select 'client'::text as record_type, p.id, p.client_number as number,
      trim(coalesce(p.preferred_name, p.first_names) || ' ' || p.surname) as name,
      case when lower(p.client_number) = ql then 3
           when (p.first_names || ' ' || p.surname) ilike '%' || q || '%' or coalesce(p.preferred_name, '') ilike q || '%' then 2
           else 1 end as rank,
      greatest(similarity(p.first_names || ' ' || p.surname, q), word_similarity(q, p.first_names || ' ' || p.surname)) as score,
      (select jsonb_build_object('id', c.id, 'number', c.account_number, 'name', c.full_name)
         from customer_persons cp join customers c on c.id = cp.customer_id
        where cp.person_id = p.id and cp.effective_to is null
        order by cp.is_primary desc, (cp.role = 'self') desc limit 1) as account,
      'Client'::text as detail,
      '/broker/people/' || p.id as open_path
    from persons p
    where (p_kinds is null or 'client' = any (p_kinds))
      and (lower(p.client_number) = ql
           or (p.first_names || ' ' || p.surname) ilike '%' || q || '%'
           or coalesce(p.preferred_name, '') ilike q || '%'
           or word_similarity(q, p.first_names || ' ' || p.surname) > 0.45)
  ), accounts as (
    select 'account'::text, c.id, c.account_number,
      c.full_name,
      case when lower(c.account_number) = ql or lower(coalesce(c.source_ref, '')) = ql then 3
           when c.full_name ilike '%' || q || '%' then 2 else 1 end,
      greatest(similarity(c.full_name, q), word_similarity(q, c.full_name)),
      null::jsonb,
      (case c.customer_type when 'commercial' then 'Business account' else 'Personal account' end)
        || case when c.source_ref is not null then ' · previous ref ' || c.source_ref else '' end,
      '/broker/accounts/' || c.id
    from customers c
    where (p_kinds is null or 'account' = any (p_kinds))
      and (lower(c.account_number) = ql or lower(coalesce(c.source_ref, '')) = ql
           or c.full_name ilike '%' || q || '%' or word_similarity(q, c.full_name) > 0.45)
  ), pols as (
    select 'policy'::text, p.id, coalesce(p.policy_number, p.reference),
      c.full_name,
      case when lower(coalesce(p.policy_number, '')) = ql or lower(p.reference) = ql then 3 else 2 end,
      1::real,
      jsonb_build_object('id', c.id, 'number', c.account_number, 'name', c.full_name),
      initcap(replace(coalesce(p.cover_type, p.line), '_', ' ')) || ' · ' || replace(p.status, '_', ' '),
      copilot_policy_path(p.line, p.id, p.customer_id)
    from policies p join customers c on c.id = p.customer_id
    where (p_kinds is null or 'policy' = any (p_kinds))
      and (lower(coalesce(p.policy_number, '')) = ql or lower(p.reference) = ql
           or (length(q) >= 4 and (p.policy_number ilike q || '%' or p.reference ilike q || '%')))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'record_type', x.record_type, 'id', x.id, 'number', x.number, 'name', x.name, 'detail', x.detail,
      'account', x.account, 'open_path', x.open_path, 'category', p_category,
      'match', case x.rank when 3 then 'exact' when 2 then 'name' else 'similar' end)
      order by x.rank desc, x.score desc, x.name), '[]'::jsonb)
    into res
  from (select * from (select * from clients union all select * from accounts union all select * from pols) u
        order by rank desc, score desc, name limit greatest(1, least(coalesce(p_limit, 8), 25))) x;
  return res;
end $$;

-- ------------------------------------------------------------------ 4. Overviews
create or replace function public.copilot_record_overview(p_category text, p_record_type text, p_id uuid, p_scope text default 'all')
returns jsonb language plpgsql stable set search_path = public as $$
declare lines text[] := copilot_line_of(case p_scope when 'people' then 'ava' when 'business' then 'russ' else null end);
  account_ids uuid[]; res jsonb;
begin
  perform copilot_guard(p_category);
  if p_record_type = 'client' then
    if not exists (select 1 from persons where id = p_id) then
      raise exception using message = 'not_found', detail = 'That client is not available in this category.';
    end if;
    select coalesce(array_agg(customer_id), '{}') into account_ids from customer_persons where person_id = p_id and effective_to is null;
    select jsonb_build_object(
      'record_type', 'client',
      'client', (select jsonb_build_object('id', p.id, 'number', p.client_number, 'name', trim(coalesce(p.preferred_name, p.first_names) || ' ' || p.surname),
                   'date_of_birth', p.date_of_birth, 'open_path', '/broker/people/' || p.id, 'category', p.data_category) from persons p where p.id = p_id),
      'accounts', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'number', c.account_number, 'name', c.full_name, 'type', c.customer_type,
                   'role', cp.role, 'open_path', '/broker/accounts/' || c.id) order by cp.is_primary desc, c.full_name)
                   from customer_persons cp join customers c on c.id = cp.customer_id where cp.person_id = p_id and cp.effective_to is null), '[]'),
      'policies', coalesce((select jsonb_agg(copilot_policy_json(x) order by x.updated_at desc) from policies x
                   where x.line = any (lines) and (x.customer_id = any (account_ids)
                     or exists (select 1 from policy_parties pp where pp.policy_id = x.id and pp.person_id = p_id and pp.effective_to is null))), '[]'),
      'schemes', case when 'group_risk' = any (lines) then coalesce((select jsonb_agg(jsonb_build_object('scheme_id', g.id, 'name', g.name, 'employer', c.full_name,
                   'status', m.status, 'cover_amount', m.cover_amount, 'open_path', '/broker/accounts/' || c.id))
                   from scheme_memberships m join group_schemes g on g.id = m.scheme_id join customers c on c.id = m.employer_customer_id
                   where m.person_id = p_id), '[]') else '[]'::jsonb end,
      'interactions', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'reference', i.reference, 'kind', i.kind, 'body', i.body,
                   'created_at', i.created_at, 'copilot', i.copilot) order by i.created_at desc)
                   from (select * from client_interactions where person_id = p_id or customer_id = any (account_ids) order by created_at desc limit 5) i), '[]'),
      'open_tasks', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'reference', t.reference, 'title', t.title, 'due_date', t.due_date) order by t.due_date nulls last)
                   from tasks t where t.status = 'open' and (t.person_id = p_id or t.customer_id = any (account_ids))), '[]'))
      into res;
    return res;
  elsif p_record_type = 'account' then
    if not exists (select 1 from customers where id = p_id) then
      raise exception using message = 'not_found', detail = 'That account is not available in this category.';
    end if;
    select jsonb_build_object(
      'record_type', 'account',
      'account', (select jsonb_build_object('id', c.id, 'number', c.account_number, 'name', c.full_name, 'type', c.customer_type, 'status', c.status,
                   'previous_ref', c.source_ref, 'open_path', '/broker/accounts/' || c.id, 'category', c.data_category) from customers c where c.id = p_id),
      'people', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'number', p.client_number, 'name', trim(coalesce(p.preferred_name, p.first_names) || ' ' || p.surname),
                   'role', cp.role, 'open_path', '/broker/people/' || p.id) order by (cp.role = 'self') desc, p.surname)
                   from customer_persons cp join persons p on p.id = cp.person_id where cp.customer_id = p_id and cp.effective_to is null), '[]'),
      'business', (select jsonb_build_object('id', b.id, 'registered_name', b.registered_name, 'trading_name', b.trading_name, 'industry', b.industry_key,
                   'employees', b.employee_count, 'open_path', '/broker/commercial/clients/' || b.id) from business_profiles b where b.customer_id = p_id limit 1),
      'policies', coalesce((select jsonb_agg(copilot_policy_json(x) order by x.updated_at desc) from policies x where x.customer_id = p_id and x.line = any (lines)), '[]'),
      'schemes', case when 'group_risk' = any (lines) then coalesce((select jsonb_agg(jsonb_build_object('scheme_id', g.id, 'name', g.name, 'benefit', g.benefit_type_key,
                   'policy_number', g.policy_number, 'status', g.status,
                   'members', (select count(*) from scheme_memberships m where m.scheme_id = g.id and m.status = 'active')))
                   from group_schemes g where g.employer_customer_id = p_id), '[]') else '[]'::jsonb end,
      'interactions', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'reference', i.reference, 'kind', i.kind, 'body', i.body,
                   'created_at', i.created_at, 'copilot', i.copilot) order by i.created_at desc)
                   from (select * from client_interactions where customer_id = p_id order by created_at desc limit 5) i), '[]'),
      'open_tasks', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'reference', t.reference, 'title', t.title, 'due_date', t.due_date) order by t.due_date nulls last)
                   from tasks t where t.status = 'open' and t.customer_id = p_id), '[]'))
      into res;
    return res;
  end if;
  raise exception using message = 'validation', detail = 'record_type must be client or account.';
end $$;

-- ------------------------------------------------------------------ 5. Policies and life applications
create or replace function public.copilot_list_policies(p_category text, p_person_id uuid default null, p_customer_id uuid default null,
  p_copilot text default null, p_cover_type text default null, p_status text default null)
returns jsonb language plpgsql stable set search_path = public as $$
declare account_ids uuid[];
begin
  perform copilot_guard(p_category);
  if p_person_id is null and p_customer_id is null then
    raise exception using message = 'needs_input', detail = 'Choose a client or account first.';
  end if;
  if p_customer_id is not null then account_ids := array[p_customer_id];
  else select coalesce(array_agg(customer_id), '{}') into account_ids from customer_persons where person_id = p_person_id and effective_to is null;
  end if;
  return coalesce((select jsonb_agg(copilot_policy_json(x) order by x.updated_at desc) from policies x
    where x.line = any (copilot_line_of(p_copilot))
      and (p_cover_type is null or x.cover_type = p_cover_type or (p_cover_type = 'life' and x.line = 'individual_life'))
      and (p_status is null or x.status = p_status)
      and (x.customer_id = any (account_ids)
           or (p_person_id is not null and exists (select 1 from policy_parties pp where pp.policy_id = x.id and pp.person_id = p_person_id and pp.effective_to is null)))), '[]');
end $$;

create or replace function public.copilot_get_policy(p_category text, p_policy_id uuid) returns jsonb
language plpgsql stable set search_path = public as $$
declare p policies;
begin
  perform copilot_guard(p_category);
  select * into p from policies where id = p_policy_id;
  if p.id is null then raise exception using message = 'not_found', detail = 'That policy is not available in this category.'; end if;
  return copilot_policy_json(p) || jsonb_build_object(
    'parties', coalesce((select jsonb_agg(jsonb_build_object('person_id', pr.id, 'client_number', pr.client_number,
                 'name', trim(coalesce(pr.preferred_name, pr.first_names) || ' ' || pr.surname), 'role', pp.role, 'share_pct', pp.share_pct))
                 from policy_parties pp join persons pr on pr.id = pp.person_id where pp.policy_id = p.id and pp.effective_to is null), '[]'),
    'interactions', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'reference', i.reference, 'kind', i.kind, 'body', i.body,
                 'created_at', i.created_at, 'copilot', i.copilot) order by i.created_at desc)
                 from client_interactions i where i.policy_id = p.id), '[]'));
end $$;

create or replace function public.copilot_get_life_application(p_category text, p_person_id uuid default null, p_customer_id uuid default null)
returns jsonb language plpgsql stable set search_path = public as $$
declare account_ids uuid[]; p policies;
begin
  perform copilot_guard(p_category);
  if p_customer_id is not null then account_ids := array[p_customer_id];
  else select coalesce(array_agg(customer_id), '{}') into account_ids from customer_persons where person_id = p_person_id and effective_to is null;
  end if;
  select * into p from policies x
   where x.line = 'individual_life'
     and (x.customer_id = any (account_ids)
          or (p_person_id is not null and exists (select 1 from policy_parties pp where pp.policy_id = x.id and pp.person_id = p_person_id)))
   order by (x.status in ('proposed','application_submitted','underwriting','accepted')) desc, x.created_at desc
   limit 1;
  if p.id is null then
    raise exception using message = 'not_found', detail = 'No life application or policy is on record for this client in this category.';
  end if;
  return copilot_get_policy(p_category, p.id);
end $$;

-- ------------------------------------------------------------------ 6. Writes
create or replace function public.copilot_create_account(p_category text, p_name text, p_type text, p_idempotency_key text,
  p_copilot text default 'ar', p_primary_person_id uuid default null)
returns jsonb language plpgsql set search_path = public as $$
declare t uuid := copilot_guard(p_category); replay jsonb := copilot_replay(p_idempotency_key); c customers;
begin
  if replay is not null then return replay; end if;
  if coalesce(trim(p_name), '') = '' then raise exception using message = 'needs_input', detail = 'Give the account name.'; end if;
  if p_type not in ('personal','commercial') then raise exception using message = 'validation', detail = 'Account type must be personal or commercial.'; end if;
  if p_primary_person_id is not null and not exists (select 1 from persons where id = p_primary_person_id) then
    raise exception using message = 'not_found', detail = 'That client is not available in this category.';
  end if;
  insert into customers (tenant_id, customer_type, full_name, status, is_synthetic, created_by, data_origin, data_category)
  values (t, p_type, trim(p_name), 'prospect', p_category = 'sample', auth.uid(), case p_category when 'sample' then 'demo' else 'live' end, p_category)
  returning * into c;
  if p_primary_person_id is not null then
    insert into customer_persons (tenant_id, customer_id, person_id, role, is_primary, data_category)
    values (t, c.id, p_primary_person_id, case p_type when 'commercial' then 'contact' else 'self' end, true, p_category);
  end if;
  return copilot_log_saved(p_category, p_copilot, 'account.create', jsonb_build_object('name', p_name, 'type', p_type), p_idempotency_key,
    jsonb_build_array(jsonb_build_object('table', 'customers', 'id', c.id, 'reference', c.account_number)),
    copilot_numbers(p_primary_person_id, c.id, null) || jsonb_build_object('record_type', 'account', 'id', c.id, 'reference', c.account_number,
      'summary', format('Created account %s (%s)', c.full_name, c.account_number), 'open_path', '/broker/accounts/' || c.id),
    'customers', c.id);
end $$;

create or replace function public.copilot_create_client(p_category text, p_first_names text, p_surname text, p_idempotency_key text,
  p_copilot text default 'ar', p_date_of_birth date default null, p_account_id uuid default null, p_force boolean default false)
returns jsonb language plpgsql set search_path = public, extensions as $$
declare t uuid := copilot_guard(p_category); replay jsonb := copilot_replay(p_idempotency_key);
  p persons; acct uuid := p_account_id; dupes jsonb; v_name text := trim(coalesce(p_first_names, '')) || ' ' || trim(coalesce(p_surname, ''));
begin
  if replay is not null then return replay; end if;
  if coalesce(trim(p_first_names), '') = '' or coalesce(trim(p_surname), '') = '' then
    raise exception using message = 'needs_input', detail = 'Give the client''s first names and surname.';
  end if;
  if acct is not null and not exists (select 1 from customers where id = acct) then
    raise exception using message = 'not_found', detail = 'That account is not available in this category.';
  end if;
  if not p_force then
    select jsonb_agg(jsonb_build_object('record_type', 'client', 'id', x.id, 'number', x.client_number,
             'name', x.first_names || ' ' || x.surname, 'detail', coalesce('Born ' || x.date_of_birth, 'No date of birth'),
             'open_path', '/broker/people/' || x.id, 'category', x.data_category))
      into dupes
      from persons x
     where similarity(x.first_names || ' ' || x.surname, v_name) > 0.6
       and (p_date_of_birth is null or x.date_of_birth is null or x.date_of_birth = p_date_of_birth);
    if dupes is not null then
      return jsonb_build_object('outcome', 'needs_input', 'reason', 'possible_duplicate', 'category', p_category,
        'summary', format('%s may already be on the system. Open the existing client or confirm this is a new person.', v_name),
        'choices', dupes);
    end if;
  end if;
  insert into persons (tenant_id, first_names, surname, date_of_birth, is_synthetic, data_category)
  values (t, trim(p_first_names), trim(p_surname), p_date_of_birth, p_category = 'sample', p_category)
  returning * into p;
  if acct is null then
    insert into customers (tenant_id, customer_type, full_name, status, is_synthetic, created_by, data_origin, data_category)
    values (t, 'personal', v_name, 'prospect', p_category = 'sample', auth.uid(), case p_category when 'sample' then 'demo' else 'live' end, p_category)
    returning id into acct;
    insert into customer_persons (tenant_id, customer_id, person_id, role, is_primary, data_category)
    values (t, acct, p.id, 'self', true, p_category);
  else
    insert into customer_persons (tenant_id, customer_id, person_id, role, is_primary, data_category)
    values (t, acct, p.id, case when exists (select 1 from customer_persons where customer_id = acct and role = 'self' and effective_to is null) then 'dependant' else 'self' end,
            false, p_category);
  end if;
  return copilot_log_saved(p_category, p_copilot, 'client.create',
    jsonb_build_object('first_names', p_first_names, 'surname', p_surname, 'date_of_birth', p_date_of_birth, 'account_id', p_account_id), p_idempotency_key,
    jsonb_build_array(jsonb_build_object('table', 'persons', 'id', p.id, 'reference', p.client_number)),
    copilot_numbers(p.id, acct, null) || jsonb_build_object('record_type', 'client', 'id', p.id, 'reference', p.client_number,
      'summary', format('Created client %s (%s)', v_name, p.client_number), 'open_path', '/broker/people/' || p.id),
    'persons', p.id);
end $$;

create or replace function public.copilot_record_interaction(p_category text, p_body text, p_idempotency_key text, p_copilot text default 'ar',
  p_kind text default 'note', p_person_id uuid default null, p_customer_id uuid default null, p_policy_id uuid default null,
  p_subject_table text default null, p_subject_id uuid default null)
returns jsonb language plpgsql set search_path = public as $$
declare t uuid := copilot_guard(p_category); replay jsonb := copilot_replay(p_idempotency_key);
  pol policies; acct uuid := p_customer_id; i client_interactions;
begin
  if replay is not null then return replay; end if;
  if coalesce(trim(p_body), '') = '' then raise exception using message = 'needs_input', detail = 'What should the note say?'; end if;
  if p_person_id is null and p_customer_id is null and p_policy_id is null then
    raise exception using message = 'needs_input', detail = 'Choose the client, account or policy the note belongs to.';
  end if;
  if p_policy_id is not null then
    select * into pol from policies where id = p_policy_id;
    if pol.id is null then raise exception using message = 'not_found', detail = 'That policy is not available in this category.'; end if;
    if acct is not null and acct <> pol.customer_id then
      raise exception using message = 'not_linked', detail = 'That policy belongs to a different account.';
    end if;
    acct := pol.customer_id;
  end if;
  if p_person_id is not null then
    if not exists (select 1 from persons where id = p_person_id) then
      raise exception using message = 'not_found', detail = 'That client is not available in this category.';
    end if;
    if acct is not null and not exists (select 1 from customer_persons where person_id = p_person_id and customer_id = acct)
       and not (pol.id is not null and exists (select 1 from policy_parties where policy_id = pol.id and person_id = p_person_id)) then
      raise exception using message = 'not_linked', detail = 'That client is not linked to this account or policy.';
    end if;
  end if;
  if acct is not null and not exists (select 1 from customers where id = acct) then
    raise exception using message = 'not_found', detail = 'That account is not available in this category.';
  end if;
  insert into client_interactions (tenant_id, data_category, kind, body, person_id, customer_id, policy_id, subject_table, subject_id,
    business_line, copilot, created_by, idempotency_key)
  values (t, p_category, coalesce(p_kind, 'note'), trim(p_body), p_person_id, acct, p_policy_id, p_subject_table, p_subject_id,
    pol.line, coalesce(p_copilot, 'ar'), auth.uid(), p_idempotency_key)
  returning * into i;
  return copilot_log_saved(p_category, p_copilot, 'interaction.record',
    jsonb_build_object('kind', p_kind, 'body', p_body, 'person_id', p_person_id, 'customer_id', p_customer_id, 'policy_id', p_policy_id), p_idempotency_key,
    jsonb_build_array(jsonb_build_object('table', 'client_interactions', 'id', i.id, 'reference', i.reference)),
    copilot_numbers(p_person_id, acct, p_policy_id) || jsonb_build_object('record_type', 'interaction', 'id', i.id, 'reference', i.reference,
      'summary', format('Saved %s %s', replace(i.kind, '_', ' '), i.reference),
      'open_path', case when pol.id is not null then copilot_policy_path(pol.line, pol.id, pol.customer_id)
                        when p_person_id is not null then '/broker/people/' || p_person_id else '/broker/accounts/' || acct end),
    'client_interactions', i.id);
end $$;

create or replace function public.copilot_create_task(p_category text, p_title text, p_idempotency_key text, p_copilot text default 'ar',
  p_detail text default null, p_due_date timestamptz default null, p_person_id uuid default null, p_customer_id uuid default null,
  p_policy_id uuid default null)
returns jsonb language plpgsql set search_path = public as $$
declare t uuid := copilot_guard(p_category); replay jsonb := copilot_replay(p_idempotency_key);
  acct uuid := p_customer_id; pol policies; k tasks;
begin
  if replay is not null then return replay; end if;
  if coalesce(trim(p_title), '') = '' then raise exception using message = 'needs_input', detail = 'What is the follow-up?'; end if;
  if p_policy_id is not null then
    select * into pol from policies where id = p_policy_id;
    if pol.id is null then raise exception using message = 'not_found', detail = 'That policy is not available in this category.'; end if;
    acct := coalesce(acct, pol.customer_id);
  end if;
  if acct is null and p_person_id is not null then
    select customer_id into acct from customer_persons where person_id = p_person_id and effective_to is null order by is_primary desc limit 1;
  end if;
  if p_person_id is not null and not exists (select 1 from persons where id = p_person_id) then
    raise exception using message = 'not_found', detail = 'That client is not available in this category.';
  end if;
  insert into tasks (tenant_id, customer_id, person_id, policy_id, subject_table, subject_id, kind, audience, title, detail, status,
    assigned_to, due_date, created_by_agent, dedupe_key, data_category)
  values (t, acct, p_person_id, p_policy_id, case when p_policy_id is not null then 'policies' end, p_policy_id, 'follow_up', 'broker',
    trim(p_title), p_detail, 'open', auth.uid(), p_due_date, coalesce(p_copilot, 'ar'), p_idempotency_key, p_category)
  returning * into k;
  return copilot_log_saved(p_category, p_copilot, 'task.create',
    jsonb_build_object('title', p_title, 'due_date', p_due_date, 'person_id', p_person_id, 'customer_id', p_customer_id, 'policy_id', p_policy_id), p_idempotency_key,
    jsonb_build_array(jsonb_build_object('table', 'tasks', 'id', k.id, 'reference', k.reference)),
    copilot_numbers(p_person_id, acct, p_policy_id) || jsonb_build_object('record_type', 'task', 'id', k.id, 'reference', k.reference,
      'summary', format('Created follow-up %s: %s', k.reference, k.title),
      'open_path', case when p_person_id is not null then '/broker/people/' || p_person_id else '/broker/accounts/' || acct end),
    'tasks', k.id);
end $$;

create or replace function public.copilot_create_quote_request(p_category text, p_customer_id uuid, p_product_category text, p_idempotency_key text,
  p_copilot text default 'ava', p_summary text default null, p_person_id uuid default null)
returns jsonb language plpgsql set search_path = public as $$
declare t uuid := copilot_guard(p_category); replay jsonb := copilot_replay(p_idempotency_key); c customers; l leads;
begin
  if replay is not null then return replay; end if;
  select * into c from customers where id = p_customer_id;
  if c.id is null then raise exception using message = 'not_found', detail = 'That account is not available in this category.'; end if;
  if coalesce(p_product_category, '') = '' then raise exception using message = 'needs_input', detail = 'What cover is the quote for (motor, home, contents)?'; end if;
  insert into leads (tenant_id, customer_id, line, product_category, status, urgency, qualification, missing_info, source, created_by, data_category)
  values (t, c.id, case c.customer_type when 'commercial' then 'commercial' else 'personal' end, p_product_category, 'new', 'medium',
    jsonb_build_object('summary', coalesce(p_summary, 'Quote request captured by the copilot')), '[]', coalesce(p_copilot, 'ava'), auth.uid(), p_category)
  returning * into l;
  return copilot_log_saved(p_category, p_copilot, 'quote_request.create',
    jsonb_build_object('customer_id', p_customer_id, 'product_category', p_product_category, 'summary', p_summary), p_idempotency_key,
    jsonb_build_array(jsonb_build_object('table', 'leads', 'id', l.id)),
    copilot_numbers(p_person_id, c.id, null) || jsonb_build_object('record_type', 'quote_request', 'id', l.id, 'reference', 'Lead ' || left(l.id::text, 8),
      'summary', format('Created a %s quote request for %s', replace(p_product_category, '_', ' '), c.full_name), 'open_path', '/broker/leads/' || l.id),
    'leads', l.id);
end $$;

create or replace function public.copilot_create_life_application(p_category text, p_person_id uuid, p_idempotency_key text,
  p_copilot text default 'ava', p_customer_id uuid default null, p_provider_id uuid default null, p_premium_amount numeric default null,
  p_cover_type text default 'life')
returns jsonb language plpgsql set search_path = public as $$
declare t uuid := copilot_guard(p_category); replay jsonb := copilot_replay(p_idempotency_key);
  acct uuid := p_customer_id; provider uuid := p_provider_id; p policies;
begin
  if replay is not null then return replay; end if;
  if not exists (select 1 from persons where id = p_person_id) then
    raise exception using message = 'not_found', detail = 'That client is not available in this category.';
  end if;
  if acct is null then
    select customer_id into acct from customer_persons where person_id = p_person_id and effective_to is null order by (role = 'self') desc, is_primary desc limit 1;
  elsif not exists (select 1 from customer_persons where person_id = p_person_id and customer_id = acct) then
    raise exception using message = 'not_linked', detail = 'That client is not linked to this account.';
  end if;
  if acct is null then raise exception using message = 'needs_input', detail = 'The client has no account yet. Create or choose an account first.'; end if;
  if provider is null then
    select id into provider from insurers where provider_type = 'insurer' order by (name ilike '%life%' or name ilike '%mutual%') desc, name limit 1;
  end if;
  if provider is null then raise exception using message = 'needs_input', detail = 'No life insurer is configured yet.'; end if;
  insert into policies (tenant_id, customer_id, line, provider_id, adviser_id, origin, status, underwriting_status, premium_amount, premium_frequency,
    source, cover_type, data_origin, data_category)
  values (t, acct, 'individual_life', provider, auth.uid(), 'placed', 'application_submitted', 'not_started', p_premium_amount,
    case when p_premium_amount is null then null else 'monthly' end, 'declared', coalesce(p_cover_type, 'life'),
    case p_category when 'sample' then 'demo' else 'live' end, p_category)
  returning * into p;
  insert into policy_parties (tenant_id, policy_id, person_id, role, data_category) values
    (t, p.id, p_person_id, 'policyholder', p_category),
    (t, p.id, p_person_id, 'life_insured', p_category);
  return copilot_log_saved(p_category, p_copilot, 'life_application.create',
    jsonb_build_object('person_id', p_person_id, 'customer_id', acct, 'premium_amount', p_premium_amount), p_idempotency_key,
    jsonb_build_array(jsonb_build_object('table', 'policies', 'id', p.id, 'reference', p.reference)),
    copilot_numbers(p_person_id, acct, p.id) || jsonb_build_object('record_type', 'life_application', 'id', p.id, 'reference', p.reference,
      'summary', format('Created life application %s', p.reference), 'open_path', '/broker/life/policies/' || p.id),
    'policies', p.id);
end $$;

-- ------------------------------------------------------------------ 7. History, business and schemes
create or replace function public.copilot_list_history(p_category text, p_person_id uuid default null, p_customer_id uuid default null,
  p_copilot text default null, p_record_type text default null, p_limit int default 50)
returns jsonb language plpgsql stable set search_path = public as $$
declare account_ids uuid[]; lines text[] := copilot_line_of(p_copilot);
begin
  perform copilot_guard(p_category);
  if p_person_id is null and p_customer_id is null then
    raise exception using message = 'needs_input', detail = 'Choose a client or account first.';
  end if;
  if p_customer_id is not null then account_ids := array[p_customer_id];
  else select coalesce(array_agg(customer_id), '{}') into account_ids from customer_persons where person_id = p_person_id and effective_to is null;
  end if;
  return coalesce((select jsonb_agg(s.h order by s.at desc) from (
    select i.created_at as at, jsonb_build_object('at', i.created_at, 'record_type', 'interaction', 'kind', i.kind, 'reference', i.reference,
      'title', left(i.body, 160), 'line', i.business_line, 'copilot', i.copilot,
      'policy_number', (select coalesce(policy_number, reference) from policies where id = i.policy_id),
      'open_path', coalesce((select copilot_policy_path(x.line, x.id, x.customer_id) from policies x where x.id = i.policy_id),
                            case when i.person_id is not null then '/broker/people/' || i.person_id else '/broker/accounts/' || i.customer_id end)) as h
      from client_interactions i
     where (i.person_id = p_person_id or i.customer_id = any (account_ids))
       and (p_copilot is null or i.copilot = p_copilot or i.business_line = any (lines))
       and (p_record_type is null or p_record_type = 'interaction')
    union all
    select t.created_at, jsonb_build_object('at', t.created_at, 'record_type', 'task', 'kind', t.status, 'reference', t.reference, 'title', t.title,
      'line', null, 'copilot', t.created_by_agent, 'due_date', t.due_date,
      'open_path', case when t.person_id is not null then '/broker/people/' || t.person_id else '/broker/accounts/' || t.customer_id end)
      from tasks t
     where (t.person_id = p_person_id or t.customer_id = any (account_ids))
       and (p_copilot is null or t.created_by_agent = p_copilot)
       and (p_record_type is null or p_record_type = 'task')
    union all
    select x.created_at, jsonb_build_object('at', x.created_at, 'record_type', 'policy', 'kind', x.status, 'reference', coalesce(x.policy_number, x.reference),
      'title', initcap(replace(coalesce(x.cover_type, x.line), '_', ' ')) || ' · ' || replace(x.status, '_', ' '), 'line', x.line, 'copilot', null,
      'open_path', copilot_policy_path(x.line, x.id, x.customer_id))
      from policies x
     where x.customer_id = any (account_ids) and x.line = any (lines)
       and (p_record_type is null or p_record_type = 'policy')
    union all
    select l.created_at, jsonb_build_object('at', l.created_at, 'record_type', 'quote_request', 'kind', l.status, 'reference', 'Lead ' || left(l.id::text, 8),
      'title', replace(l.product_category, '_', ' ') || ' quote request', 'line', case l.line when 'commercial' then 'short_term_commercial' else 'short_term_personal' end,
      'copilot', l.source, 'open_path', '/broker/leads/' || l.id)
      from leads l
     where l.customer_id = any (account_ids)
       and (case l.line when 'commercial' then 'short_term_commercial' else 'short_term_personal' end) = any (lines)
       and (p_record_type is null or p_record_type = 'quote_request')
    order by 1 desc
    limit greatest(1, least(coalesce(p_limit, 50), 200))) s), '[]');
end $$;

create or replace function public.copilot_scheme_members(p_category text, p_scheme_id uuid) returns jsonb
language plpgsql stable set search_path = public as $$
begin
  perform copilot_guard(p_category);
  if not exists (select 1 from group_schemes where id = p_scheme_id) then
    raise exception using message = 'not_found', detail = 'That scheme is not available in this category.';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('person_id', p.id, 'client_number', p.client_number,
      'name', trim(coalesce(p.preferred_name, p.first_names) || ' ' || p.surname), 'status', m.status, 'joined_on', m.joined_on,
      'cover_amount', m.cover_amount, 'underwriting_status', m.underwriting_status, 'open_path', '/broker/people/' || p.id) order by p.surname)
    from scheme_memberships m join persons p on p.id = m.person_id where m.scheme_id = p_scheme_id), '[]');
end $$;

-- ------------------------------------------------------------------ 8. Access
do $$ declare f text; begin
  foreach f in array array['copilot_guard(text)','copilot_search_records(text,text,text[],integer)','copilot_record_overview(text,text,uuid,text)',
    'copilot_list_policies(text,uuid,uuid,text,text,text)','copilot_get_policy(text,uuid)','copilot_get_life_application(text,uuid,uuid)',
    'copilot_create_account(text,text,text,text,text,uuid)','copilot_create_client(text,text,text,text,text,date,uuid,boolean)',
    'copilot_record_interaction(text,text,text,text,text,uuid,uuid,uuid,text,uuid)',
    'copilot_create_task(text,text,text,text,text,timestamptz,uuid,uuid,uuid)',
    'copilot_create_quote_request(text,uuid,text,text,text,text,uuid)',
    'copilot_create_life_application(text,uuid,text,text,uuid,uuid,numeric,text)',
    'copilot_list_history(text,uuid,uuid,text,text,integer)','copilot_scheme_members(text,uuid)',
    'copilot_line_of(text)','copilot_policy_path(text,uuid,uuid)','copilot_policy_json(policies)','copilot_numbers(uuid,uuid,uuid)',
    'copilot_replay(text)','copilot_log_saved(text,text,text,jsonb,text,jsonb,jsonb,text,uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

commit;
