-- Demo seed: Naledi Parkhurst leak request + two electricians for reassignment demo.
-- Plumber is intentionally not seeded so the acceptance test can Add provider mid-request.
-- Applied via MCP as service_providers_demo_seed on bcovered.

do $$
declare
  v_tenant uuid := 'a0000000-0000-4000-8000-000000000001';
  v_cat text := 'sample';
  v_person uuid := 'c0000000-0000-4000-8000-000000000310';
  v_cust uuid := 'a0000000-0000-4000-8000-000000000310';
  v_item uuid := 'a0000000-0000-4000-8000-000000000322';
  v_policy uuid := 'a0000000-0000-4000-8000-000000000332';
  v_lerato uuid := 'a0000000-0000-4000-8000-000000000711';
  v_req uuid := 'a0000000-0000-4000-8000-000000000910';
  v_trade_elec uuid;
  v_p1 uuid := 'a0000000-0000-4000-8000-000000000801';
  v_p2 uuid := 'a0000000-0000-4000-8000-000000000802';
begin
  select id into v_trade_elec from service_trade_types
  where tenant_id = v_tenant and data_category = v_cat and code = 'electrician';

  insert into concierge_requests (
    id, tenant_id, data_category, reference, person_id, customer_id, insured_item_id, policy_id,
    request_kind, title, status, next_action, responsible_party, owner_member_id, details, created_at, updated_at
  ) values (
    v_req, v_tenant, v_cat, 'CG-S-LEAK-1', v_person, v_cust, v_item, v_policy,
    'assist', 'Leaking pipe at Parkhurst home', 'with_concierge',
    'Allocate provider', 'concierge', v_lerato,
    jsonb_build_object('urgency', 'same_day', 'service_address', 'Parkhurst, Johannesburg'),
    now(), now()
  )
  on conflict (id, data_category) do update set
    title = excluded.title,
    status = 'with_concierge',
    next_action = 'Allocate provider',
    responsible_party = 'concierge',
    insured_item_id = excluded.insured_item_id,
    policy_id = excluded.policy_id,
    updated_at = now();

  insert into concierge_request_events (
    tenant_id, data_category, request_id, event_type, body, visibility, payload
  )
  select v_tenant, v_cat, v_req, 'request_opened',
    'Naledi reported a leaking pipe at the Parkhurst home.', 'customer',
    jsonb_build_object('demo', true)
  where not exists (
    select 1 from concierge_request_events e
    where e.request_id = v_req and e.event_type = 'request_opened' and e.payload->>'demo' = 'true'
  );

  if v_trade_elec is not null then
    insert into service_providers (
      id, tenant_id, data_category, trading_name, contact_person, phone, email,
      after_hours_available, standard_callout_fee_zar, preferred, active, internal_notes
    ) values
      (v_p1, v_tenant, v_cat, 'SparkSafe Electrical', 'Thabo Nkosi', '0825551001', 'jobs@sparksafe.demo',
       true, 650, true, true, 'Demo electrician 1 — Parkhurst / Rosebank'),
      (v_p2, v_tenant, v_cat, 'Highveld Sparks', 'Aisha Patel', '0825551002', 'desk@highveldsparks.demo',
       false, 580, false, true, 'Demo electrician 2 for reassignment')
    on conflict (id, data_category) do update set
      trading_name = excluded.trading_name,
      active = true,
      updated_at = now();

    delete from service_provider_trades where provider_id in (v_p1, v_p2);
    insert into service_provider_trades (provider_id, data_category, trade_type_id) values
      (v_p1, v_cat, v_trade_elec), (v_p2, v_cat, v_trade_elec);

    delete from service_provider_areas where provider_id in (v_p1, v_p2);
    insert into service_provider_areas (provider_id, data_category, area_label, area_kind) values
      (v_p1, v_cat, 'Parkhurst', 'suburb'),
      (v_p1, v_cat, 'Rosebank', 'suburb'),
      (v_p2, v_cat, 'Parkhurst', 'suburb'),
      (v_p2, v_cat, 'Sandton', 'suburb');
  end if;
end $$;
