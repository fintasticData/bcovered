-- Client zone: create/sign-in against Supabase Auth + app_users/customers (not browser localStorage).
-- BCovered (first brokerage) hosts portal customers until multi-brokerage client books are wired.

create or replace function public.ensure_client_profile()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  u app_users;
  c customers;
  t uuid := 'a0000000-0000-4000-8000-000000000001';
  a_email text;
  a_name text;
begin
  if uid is null then
    raise exception using message = 'forbidden', detail = 'Sign in first.';
  end if;

  select email, coalesce(nullif(trim(raw_user_meta_data ->> 'full_name'), ''), email)
    into a_email, a_name
  from auth.users where id = uid;

  select * into u from app_users where id = uid;
  if not found then
    insert into app_users (id, email, full_name, role, tenant_id)
    values (uid, a_email, a_name, 'customer', t)
    returning * into u;
  end if;

  -- Broker / staff memberships stay broker zone — do not force a client profile.
  if exists (
    select 1 from organisation_memberships
    where user_id = uid and status = 'active'
  ) then
    return jsonb_build_object(
      'kind', 'broker',
      'user_id', uid,
      'name', u.full_name,
      'email', u.email,
      'has_workspace', true,
      'home', '/my'
    );
  end if;

  if u.customer_id is not null then
    select * into c from customers where id = u.customer_id;
  end if;

  if c.id is null then
    insert into customers (
      tenant_id, customer_type, full_name, email, phone, region, status,
      is_synthetic, created_by, data_origin, data_category
    ) values (
      t, 'personal', coalesce(nullif(trim(u.full_name), ''), a_name), coalesce(u.email, a_email),
      null, null, 'prospect', false, uid, 'live', 'live'
    )
    returning * into c;

    update app_users
    set role = 'customer',
        customer_id = c.id,
        tenant_id = coalesce(tenant_id, t),
        full_name = coalesce(nullif(trim(full_name), ''), a_name),
        updated_at = now()
    where id = uid
    returning * into u;
  elsif coalesce(u.role, 'visitor') is distinct from 'customer' or u.tenant_id is null then
    update app_users
    set role = 'customer',
        tenant_id = coalesce(tenant_id, t),
        updated_at = now()
    where id = uid
    returning * into u;
  end if;

  return jsonb_build_object(
    'kind', 'client',
    'user_id', uid,
    'name', u.full_name,
    'email', u.email,
    'customer_id', c.id,
    'tenant_id', t,
    'home', '/my'
  );
end;
$$;

grant execute on function public.ensure_client_profile() to authenticated;
revoke execute on function public.ensure_client_profile() from anon, public;

comment on function public.ensure_client_profile() is
  'After Supabase Auth sign-up/sign-in: ensure app_users + a BCovered customers row for Client zone.';
