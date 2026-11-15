-- Client zone + Assist chat: portal customers may read/write their own customer, conversations and
-- messages. Staff policies stay as they are. Also: resolve tenant from app_users for clients, allow
-- Live category for customers (Sample/Live header still required), and close anonymous table grants.

begin;

-- ------------------------------------------------------------------ identity helpers
create or replace function app.my_customer_id() returns uuid
language sql stable security definer set search_path = public as $$
  select customer_id from app_users where id = auth.uid()
$$;

revoke all on function app.my_customer_id() from public, anon;
grant execute on function app.my_customer_id() to authenticated;

create or replace function app.tenant_id() returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    nullif(auth.jwt() ->> 'tenant_id', '')::uuid,
    nullif(current_setting('app.tenant_id', true), '')::uuid,
    (select m.tenant_id from app_users u
       join organisation_memberships m on m.user_id = u.id and m.tenant_id = u.active_organisation_id and m.status = 'active'
      where u.id = auth.uid()),
    (select u.tenant_id from app_users u where u.id = auth.uid()),
    (select c.tenant_id from app_users u join customers c on c.id = u.customer_id where u.id = auth.uid())
  )
$$;

create or replace function app.role() returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    nullif(auth.jwt() ->> 'app_role', 'none'),
    app.member_role(),
    (select role from app_users where id = auth.uid()),
    'visitor'
  )
$$;

-- Live is for staff books and for portal customers (who only ever see their own rows via client_* policies).
create or replace function app.active_category() returns text
language sql stable set search_path = public as $$
  select case coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-data-category', 'sample')
    when 'sample' then 'sample'
    when 'live' then case
      when app.is_staff() then 'live'
      when app.my_customer_id() is not null then 'live'
      else 'denied'
    end
    else 'denied'
  end
$$;

-- ------------------------------------------------------------------ client policies (own rows only)
drop policy if exists client_own_select on customers;
drop policy if exists client_own_update on customers;
create policy client_own_select on customers for select to authenticated
  using (id = (select app.my_customer_id()));
create policy client_own_update on customers for update to authenticated
  using (id = (select app.my_customer_id()))
  with check (id = (select app.my_customer_id()) and tenant_id = (select app.tenant_id()));

drop policy if exists client_own_select on conversations;
drop policy if exists client_own_insert on conversations;
drop policy if exists client_own_update on conversations;
create policy client_own_select on conversations for select to authenticated
  using (customer_id = (select app.my_customer_id()));
create policy client_own_insert on conversations for insert to authenticated
  with check (
    customer_id = (select app.my_customer_id())
    and tenant_id = (select app.tenant_id())
  );
create policy client_own_update on conversations for update to authenticated
  using (customer_id = (select app.my_customer_id()))
  with check (
    customer_id = (select app.my_customer_id())
    and tenant_id = (select app.tenant_id())
  );

drop policy if exists client_own_select on conversation_messages;
drop policy if exists client_own_insert on conversation_messages;
create policy client_own_select on conversation_messages for select to authenticated
  using (exists (
    select 1 from conversations c
    where c.id = conversation_messages.conversation_id
      and c.customer_id = (select app.my_customer_id())
  ));
create policy client_own_insert on conversation_messages for insert to authenticated
  with check (
    tenant_id = (select app.tenant_id())
    and exists (
      select 1 from conversations c
      where c.id = conversation_id
        and c.customer_id = (select app.my_customer_id())
    )
  );

-- Portal customers may read quotes released to their account (no write).
drop policy if exists client_own_select on quotes;
create policy client_own_select on quotes for select to authenticated
  using (customer_id = (select app.my_customer_id()));

drop policy if exists client_own_select on quote_options;
create policy client_own_select on quote_options for select to authenticated
  using (exists (
    select 1 from quotes q
    where q.id = quote_options.quote_id
      and q.customer_id = (select app.my_customer_id())
  ));

drop policy if exists client_own_select on leads;
create policy client_own_select on leads for select to authenticated
  using (customer_id = (select app.my_customer_id()));

drop policy if exists client_own_select on jobs;
create policy client_own_select on jobs for select to authenticated
  using (customer_id = (select app.my_customer_id()));

-- ------------------------------------------------------------------ harden: anon must not mutate these tables
revoke insert, update, delete, truncate on table customers from anon;
revoke insert, update, delete, truncate on table conversations from anon;
revoke insert, update, delete, truncate on table conversation_messages from anon;
revoke insert, update, delete, truncate on table quotes from anon;
revoke insert, update, delete, truncate on table quote_options from anon;
revoke insert, update, delete, truncate on table leads from anon;
revoke insert, update, delete, truncate on table jobs from anon;

-- ------------------------------------------------------------------ whoami reports client scope for the sync layer
create or replace function public.copilot_whoami() returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'user_id', auth.uid(),
    'name', (select full_name from app_users where id = auth.uid()),
    'tenant_id', app.tenant_id(),
    'brokerage', (select name from organisations where id = app.tenant_id()),
    'brokerage_active', app.tenant_operational(),
    'role', app.role(),
    'is_staff', app.is_staff(),
    'can_write', app.can_write(),
    'customer_id', app.my_customer_id(),
    'active_category', app.active_category(),
    'hook_claims', (auth.jwt() ? 'tenant_id') and (auth.jwt() ? 'app_role')
  )
$$;

revoke all on function public.copilot_whoami() from public, anon;
grant execute on function public.copilot_whoami() to authenticated;

commit;
