-- Demo: approve CLM-S1007 burglary and seed locksmith + appliance quote jobs.

do $$
declare
  tid uuid := 'a0000000-0000-4000-8000-000000000001';
  cat text := 'sample';
  v_claim_id uuid := '03766623-19d9-40e5-8737-06af43ac61d7';
  v_person_id uuid := 'c0000000-0000-4000-8000-000000000310';
  v_cust_id uuid := 'a0000000-0000-4000-8000-000000000310';
  v_pol_id uuid := 'a0000000-0000-4000-8000-000000000331';
  lock_trade uuid;
  appl_trade uuid;
  lock_prov uuid := 'b0000000-0000-4000-8000-00000000c101';
  appl_prov1 uuid := 'b0000000-0000-4000-8000-00000000c102';
  appl_prov2 uuid := 'b0000000-0000-4000-8000-00000000c103';
  job_lock uuid := 'b0000000-0000-4000-8000-00000000d101';
  job_appl uuid := 'b0000000-0000-4000-8000-00000000d102';
begin
  perform app.ensure_service_trade_types(tid, cat);

  select id into lock_trade from service_trade_types
  where tenant_id = tid and data_category = cat and code = 'locksmith';
  select id into appl_trade from service_trade_types
  where tenant_id = tid and data_category = cat and code = 'appliance_repair';

  if lock_trade is null or appl_trade is null then
    raise exception 'trade types missing for sample';
  end if;

  update claims set
    status = 'decision_received',
    decision = 'approved',
    decision_source = 'insurer_email',
    settlement_amount = coalesce(settlement_amount, 18500),
    next_action = 'Get repair quotes from service providers',
    insurer_reference = coalesce(insurer_reference, 'PROT-CLM-S1007'),
    submitted_at = coalesce(submitted_at, now() - interval '3 days'),
    updated_at = now()
  where id = v_claim_id and data_category = cat;

  insert into service_providers (
    id, tenant_id, data_category, trading_name, contact_person, phone, email,
    street_address, suburb, city, province, preferred, active
  ) values
    (lock_prov, tid, cat, 'Parkhurst Secure Locksmith', 'Thabo N.', '0115550101', 'quotes@parkhurstlocks.demo',
     '45 4th Ave', 'Parkhurst', 'Johannesburg', 'Gauteng', true, true),
    (appl_prov1, tid, cat, 'Randburg Appliance Care', 'Lerato M.', '0115550102', 'jobs@randburgappl.demo',
     '12 Dover St', 'Randburg', 'Johannesburg', 'Gauteng', true, true),
    (appl_prov2, tid, cat, 'Northcliff Fix-It Appliances', 'Sam K.', '0115550103', 'hello@northclifffix.demo',
     '88 Beyers Naude Dr', 'Northcliff', 'Johannesburg', 'Gauteng', false, true)
  on conflict (id) do update set
    trading_name = excluded.trading_name,
    active = true,
    preferred = excluded.preferred,
    phone = excluded.phone,
    email = excluded.email,
    street_address = excluded.street_address,
    suburb = excluded.suburb,
    city = excluded.city;

  insert into service_provider_trades (provider_id, trade_type_id, data_category)
  values
    (lock_prov, lock_trade, cat),
    (appl_prov1, appl_trade, cat),
    (appl_prov2, appl_trade, cat)
  on conflict (provider_id, trade_type_id) do nothing;

  delete from service_provider_areas where provider_id in (lock_prov, appl_prov1, appl_prov2);
  insert into service_provider_areas (provider_id, data_category, area_label, area_kind)
  values
    (lock_prov, cat, 'Parkhurst', 'suburb'),
    (lock_prov, cat, 'Randburg', 'suburb'),
    (appl_prov1, cat, 'Randburg', 'suburb'),
    (appl_prov1, cat, 'Parkhurst', 'suburb'),
    (appl_prov2, cat, 'Northcliff', 'suburb'),
    (appl_prov2, cat, 'Parkhurst', 'suburb');

  delete from service_job_allocations where job_id in (job_lock, job_appl);
  delete from service_jobs where id in (job_lock, job_appl);
  -- also clear any prior claim jobs for clean demo
  delete from service_job_allocations a
  using service_jobs j
  where a.job_id = j.id and j.claim_id = v_claim_id;
  delete from service_jobs where service_jobs.claim_id = v_claim_id;

  insert into service_jobs (
    id, tenant_id, data_category, claim_id, policy_id, person_id, customer_id,
    trade_type_id, work_description, urgency, preferred_window, service_address,
    status, authority_status, payment_responsibility, quoted_callout_fee_zar,
    next_action, responsible_party
  ) values
    (job_lock, tid, cat, v_claim_id, v_pol_id, v_person_id, v_cust_id, lock_trade,
     'Rekey and secure doors after burglary at Parkhurst residence', 'same_day', '{}'::jsonb,
     'Parkhurst, Johannesburg', 'seeking_provider', 'recorded', 'insurer', 450,
     'Compare locksmith quotes', 'concierge'),
    (job_appl, tid, cat, v_claim_id, v_pol_id, v_person_id, v_cust_id, appl_trade,
     'Assess and quote stolen / damaged home appliances', 'standard', '{}'::jsonb,
     'Parkhurst, Johannesburg', 'seeking_provider', 'recorded', 'insurer', 650,
     'Compare appliance quotes', 'concierge');

  insert into service_job_allocations (
    tenant_id, data_category, job_id, provider_id, attempt_no, is_current, status,
    quoted_callout_fee_zar, shared_customer_fields
  ) values
    (tid, cat, job_lock, lock_prov, 1, true, 'proposed', 450, '{"phone":true}'::jsonb),
    (tid, cat, job_appl, appl_prov1, 1, true, 'proposed', 650, '{"phone":true}'::jsonb),
    (tid, cat, job_appl, appl_prov2, 2, false, 'proposed', 720, '{}'::jsonb);
end $$;
