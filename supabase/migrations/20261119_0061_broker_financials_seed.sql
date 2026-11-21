-- Seed Highveld Demo Brokers + Coastal Demo Brokers (sample financials walkthrough).

do $$
declare
  v_hv uuid := 'd0000000-0000-4000-8000-000000000001';
  v_cd uuid := 'd0000000-0000-4000-8000-000000000002';
  v_hv_owner uuid := 'd0000000-0000-4000-8000-000000000011';
  v_hv_adviser uuid := 'd0000000-0000-4000-8000-000000000012';
  v_cd_owner uuid := 'd0000000-0000-4000-8000-000000000021';
  v_thabo uuid := 'a0000000-0000-4000-8000-000000000201';
  v_protea uuid := 'a0000000-0000-4000-8000-000000000101';
  v_baobab uuid := 'a0000000-0000-4000-8000-000000000103';
  v_hv_cust uuid := 'd0000000-0000-4000-8000-000000000101';
  v_hv_person uuid := 'd0000000-0000-4000-8000-000000000111';
  v_hv_policy uuid := 'd0000000-0000-4000-8000-000000000121';
  v_hv_cover uuid := 'd0000000-0000-4000-8000-000000000122';
  v_hv_item uuid := 'd0000000-0000-4000-8000-000000000131';
  v_hv_ver uuid := 'd0000000-0000-4000-8000-000000000141';
  v_hv_scale uuid := 'd0000000-0000-4000-8000-000000000151';
  v_hv_ver_scale uuid := 'd0000000-0000-4000-8000-000000000152';
  v_hv_batch uuid := 'd0000000-0000-4000-8000-000000000161';
  v_hv_line uuid := 'd0000000-0000-4000-8000-000000000162';
  v_hv_member_owner uuid := 'd0000000-0000-4000-8000-000000000171';
  v_hv_member_adv uuid := 'd0000000-0000-4000-8000-000000000172';
  v_cd_cust uuid := 'd0000000-0000-4000-8000-000000000201';
  v_cd_person uuid := 'd0000000-0000-4000-8000-000000000211';
  v_cd_policy uuid := 'd0000000-0000-4000-8000-000000000221';
  v_cd_cover uuid := 'd0000000-0000-4000-8000-000000000222';
  v_cd_item_m uuid := 'd0000000-0000-4000-8000-000000000231';
  v_cd_item_p uuid := 'd0000000-0000-4000-8000-000000000232';
  v_cd_ver uuid := 'd0000000-0000-4000-8000-000000000241';
  v_cd_scale_m uuid := 'd0000000-0000-4000-8000-000000000251';
  v_cd_scale_p uuid := 'd0000000-0000-4000-8000-000000000252';
  v_cd_sv_m uuid := 'd0000000-0000-4000-8000-000000000253';
  v_cd_sv_p uuid := 'd0000000-0000-4000-8000-000000000254';
  v_cd_earn_m uuid := 'd0000000-0000-4000-8000-000000000261';
  v_cd_earn_p uuid := 'd0000000-0000-4000-8000-000000000262';
  v_cd_batch uuid := 'd0000000-0000-4000-8000-000000000271';
  v_cd_line uuid := 'd0000000-0000-4000-8000-000000000272';
  v_cd_member uuid := 'd0000000-0000-4000-8000-000000000281';
  v_cat text := 'sample';
