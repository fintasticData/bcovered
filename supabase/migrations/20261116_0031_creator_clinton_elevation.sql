-- P0: clinton@fintasticdata.com is the B-Covered creator (platform_admin + BCovered brokerage owner).
-- Unlocks copilots (app.is_staff), sales book, Production when live_available, and /platform admin actions.

do $$
declare
  v_uid uuid := 'e9fe3759-ee60-4cad-98e4-e073f0b551b3';
  v_org uuid := 'a0000000-0000-4000-8000-000000000001';
begin
  if not exists (select 1 from auth.users where id = v_uid and email = 'clinton@fintasticdata.com') then
    raise exception 'Expected auth user clinton@fintasticdata.com (%) missing', v_uid;
  end if;

  update app_users
  set role = 'admin',
      customer_id = null,
      active_organisation_id = v_org,
      tenant_id = v_org,
      updated_at = now()
  where id = v_uid;

  insert into organisation_memberships (
    id, tenant_id, user_id, role, status, invited_by, created_at, updated_at,
    fais_capacity, fais_status, authorised_licence_categories
  )
  values (
    gen_random_uuid(), v_org, v_uid, 'brokerage_owner', 'active', null, now(), now(),
    'key_individual', 'active', array['st_personal','st_commercial','it_bf']
  )
  on conflict (tenant_id, user_id) do update
  set role = excluded.role,
      status = 'active',
      fais_capacity = coalesce(organisation_memberships.fais_capacity, excluded.fais_capacity),
      fais_status = coalesce(organisation_memberships.fais_status, excluded.fais_status),
      authorised_licence_categories = case
        when coalesce(cardinality(organisation_memberships.authorised_licence_categories), 0) = 0
          then excluded.authorised_licence_categories
        else organisation_memberships.authorised_licence_categories
      end,
      updated_at = now();

  insert into platform_staff (user_id, role, granted_by, revoked_at, created_at)
  values (v_uid, 'platform_admin', null, null, now())
  on conflict (user_id) do update
  set role = 'platform_admin', revoked_at = null;

  if not exists (select 1 from sales_team_members where tenant_id = v_org and user_id = v_uid) then
    insert into sales_team_members (tenant_id, user_id, full_name, email, sales_role, referral_code, status)
    values (v_org, v_uid, 'Clinton Reddy', 'clinton@fintasticdata.com', 'broker', 'CLINTON-CR01', 'active');
  else
    update sales_team_members
    set status = 'active', sales_role = 'broker', full_name = 'Clinton Reddy', email = 'clinton@fintasticdata.com', updated_at = now()
    where tenant_id = v_org and user_id = v_uid;
  end if;
end $$;

-- Surface platform role on the sales profile so the browser can mirror /platform access after live sign-in.
create or replace function public.sales_my_profile() returns jsonb
language plpgsql stable set search_path = public as $$
declare
  uid uuid := auth.uid();
  t uuid := app.tenant_id();
  mem uuid;
  org organisations;
  plat text;
begin
  if uid is null then
    return jsonb_build_object('signed_in', false, 'has_workspace', false);
  end if;

  select s.role into plat
  from platform_staff s
  where s.user_id = uid and s.revoked_at is null
  limit 1;

  if t is null then
    return jsonb_build_object(
      'signed_in', true,
      'has_workspace', false,
      'platform_role', plat,
      'pending_brokerage', (select raw_meta_brokerage from app_users where id = uid),
      'name', (select full_name from app_users where id = uid),
      'email', (select email from app_users where id = uid)
    );
  end if;

  select * into org from organisations where id = t;
  mem := app.my_member_id();
  return jsonb_build_object(
    'signed_in', true,
    'has_workspace', true,
    'platform_role', plat,
    'user_id', uid,
    'name', (select full_name from app_users where id = uid),
    'email', (select email from app_users where id = uid),
    'membership_role', app.member_role(),
    'book_restricted', app.book_restricted(),
    'can_manage_team', app.can_manage_team(),
    'brokerage', jsonb_build_object(
      'id', org.id,
      'name', org.name,
      'lifecycle_status', org.lifecycle_status,
      'live_available', org.lifecycle_status = 'active' or app.is_platform_staff()
    ),
    'member', app.member_json(mem, 'live')
  );
end $$;
