-- Client zone: every portal login gets a primary Person linked to their Customer.
-- Staff home returns /broker/customers. Client home stays /my.

create or replace function public.ensure_client_profile()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  u app_users%rowtype;
  c customers%rowtype;
  t uuid := 'a0000000-0000-4000-8000-000000000001';
  a_email text;
  a_name text;
  v_person_id uuid;
  v_first text;
  v_surname text;
  v_parts text[];
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
      'home', '/broker/customers'
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

  -- Ensure primary self Person for My Page (live category matches customer row).
  select cp.person_id into v_person_id
    from customer_persons cp
   where cp.customer_id = c.id
     and cp.role = 'self'
     and cp.effective_to is null
     and cp.data_category = coalesce(c.data_category, 'live')
   order by cp.is_primary desc, cp.created_at asc
   limit 1;

  if v_person_id is null then
    v_parts := regexp_split_to_array(trim(coalesce(nullif(trim(u.full_name), ''), a_name, 'Customer')), '\s+');
    v_first := coalesce(nullif(v_parts[1], ''), 'Customer');
    if array_length(v_parts, 1) >= 2 then
      v_surname := array_to_string(v_parts[2:array_length(v_parts, 1)], ' ');
    else
      v_surname := v_first;
    end if;

    insert into persons (
      tenant_id, data_category, first_names, surname, preferred_name, is_synthetic
    ) values (
      t, coalesce(c.data_category, 'live'), v_first, v_surname, v_first, false
    )
    returning id into v_person_id;

    insert into customer_persons (
      tenant_id, customer_id, person_id, role, is_primary, data_category
    ) values (
      t, c.id, v_person_id, 'self', true, coalesce(c.data_category, 'live')
    );
  end if;

  return jsonb_build_object(
    'kind', 'client',
    'user_id', uid,
    'name', u.full_name,
    'email', u.email,
    'customer_id', c.id,
    'person_id', v_person_id,
    'tenant_id', t,
    'home', '/my'
  );
end;
$$;

grant execute on function public.ensure_client_profile() to authenticated;
revoke execute on function public.ensure_client_profile() from anon, public;

comment on function public.ensure_client_profile() is
  'After Supabase Auth sign-up/sign-in: ensure app_users + customers + primary Person for Client zone My Page.';