begin
  insert into organisations (
    id, name, slug, fsp_number, fsp_verified, is_demo, kind, legal_name, trading_name,
    brokerage_type, lifecycle_status, activated_at
  ) values
    (v_hv, 'Highveld Demo Brokers', 'highveld-demo-brokers', 'FSP-HDB-9001', true, true, 'brokerage',
     'Highveld Demo Brokers (Pty) Ltd', 'Highveld Demo Brokers', 'independent', 'active', now()),
    (v_cd, 'Coastal Demo Brokers', 'coastal-demo-brokers', 'FSP-CDB-9002', true, true, 'brokerage',
     'Coastal Demo Brokers (Pty) Ltd', 'Coastal Demo Brokers', 'franchise', 'active', now())
  on conflict (id) do update set name = excluded.name, lifecycle_status = 'active', is_demo = true;

  insert into app_users (id, tenant_id, email, full_name, role) values
    (v_hv_owner, v_hv, 'principal@highveld-demo.example.demo', 'Lindiwe Molefe', 'manager'),
    (v_hv_adviser, v_hv, 'adviser@highveld-demo.example.demo', 'Johan van Wyk', 'broker'),
    (v_cd_owner, v_cd, 'owner@coastal-demo.example.demo', 'Ayesha Naidoo', 'manager')
  on conflict (id) do update set tenant_id = excluded.tenant_id, full_name = excluded.full_name;

  insert into organisation_memberships (id, tenant_id, user_id, role, status) values
    ('d0000000-0000-4000-8000-000000000031', v_hv, v_hv_owner, 'brokerage_owner', 'active'),
    ('d0000000-0000-4000-8000-000000000032', v_hv, v_hv_adviser, 'representative', 'active'),
    ('d0000000-0000-4000-8000-000000000033', v_cd, v_cd_owner, 'brokerage_owner', 'active'),
    ('d0000000-0000-4000-8000-000000000034', v_hv, v_thabo, 'brokerage_admin', 'active'),
    ('d0000000-0000-4000-8000-000000000035', v_cd, v_thabo, 'brokerage_admin', 'active')
  on conflict (id) do nothing;

  insert into sales_team_members (id, tenant_id, user_id, full_name, email, sales_role, status, referral_code) values
    (v_hv_member_owner, v_hv, v_hv_owner, 'Lindiwe Molefe', 'principal@highveld-demo.example.demo', 'broker', 'active', 'HDB-LIN1'),
    (v_hv_member_adv, v_hv, v_hv_adviser, 'Johan van Wyk', 'adviser@highveld-demo.example.demo', 'broker', 'active', 'HDB-JVW1'),
    (v_cd_member, v_cd, v_cd_owner, 'Ayesha Naidoo', 'owner@coastal-demo.example.demo', 'broker', 'active', 'CDB-AYE1')
  on conflict (id) do nothing;

  -- Highveld personal customer + motor policy @ R1000
  insert into customers (id, tenant_id, customer_type, full_name, email, phone, region, status, is_synthetic, data_category, account_number)
  values (v_hv_cust, v_hv, 'personal', 'Priya Naicker', 'priya.naicker@example.demo', '082 555 9101', 'Gauteng', 'active', true, v_cat, 'AC-S9101')
  on conflict (id) do update set full_name = excluded.full_name, data_category = v_cat;

  insert into persons (id, tenant_id, first_names, surname, preferred_name, is_synthetic, data_category, client_number, contact_stage, assigned_member_id)
  values (v_hv_person, v_hv, 'Priya', 'Naicker', 'Priya', true, v_cat, 'CL-S9101', 'client', v_hv_member_adv)
  on conflict (id) do update set client_number = 'CL-S9101', assigned_member_id = v_hv_member_adv;

  insert into customer_persons (id, tenant_id, customer_id, person_id, role, is_primary, data_category)
  values ('d0000000-0000-4000-8000-000000000112', v_hv, v_hv_cust, v_hv_person, 'self', true, v_cat)
  on conflict (id) do nothing;

  insert into policies (
    id, tenant_id, customer_id, line, provider_id, adviser_id, policy_number, origin, status,
    premium_amount, premium_frequency, inception_date, source, data_category, cover_type, reference
  ) values (
    v_hv_policy, v_hv, v_hv_cust, 'short_term_personal', v_protea, v_hv_adviser, 'HDB-MV-1001', 'placed', 'in_force',
    1000, 'monthly', '2025-06-01', 'verified', v_cat, 'motor', 'PL-S9101'
  ) on conflict (id) do update set premium_amount = 1000, status = 'in_force', data_category = v_cat;

  insert into policy_cover (id, tenant_id, data_category, policy_id, person_id, customer_id)
  values (v_hv_cover, v_hv, v_cat, v_hv_policy, v_hv_person, v_hv_cust)
  on conflict (id) do nothing;

  insert into insured_items (id, tenant_id, data_category, person_id, item_type, status, display_label, details)
  values (v_hv_item, v_hv, v_cat, v_hv_person, 'vehicle', 'covered', '2021 Volkswagen Polo GP 456-789',
    '{"make":"Volkswagen","model":"Polo","year":2021,"registration":"GP 456-789"}'::jsonb)
  on conflict (id) do update set status = 'covered', display_label = excluded.display_label;

  insert into policy_versions (id, tenant_id, data_category, policy_id, version_no, entered_at, effective_at, terms)
  values (v_hv_ver, v_hv, v_cat, v_hv_policy, 1, '2025-06-01', '2025-06-01',
    '{"premium":1000,"excess":5000,"sum_insured":220000,"schedule":"Comprehensive motor"}'::jsonb)
  on conflict (id) do update set terms = excluded.terms;

  insert into policy_version_items (tenant_id, data_category, policy_version_id, insured_item_id, item_terms)
  select v_hv, v_cat, v_hv_ver, v_hv_item, '{"role":"vehicle"}'::jsonb
  where not exists (
    select 1 from policy_version_items where policy_version_id = v_hv_ver and insured_item_id = v_hv_item
  );

  insert into policy_premium_rates (
    id, tenant_id, data_category, policy_id, amount, frequency, effective_from, source, reason, status, source_ref
  ) values (
    'd0000000-0000-4000-8000-000000000145', v_hv, v_cat, v_hv_policy, 1000, 'monthly', '2025-06-01',
    'insurer', 'In-force monthly premium', 'confirmed', 'bf:hv:prem:1000'
  ) on conflict (id) do update set amount = 1000, status = 'confirmed', effective_to = null;

  -- Highveld scale 10% ongoing, 70/30
  insert into commission_scales (id, tenant_id, data_category, name, insurer_id, product_line, cover_section, is_active, scenario_id)
  values (v_hv_scale, v_hv, v_cat, 'Protea motor ongoing 10%', v_protea, 'short_term_personal', 'vehicle', true, 'broker-financials-highveld')
  on conflict (id) do update set is_active = true;

  insert into commission_scale_versions (
    id, tenant_id, data_category, scale_id, version_no, earning_type, calc_method, basis, rate,
    effective_from, match_specificity, scenario_id
  ) values (
    v_hv_ver_scale, v_hv, v_cat, v_hv_scale, 1, 'ongoing', 'percent', 'eligible_monthly_premium', 0.10,
    '2025-01-01', 30, 'broker-financials-highveld'
  ) on conflict (id) do update set rate = 0.10;

  delete from commission_split_lines where scale_version_id = v_hv_ver_scale;
  insert into commission_split_lines (
    id, tenant_id, data_category, scale_version_id, recipient_role, recipient_user_id, recipient_name, share_percent, scenario_id
  ) values
    ('d0000000-0000-4000-8000-000000000153', v_hv, v_cat, v_hv_ver_scale, 'brokerage', v_hv_owner, 'Highveld Demo Brokers', 70, 'broker-financials-highveld'),
    ('d0000000-0000-4000-8000-000000000154', v_hv, v_cat, v_hv_ver_scale, 'adviser', v_hv_adviser, 'Johan van Wyk', 30, 'broker-financials-highveld');

  insert into commission_statement_batches (id, tenant_id, data_category, insurer_id, period, label, status, scenario_id, source_ref)
  values (v_hv_batch, v_hv, v_cat, v_protea, '2025-11-01', 'Protea Nov 2025 sample statement', 'open', 'broker-financials-highveld', 'bf:hv:stmt:nov')
  on conflict (id) do update set status = 'open';

  insert into commission_statement_lines (
    id, tenant_id, data_category, batch_id, policy_id, customer_id, section_code, period,
    reported_amount, expected_amount, match_status, scenario_id, source_ref
  ) values (
    v_hv_line, v_hv, v_cat, v_hv_batch, v_hv_policy, v_hv_cust, 'vehicle', '2025-11-01',
    140, 140, 'unmatched', 'broker-financials-highveld', 'bf:hv:stmt:nov:line'
  ) on conflict (id) do update set reported_amount = 140, match_status = 'unmatched', earning_id = null;

  -- Coastal commercial
  insert into customers (id, tenant_id, customer_type, full_name, email, phone, region, status, is_synthetic, data_category, account_number)
  values (v_cd_cust, v_cd, 'commercial', 'Harbour View Logistics (Pty) Ltd', 'risk@harbourview.example.demo', '021 555 9201', 'Western Cape', 'active', true, v_cat, 'AC-S9201')
  on conflict (id) do update set full_name = excluded.full_name;

  insert into persons (id, tenant_id, first_names, surname, preferred_name, is_synthetic, data_category, client_number, contact_stage, assigned_member_id)
  values (v_cd_person, v_cd, 'Harbour View', 'Logistics', 'Harbour View', true, v_cat, 'CL-S9201', 'client', v_cd_member)
  on conflict (id) do update set client_number = 'CL-S9201';

  insert into customer_persons (id, tenant_id, customer_id, person_id, role, is_primary, data_category)
  values ('d0000000-0000-4000-8000-000000000212', v_cd, v_cd_cust, v_cd_person, 'self', true, v_cat)
  on conflict (id) do nothing;

  insert into policies (
    id, tenant_id, customer_id, line, provider_id, adviser_id, policy_number, origin, status,
    premium_amount, premium_frequency, inception_date, source, data_category, cover_type, reference
  ) values (
    v_cd_policy, v_cd, v_cd_cust, 'short_term_commercial', v_baobab, v_cd_owner, 'CDB-CP-2001', 'placed', 'in_force',
    5000, 'monthly', '2025-04-01', 'verified', v_cat, 'commercial_package', 'PL-S9201'
  ) on conflict (id) do update set premium_amount = 5000, status = 'in_force';

  insert into policy_cover (id, tenant_id, data_category, policy_id, person_id, customer_id)
  values (v_cd_cover, v_cd, v_cat, v_cd_policy, v_cd_person, v_cd_cust)
  on conflict (id) do nothing;

  insert into insured_items (id, tenant_id, data_category, person_id, item_type, status, display_label, details) values
    (v_cd_item_m, v_cd, v_cat, v_cd_person, 'vehicle', 'covered', 'Fleet motor section', '{"section":"motor","monthly_premium":2000}'::jsonb),
    (v_cd_item_p, v_cd, v_cat, v_cd_person, 'building', 'covered', 'Depot property section', '{"section":"property","monthly_premium":3000}'::jsonb)
  on conflict (id) do update set status = 'covered';

  insert into policy_versions (id, tenant_id, data_category, policy_id, version_no, entered_at, effective_at, terms)
  values (v_cd_ver, v_cd, v_cat, v_cd_policy, 1, '2025-04-01', '2025-04-01',
    '{"premium":5000,"motor":2000,"property":3000}'::jsonb)
  on conflict (id) do update set terms = excluded.terms;

  insert into policy_premium_rates (id, tenant_id, data_category, policy_id, section_code, amount, frequency, effective_from, source, reason, status, source_ref) values
    ('d0000000-0000-4000-8000-000000000245', v_cd, v_cat, v_cd_policy, 'motor', 2000, 'monthly', '2025-04-01', 'insurer', 'Motor section', 'confirmed', 'bf:cd:prem:motor'),
    ('d0000000-0000-4000-8000-000000000246', v_cd, v_cat, v_cd_policy, 'property', 3000, 'monthly', '2025-04-01', 'insurer', 'Property section', 'confirmed', 'bf:cd:prem:property')
  on conflict (id) do update set amount = excluded.amount;

  insert into commission_scales (id, tenant_id, data_category, name, insurer_id, product_line, cover_section, is_active, scenario_id) values
    (v_cd_scale_m, v_cd, v_cat, 'Baobab commercial motor 10%', v_baobab, 'short_term_commercial', 'motor', true, 'broker-financials-coastal'),
    (v_cd_scale_p, v_cd, v_cat, 'Baobab commercial property 8%', v_baobab, 'short_term_commercial', 'property', true, 'broker-financials-coastal')
  on conflict (id) do update set is_active = true;

  insert into commission_scale_versions (
    id, tenant_id, data_category, scale_id, version_no, earning_type, calc_method, basis, rate, effective_from, match_specificity, scenario_id
  ) values
    (v_cd_sv_m, v_cd, v_cat, v_cd_scale_m, 1, 'ongoing', 'percent', 'eligible_monthly_premium', 0.10, '2025-01-01', 40, 'broker-financials-coastal'),
    (v_cd_sv_p, v_cd, v_cat, v_cd_scale_p, 1, 'ongoing', 'percent', 'eligible_monthly_premium', 0.08, '2025-01-01', 40, 'broker-financials-coastal')
  on conflict (id) do update set rate = excluded.rate;

  delete from commission_split_lines where scale_version_id in (v_cd_sv_m, v_cd_sv_p);
  insert into commission_split_lines (
    id, tenant_id, data_category, scale_version_id, recipient_role, recipient_user_id, recipient_name, share_percent, section_scope, scenario_id
  ) values
    ('d0000000-0000-4000-8000-000000000255', v_cd, v_cat, v_cd_sv_m, 'brokerage', v_cd_owner, 'Coastal Demo Brokers', 100, null, 'broker-financials-coastal'),
    ('d0000000-0000-4000-8000-000000000256', v_cd, v_cat, v_cd_sv_p, 'brokerage', v_cd_owner, 'Coastal Demo Brokers', 75, 'property', 'broker-financials-coastal'),
    ('d0000000-0000-4000-8000-000000000257', v_cd, v_cat, v_cd_sv_p, 'franchise', null, 'Cape Franchise Partner', 25, 'property', 'broker-financials-coastal');

  -- Pre-post Coastal November earnings: motor R200, property R240 = R440 gross; franchise R60 on property
  delete from commission_allocations where tenant_id = v_cd and scenario_id = 'broker-financials-coastal';
  delete from commission_earnings where tenant_id = v_cd and scenario_id = 'broker-financials-coastal';

  insert into commission_earnings (
    id, tenant_id, data_category, customer_id, person_id, policy_id, insurer_id, scale_version_id,
    earning_type, calc_method, basis, period, section_code, eligible_amount, rate, gross_amount,
    event_ref, scenario_id, source_ref
  ) values
    (v_cd_earn_m, v_cd, v_cat, v_cd_cust, v_cd_person, v_cd_policy, v_baobab, v_cd_sv_m,
     'ongoing', 'percent', 'eligible_monthly_premium', '2025-11-01', 'motor', 2000, 0.10, 200,
     'bf:cd:earn:nov:motor', 'broker-financials-coastal', 'bf:cd:earn:nov:motor'),
    (v_cd_earn_p, v_cd, v_cat, v_cd_cust, v_cd_person, v_cd_policy, v_baobab, v_cd_sv_p,
     'ongoing', 'percent', 'eligible_monthly_premium', '2025-11-01', 'property', 3000, 0.08, 240,
     'bf:cd:earn:nov:property', 'broker-financials-coastal', 'bf:cd:earn:nov:property');

  insert into commission_allocations (
    id, tenant_id, data_category, earning_id, recipient_role, recipient_user_id, recipient_name,
    share_percent, amount, payable_amount, paid_amount, scenario_id, source_ref
  ) values
    ('d0000000-0000-4000-8000-000000000263', v_cd, v_cat, v_cd_earn_m, 'brokerage', v_cd_owner, 'Coastal Demo Brokers', 100, 200, 0, 0, 'broker-financials-coastal', 'bf:cd:alloc:m:br'),
    ('d0000000-0000-4000-8000-000000000264', v_cd, v_cat, v_cd_earn_p, 'brokerage', v_cd_owner, 'Coastal Demo Brokers', 75, 180, 0, 0, 'broker-financials-coastal', 'bf:cd:alloc:p:br'),
    ('d0000000-0000-4000-8000-000000000265', v_cd, v_cat, v_cd_earn_p, 'franchise', null, 'Cape Franchise Partner', 25, 60, 60, 0, 'broker-financials-coastal', 'bf:cd:alloc:p:fr');

  insert into commission_statement_batches (id, tenant_id, data_category, insurer_id, period, label, status, scenario_id, source_ref)
  values (v_cd_batch, v_cd, v_cat, v_baobab, '2025-11-01', 'Baobab Nov 2025 property line (short)', 'exception', 'broker-financials-coastal', 'bf:cd:stmt:nov')
  on conflict (id) do update set status = 'exception';

  insert into commission_statement_lines (
    id, tenant_id, data_category, batch_id, policy_id, customer_id, section_code, period,
    reported_amount, expected_amount, variance, match_status, earning_id, exception_note, scenario_id, source_ref
  ) values (
    v_cd_line, v_cd, v_cat, v_cd_batch, v_cd_policy, v_cd_cust, 'property', '2025-11-01',
    230, 240, 10, 'exception', v_cd_earn_p, 'Shortfall R10 — investigate before closing', 'broker-financials-coastal', 'bf:cd:stmt:nov:prop'
  ) on conflict (id) do update set reported_amount = 230, expected_amount = 240, variance = 10, match_status = 'exception', earning_id = v_cd_earn_p;

  insert into broker_financials_scenario_state (tenant_id, data_category, scenario_id, step_index, status, last_summary)
  values
    (v_hv, v_cat, 'broker-financials-highveld', 0, 'idle', 'Ready'),
    (v_cd, v_cat, 'broker-financials-coastal', 0, 'idle', 'R10 property shortfall open')
  on conflict (tenant_id, data_category, scenario_id) do update set step_index = 0, status = 'idle', updated_at = now();
