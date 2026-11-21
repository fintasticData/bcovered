-- Concierge home: real policy joins (like Your page), cover type / HCAT labels,
-- photos, policies list, and optional staff preview by person.
-- Also enrich Naledi seed + enrol Thandi Walkthrough (clinton-filed motor policy).

begin;

drop function if exists public.concierge_customer_home(text);
drop function if exists public.concierge_customer_home(text, uuid);

create or replace function public.concierge_customer_home(
  p_category text default null,
  p_person_id uuid default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  cat text := coalesce(nullif(p_category, ''), nullif(app.active_category(), 'denied'), 'sample');
  cust uuid := app.my_customer_id();
  t uuid := app.tenant_id();
  pid uuid;
  prof customer_concierge_profiles%rowtype;
  member sales_team_members%rowtype;
  brokerage jsonb;
  staff_preview boolean := false;
begin
  if cat = 'denied' then raise exception 'forbidden' using errcode = '42501'; end if;

  -- Staff may preview an enrolled customer's Concierge desk.
  if cust is null and app.is_staff() and p_person_id is not null then
    select cp.customer_id, cp.person_id into cust, pid
      from customer_persons cp
     where cp.person_id = p_person_id and cp.data_category = cat
     order by cp.is_primary desc nulls last, cp.created_at
     limit 1;
    if cust is null then raise exception 'forbidden' using errcode = '42501'; end if;
    staff_preview := true;
  elsif cust is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if pid is null then
    select cp.person_id into pid
      from customer_persons cp
     where cp.customer_id = cust and cp.data_category = cat and cp.is_primary
     order by cp.created_at limit 1;
    if pid is null then
      select cp.person_id into pid from customer_persons cp
       where cp.customer_id = cust and cp.data_category = cat limit 1;
    end if;
  end if;

  select * into prof from customer_concierge_profiles
   where customer_id = cust and data_category = cat and enabled;
  if not found then
    return jsonb_build_object('enabled', false, 'reason', 'not_enrolled', 'staff_preview', staff_preview);
  end if;

  if prof.assigned_member_id is not null then
    select * into member from sales_team_members where id = prof.assigned_member_id;
  end if;

  select jsonb_build_object(
    'id', o.id, 'trading_name', coalesce(o.trading_name, o.name),
    'logo_url', o.logo_url, 'brand_image_url', o.brand_image_url
  ) into brokerage from organisations o where o.id = coalesce(t, prof.tenant_id);

  return jsonb_build_object(
    'enabled', true,
    'staff_preview', staff_preview,
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
        'photo_url', nullif(i.details->>'photo_url',''),
        'policy_id', coalesce(nullif(i.details->>'policy_id','')::uuid, pol.id),
        'policy_number', pol.policy_number,
        'policy_reference', pol.reference,
        'cover_type', coalesce(nullif(i.details->>'cover_type',''), pol.cover_type, i.item_type),
        'section_code', coalesce(nullif(i.details->>'section_code',''),
          case i.item_type
            when 'contents' then 'HCAT'
            when 'building' then 'HOB'
            when 'vehicle' then 'MOT'
            when 'equipment' then 'PAV'
            else upper(left(i.item_type, 4))
          end),
        'insured_value', case
          when i.details ? 'declared_value' then (i.details->>'declared_value')::numeric
          when i.details ? 'contents_limit' then (i.details->>'contents_limit')::numeric
          when i.details ? 'building_sum_insured' then (i.details->>'building_sum_insured')::numeric
          else null
        end,
        'premium_amount', pol.premium_amount,
        'premium_frequency', pol.premium_frequency,
        'insurer_name', pol.insurer_name,
        'details', i.details
      ) order by case i.status when 'awaiting_cover' then 0 when 'covered' then 1 else 2 end, i.display_label)
      from insured_items i
      left join lateral (
        select pol.id, pol.policy_number, pol.reference, pol.cover_type,
               pol.premium_amount, pol.premium_frequency, ins.name as insurer_name
          from policy_version_items pvi
          join policy_versions pv on pv.id = pvi.policy_version_id and pv.superseded_at is null
          join policies pol on pol.id = pv.policy_id and pol.data_category = pv.data_category
          left join insurers ins on ins.id = pol.provider_id
         where pvi.insured_item_id = i.id and pvi.data_category = i.data_category
         limit 1
      ) pol on true
      where i.person_id = pid and i.data_category = cat
        and i.status not in ('removed')
    ), '[]'::jsonb),
    'policies', coalesce((
      select jsonb_agg(row_to_json(p)::jsonb order by p.inception_date desc nulls last)
      from (
        select pol.id, pol.reference, pol.policy_number, pol.status,
               pol.inception_date, pol.premium_amount, pol.premium_frequency, pol.cover_type,
               i.name as insurer_name,
               (
                 select coalesce(jsonb_agg(jsonb_build_object(
                   'id', ii.id, 'label', ii.display_label, 'status', ii.status, 'item_type', ii.item_type
                 )), '[]'::jsonb)
                 from policy_versions pv
                 join policy_version_items pvi on pvi.policy_version_id = pv.id
                 join insured_items ii on ii.id = pvi.insured_item_id
                where pv.policy_id = pol.id and pv.superseded_at is null
               ) as items
          from policy_cover pc
          join policies pol on pol.id = pc.policy_id and pol.data_category = pc.data_category
          left join insurers i on i.id = pol.provider_id
         where pc.person_id = pid and pc.data_category = cat
      ) p
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

revoke all on function public.concierge_customer_home(text, uuid) from public, anon;
grant execute on function public.concierge_customer_home(text, uuid) to authenticated;

-- ------------------------------------------------------------------ Enrich Naledi cover book
do $$
declare
  v_tenant uuid := 'a0000000-0000-4000-8000-000000000001';
  v_cat text := 'sample';
  v_cust uuid := 'a0000000-0000-4000-8000-000000000310';
  v_person uuid := 'c0000000-0000-4000-8000-000000000310';
  v_item_car uuid := 'a0000000-0000-4000-8000-000000000321';
  v_item_home uuid := 'a0000000-0000-4000-8000-000000000322';
  v_item_cam uuid := 'a0000000-0000-4000-8000-000000000323';
  v_item_hcat uuid := 'a0000000-0000-4000-8000-000000000324';
  v_pol_car uuid := 'a0000000-0000-4000-8000-000000000331';
  v_pol_home uuid := 'a0000000-0000-4000-8000-000000000332';
  v_pol_hcat uuid := 'a0000000-0000-4000-8000-000000000333';
  v_ver_car uuid := 'a0000000-0000-4000-8000-000000000341';
  v_ver_home uuid := 'a0000000-0000-4000-8000-000000000342';
  v_ver_hcat uuid := 'a0000000-0000-4000-8000-000000000343';
  v_protea uuid := 'a0000000-0000-4000-8000-000000000101';
  v_member uuid := 'a0000000-0000-4000-8000-000000000711';
  v_thandi_cust uuid := '24ce5f5a-e923-4412-977e-b23ed42d12d6';
  v_thandi_person uuid := '289ef4cf-ea98-4e4f-b415-988658ddcf90';
  v_thandi_user uuid := 'a0000000-0000-4000-8000-000000000214';
  v_pw text;
  v_inst uuid;
begin
  -- Photos + cover metadata on existing items
  update insured_items set details = details || jsonb_build_object(
    'photo_url', 'https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?w=400&h=300&fit=crop',
    'cover_type', 'motor',
    'section_code', 'MOT',
    'make', 'Toyota', 'model', 'Fortuner', 'year', 2022
  ), status = 'covered'
  where id = v_item_car and data_category = v_cat;

  update insured_items set details = details || jsonb_build_object(
    'photo_url', 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=400&h=300&fit=crop',
    'cover_type', 'home',
    'section_code', 'HOB',
    'building_sum_insured', 4200000,
    'risk_address', 'Parkhurst, Johannesburg'
  ), status = 'covered'
  where id = v_item_home and data_category = v_cat;

  update insured_items set details = details || jsonb_build_object(
    'photo_url', 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=400&h=300&fit=crop',
    'cover_type', 'valuables',
    'section_code', 'PAV',
    'declared_value', 45000,
    'awaiting_quote', true
  )
  where id = v_item_cam and data_category = v_cat;

  insert into insured_items (id, tenant_id, data_category, person_id, item_type, status, display_label, details)
  values (
    v_item_hcat, v_tenant, v_cat, v_person, 'contents', 'covered', 'Home contents · Parkhurst',
    jsonb_build_object(
      'source', 'policy_setup',
      'cover_type', 'contents',
      'section_code', 'HCAT',
      'contents_limit', 850000,
      'photo_url', 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=400&h=300&fit=crop',
      'location_name', 'Parkhurst home'
    )
  ) on conflict (id, data_category) do update
    set display_label = excluded.display_label, status = 'covered', details = excluded.details;

  -- Policies
  insert into policies (
    id, tenant_id, customer_id, line, provider_id, policy_number, origin, status,
    premium_amount, premium_frequency, inception_date, source, data_category, data_origin,
    cover_type, reference
  ) values
    (v_pol_car, v_tenant, v_cust, 'short_term_personal', v_protea, 'PRO-MOT-VIP01', 'existing_declared', 'in_force',
     1890, 'monthly', '2025-06-01', 'verified', v_cat, 'demo', 'motor', 'PL-S-VIP-MOT'),
    (v_pol_home, v_tenant, v_cust, 'short_term_personal', v_protea, 'PRO-HOB-VIP01', 'existing_declared', 'in_force',
     2450, 'monthly', '2025-06-01', 'verified', v_cat, 'demo', 'home', 'PL-S-VIP-HOB'),
    (v_pol_hcat, v_tenant, v_cust, 'short_term_personal', v_protea, 'PRO-HCAT-VIP01', 'existing_declared', 'in_force',
     980, 'monthly', '2025-06-01', 'verified', v_cat, 'demo', 'contents', 'PL-S-VIP-HCAT')
  on conflict (id, data_category) do update
    set policy_number = excluded.policy_number, cover_type = excluded.cover_type,
        premium_amount = excluded.premium_amount, status = 'in_force';

  insert into policy_cover (tenant_id, data_category, policy_id, person_id, customer_id)
  select v_tenant, v_cat, x.pol, v_person, v_cust
    from (values (v_pol_car), (v_pol_home), (v_pol_hcat)) as x(pol)
   where not exists (
     select 1 from policy_cover pc
      where pc.policy_id = x.pol and pc.person_id = v_person and pc.data_category = v_cat
   );

  insert into policy_versions (id, tenant_id, data_category, policy_id, version_no, entered_at, effective_at, terms)
  values
    (v_ver_car, v_tenant, v_cat, v_pol_car, 1, now(), '2025-06-01', '{"section_code":"MOT"}'::jsonb),
    (v_ver_home, v_tenant, v_cat, v_pol_home, 1, now(), '2025-06-01', '{"section_code":"HOB"}'::jsonb),
    (v_ver_hcat, v_tenant, v_cat, v_pol_hcat, 1, now(), '2025-06-01', '{"section_code":"HCAT"}'::jsonb)
  on conflict (id, data_category) do nothing;

  insert into policy_version_items (tenant_id, data_category, policy_version_id, insured_item_id, item_terms)
  select v_tenant, v_cat, x.ver, x.item, jsonb_build_object('section_code', x.code)
    from (values
      (v_ver_car, v_item_car, 'MOT'),
      (v_ver_home, v_item_home, 'HOB'),
      (v_ver_hcat, v_item_hcat, 'HCAT')
    ) as x(ver, item, code)
   where not exists (
     select 1 from policy_version_items pvi
      where pvi.policy_version_id = x.ver and pvi.insured_item_id = x.item and pvi.data_category = v_cat
   );

  update insured_items set details = details || jsonb_build_object('policy_id', v_pol_car::text)
   where id = v_item_car and data_category = v_cat;
  update insured_items set details = details || jsonb_build_object('policy_id', v_pol_home::text)
   where id = v_item_home and data_category = v_cat;
  update insured_items set details = details || jsonb_build_object('policy_id', v_pol_hcat::text)
   where id = v_item_hcat and data_category = v_cat;

  -- Enrol Thandi Walkthrough (clinton-filed motor) into Concierge
  if exists (select 1 from customers where id = v_thandi_cust) then
    insert into customer_concierge_profiles (
      id, tenant_id, data_category, customer_id, enabled, assigned_member_id, team_queue_key
    ) values (
      'a0000000-0000-4000-8000-000000000702', v_tenant, v_cat, v_thandi_cust, true, v_member, 'vip-desk'
    ) on conflict (customer_id, data_category) do update
      set enabled = true, assigned_member_id = v_member, updated_at = now();

    update insured_items set details = details || jsonb_build_object(
      'photo_url', 'https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?w=400&h=300&fit=crop',
      'section_code', 'MOT'
    )
    where person_id = v_thandi_person and data_category = v_cat and item_type = 'vehicle';

    select encrypted_password, instance_id into v_pw, v_inst
      from auth.users where id = 'a0000000-0000-4000-8000-000000000201';

    if v_pw is not null then
      insert into auth.users (
        id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
        confirmation_token, recovery_token, email_change_token_new, email_change_token_current,
        reauthentication_token, email_change, phone_change, phone_change_token,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at
      )
      select v_thandi_user, coalesce(v_inst, '00000000-0000-0000-0000-000000000000'::uuid),
             'authenticated', 'authenticated', 'thandi.walkthrough@example.demo', v_pw, now(),
             '', '', '', '', '', '', '', '',
             '{"provider":"email","providers":["email"]}'::jsonb,
             '{"full_name":"Thandi Walkthrough","email_verified":true}'::jsonb,
             now(), now()
       where not exists (select 1 from auth.users u where u.id = v_thandi_user or lower(u.email) = 'thandi.walkthrough@example.demo');

      insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
      select gen_random_uuid(), v_thandi_user,
             jsonb_build_object('sub', v_thandi_user::text, 'email', 'thandi.walkthrough@example.demo', 'email_verified', true, 'phone_verified', false),
             'email', v_thandi_user::text, now(), now(), now()
       where exists (select 1 from auth.users u where u.id = v_thandi_user)
         and not exists (select 1 from auth.identities i where i.user_id = v_thandi_user and i.provider = 'email');
    end if;

    insert into app_users (id, tenant_id, email, full_name, role, customer_id)
    values (v_thandi_user, v_tenant, 'thandi.walkthrough@example.demo', 'Thandi Walkthrough', 'customer', v_thandi_cust)
    on conflict (id) do update set customer_id = v_thandi_cust, role = 'customer', email = excluded.email;

    update customers set email = coalesce(email, 'thandi.walkthrough@example.demo')
     where id = v_thandi_cust;
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