end $$;

create or replace function public.bf_seed_coastal_runtime(p_category text default 'sample')
returns void language plpgsql security definer set search_path = public as $$
declare
  v_cd uuid := 'd0000000-0000-4000-8000-000000000002';
  v_cd_cust uuid := 'd0000000-0000-4000-8000-000000000201';
  v_cd_person uuid := 'd0000000-0000-4000-8000-000000000211';
  v_cd_policy uuid := 'd0000000-0000-4000-8000-000000000221';
  v_baobab uuid := 'a0000000-0000-4000-8000-000000000103';
  v_cd_sv_m uuid := 'd0000000-0000-4000-8000-000000000253';
  v_cd_sv_p uuid := 'd0000000-0000-4000-8000-000000000254';
  v_cd_earn_m uuid := 'd0000000-0000-4000-8000-000000000261';
  v_cd_earn_p uuid := 'd0000000-0000-4000-8000-000000000262';
  v_cd_owner uuid := 'd0000000-0000-4000-8000-000000000021';
  v_cd_batch uuid := 'd0000000-0000-4000-8000-000000000271';
  v_cd_line uuid := 'd0000000-0000-4000-8000-000000000272';
  v_cat text := coalesce(p_category, 'sample');
begin
  if app.tenant_id() is distinct from v_cd then return; end if;
  delete from commission_allocations where tenant_id = v_cd and data_category = v_cat and scenario_id = 'broker-financials-coastal';
  delete from commission_earnings where tenant_id = v_cd and data_category = v_cat and scenario_id = 'broker-financials-coastal';
  insert into commission_earnings (
    id, tenant_id, data_category, customer_id, person_id, policy_id, insurer_id, scale_version_id,
    earning_type, calc_method, basis, period, section_code, eligible_amount, rate, gross_amount,
    event_ref, scenario_id, source_ref
  ) values
    (v_cd_earn_m, v_cd, v_cat, v_cd_cust, v_cd_person, v_cd_policy, v_baobab, v_cd_sv_m,
     'ongoing', 'percent', 'eligible_monthly_premium', '2025-11-01', 'motor', 2000, 0.10, 200,
     'bf:cd:earn:nov:motor', 'broker-financials-coastal', 'bf:cd:earn:nov:motor'),
    (v_cd_earn_p, v_cd, v_cat, v_cd_cust, v_cd_person, v_cd_policy, v_baobab, v_cd_sv_p,
     'ongoing', 'percent', 'eligible_monthly_premium', '2025-11-01', 'property', 3000, 0.08, 240,
     'bf:cd:earn:nov:property', 'broker-financials-coastal', 'bf:cd:earn:nov:property')
  on conflict (id) do update set gross_amount = excluded.gross_amount, cash_received_amount = 0, statement_matched = false;
  insert into commission_allocations (
    id, tenant_id, data_category, earning_id, recipient_role, recipient_user_id, recipient_name,
    share_percent, amount, payable_amount, paid_amount, scenario_id, source_ref
  ) values
    ('d0000000-0000-4000-8000-000000000263', v_cd, v_cat, v_cd_earn_m, 'brokerage', v_cd_owner, 'Coastal Demo Brokers', 100, 200, 0, 0, 'broker-financials-coastal', 'bf:cd:alloc:m:br'),
    ('d0000000-0000-4000-8000-000000000264', v_cd, v_cat, v_cd_earn_p, 'brokerage', v_cd_owner, 'Coastal Demo Brokers', 75, 180, 0, 0, 'broker-financials-coastal', 'bf:cd:alloc:p:br'),
    ('d0000000-0000-4000-8000-000000000265', v_cd, v_cat, v_cd_earn_p, 'franchise', null, 'Cape Franchise Partner', 25, 60, 60, 0, 'broker-financials-coastal', 'bf:cd:alloc:p:fr')
  on conflict (id) do update set amount = excluded.amount, payable_amount = excluded.payable_amount, paid_amount = 0;
  update commission_statement_lines set
    reported_amount = 230, expected_amount = 240, variance = 10, match_status = 'exception',
    earning_id = v_cd_earn_p, exception_note = 'Shortfall R10 — investigate before closing'
  where id = v_cd_line;
  update commission_statement_batches set status = 'exception' where id = v_cd_batch;
end $$;
