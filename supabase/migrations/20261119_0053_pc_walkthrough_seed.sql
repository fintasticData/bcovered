-- Realign motor sample to Oct → 1 Nov replacement; settlement money walkthrough;
-- home buildings+contents storm; commercial depot equipment claim.

do $$
declare
  v_person persons%rowtype;
  v_tenant uuid;
  v_policy uuid := 'c1111111-0000-4000-8000-00000000a001';
  v_item_old uuid := 'c1111111-0000-4000-8000-00000000a010';
  v_item_new uuid := 'c1111111-0000-4000-8000-00000000a011';
  v_item_contents uuid := 'c1111111-0000-4000-8000-00000000a012';
  v_ver1 uuid := 'c1111111-0000-4000-8000-00000000a020';
  v_ver2 uuid := 'c1111111-0000-4000-8000-00000000a021';
  v_claim1 uuid := 'c1111111-0000-4000-8000-00000000a030';
  v_claim_settle uuid := 'c1111111-0000-4000-8000-00000000a032';
  v_home_policy uuid := 'c1111111-0000-4000-8000-00000000b001';
  v_home_cover uuid := 'c1111111-0000-4000-8000-00000000b002';
  v_building uuid := 'c1111111-0000-4000-8000-00000000b010';
  v_contents uuid := 'c1111111-0000-4000-8000-00000000b011';
  v_home_ver uuid := 'c1111111-0000-4000-8000-00000000b020';
  v_storm uuid := 'c1111111-0000-4000-8000-00000000b030';
  v_biz_person persons%rowtype;
  v_depot_policy uuid := 'c1111111-0000-4000-8000-00000000c001';
  v_depot_cover uuid := 'c1111111-0000-4000-8000-00000000c002';
  v_equipment uuid := 'c1111111-0000-4000-8000-00000000c010';
  v_depot_ver uuid := 'c1111111-0000-4000-8000-00000000c020';
  v_depot_claim uuid := 'c1111111-0000-4000-8000-00000000c030';
  v_customer_id uuid;
  v_insurer uuid := 'a0000000-0000-4000-8000-000000000101';
  v_existing uuid;
begin
  select * into v_person from persons
   where client_number = 'CL-S1001' and data_category = 'sample'
   order by case when id = 'c0000000-0000-4000-8000-000000000001' then 0 else 1 end
   limit 1;
  if not found then
    raise notice 'CL-S1001 missing — skipping walkthrough seed';
    return;
  end if;
  v_tenant := v_person.tenant_id;
  select customer_id into v_customer_id from customer_persons where person_id = v_person.id limit 1;

  select id into v_existing from policies
   where tenant_id = v_tenant and data_category = 'sample'
     and provider_id = v_insurer and policy_number = 'PRO-MV-220145' limit 1;
  if v_existing is not null then v_policy := v_existing; end if;

  -- Realign versions: Oct schedule superseded exclusively 1 Nov
  update policy_versions set
    effective_at = '2025-10-01 00:00:00+02',
    superseded_at = '2025-11-01 00:00:00+02',
    terms = jsonb_build_object('premium',850,'excess',5000,'sum_insured',280000,'schedule','Comprehensive motor')
  where id = v_ver1 and tenant_id = v_tenant;

  update policy_versions set
    effective_at = '2025-11-01 00:00:00+02',
    superseded_at = null,
    terms = jsonb_build_object('premium',920,'excess',5000,'sum_insured',420000,'schedule','Vehicle replacement endorsement')
  where id = v_ver2 and tenant_id = v_tenant;

  update insured_items set details = details || jsonb_build_object(
    'registration','CA 123-456','use','private','valuation_basis','retail'
  ) where id = v_item_old;

  update insured_items set details = details || jsonb_build_object(
    'registration','CA 987-654','use','private','valuation_basis','retail'
  ) where id = v_item_new;

  update insured_items set details = details || jsonb_build_object(
    'location','Sea Point flat','contents_limit',250000,'specified_valuables','Jewellery R45 000'
  ) where id = v_item_contents;

  update policy_service_requests set
    requested_effective_at = '2025-11-01 00:00:00+02',
    confirmed_effective_at = '2025-11-01 00:00:00+02'
  where id = 'c1111111-0000-4000-8000-00000000a040';

  -- Historical loss 28 Oct → v1; second verification claim 1 Nov → v2 already exists as claim2 path
  update claims set
    incident_at = '2025-10-28 14:30:00+02',
    policy_version_id = v_ver1,
    original_policy_version_id = v_ver1,
    description = 'Rear-end collision while parked — loss date 28 Oct (pre-replacement schedule).',
    settlement_amount = null
  where id = v_claim1;

  update claim_affected_items set section_code = 'vehicle', policy_version_id = v_ver1
  where claim_id = v_claim1;

  -- Premium history R850 → R920
  delete from policy_premium_rates where policy_id = v_policy and data_category = 'sample';
  insert into policy_premium_rates (
    id, tenant_id, data_category, policy_id, amount, frequency, effective_from, effective_to,
    source, reason, status, breakdown_available, source_ref
  ) values
    ('c1111111-0000-4000-8000-00000000a050', v_tenant, 'sample', v_policy, 850, 'monthly', '2025-10-01', '2025-10-31',
     'insurer', 'In-force monthly premium', 'superseded', true, 'prem:850:oct'),
    ('c1111111-0000-4000-8000-00000000a051', v_tenant, 'sample', v_policy, 920, 'monthly', '2025-11-01', null,
     'insurer', 'Renewal / replacement premium', 'confirmed', true, 'prem:920:nov')
  on conflict (id) do update set amount = excluded.amount, effective_from = excluded.effective_from, effective_to = excluded.effective_to, status = excluded.status;

  update policies set premium_amount = 920, premium_frequency = 'monthly' where id = v_policy;

  delete from policy_transactions where policy_id = v_policy and data_category = 'sample';
  insert into policy_transactions (
    id, tenant_id, data_category, policy_id, txn_type, amount, txn_date, reference, source, reconciliation_status, source_ref
  ) values
    ('c1111111-0000-4000-8000-00000000a060', v_tenant, 'sample', v_policy, 'due', 920, '2025-11-01', 'INV-NOV-920', 'insurer', 'unreconciled', 'due:nov:920'),
    ('c1111111-0000-4000-8000-00000000a061', v_tenant, 'sample', v_policy, 'collection', 920, '2025-11-03', 'COL-NOV-920', 'debit_order', 'matched', 'col:nov:920'),
    ('c1111111-0000-4000-8000-00000000a062', v_tenant, 'sample', v_policy, 'commission', 138, '2025-11-03', 'COMM-NOV', 'broker', 'matched', 'comm:nov:138')
  on conflict (id) do nothing;

  -- Settlement walkthrough claim (approved R12 000)
  insert into claims (
    id, tenant_id, data_category, person_id, policy_id, policy_version_id, original_policy_version_id,
    incident_at, incident_time_unknown, incident_type, description, status, next_action,
    decision, decision_source, settlement_amount, insurer_reference, submitted_at
  ) values (
    v_claim_settle, v_tenant, 'sample', v_person.id, v_policy, v_ver2, v_ver2,
    '2025-11-05 09:00:00+02', false, 'accident',
    'Sample settlement claim — approved net R12 000 for walkthrough payments.',
    'decision_received', 'Record settlement payments',
    'approved', 'insurer_email', 12000, 'INS-SET-12000', '2025-11-06 10:00:00+02'
  ) on conflict (id) do update set settlement_amount = 12000, decision = 'approved', status = 'decision_received';

  insert into claim_affected_items (tenant_id, data_category, claim_id, insured_item_id, display_label, item_type, snapshot, section_code, policy_version_id)
  select v_tenant, 'sample', v_claim_settle, v_item_new, display_label, item_type, details, 'vehicle', v_ver2
  from insured_items where id = v_item_new
  on conflict do nothing;

  delete from claim_transactions where claim_id = v_claim_settle;
  insert into claim_transactions (
    id, tenant_id, data_category, claim_id, txn_type, payee, amount, status, txn_date, reference, source_ref
  ) values
    ('c1111111-0000-4000-8000-00000000a070', v_tenant, 'sample', v_claim_settle, 'payment', 'Cape Panelbeaters', 8000, 'confirmed', '2025-11-10', 'PAY-8000', 'settle:pay:8000'),
    ('c1111111-0000-4000-8000-00000000a071', v_tenant, 'sample', v_claim_settle, 'payment', 'Cape Panelbeaters', 4000, 'confirmed', '2025-11-12', 'PAY-4000', 'settle:pay:4000'),
    ('c1111111-0000-4000-8000-00000000a072', v_tenant, 'sample', v_claim_settle, 'recovery', 'Third party insurer', 1000, 'confirmed', '2025-11-15', 'REC-1000', 'settle:rec:1000')
  on conflict (id) do nothing;

  -- Home buildings + contents
  if v_customer_id is not null then
    insert into policies (
      id, tenant_id, customer_id, line, provider_id, policy_number, origin, status,
      premium_amount, premium_frequency, inception_date, source, data_category, cover_type, reference
    ) values (
      v_home_policy, v_tenant, v_customer_id, 'short_term_personal', v_insurer, 'PRO-HH-880011', 'placed', 'in_force',
      1450, 'monthly', '2025-09-01', 'verified', 'sample', 'home', 'PL-S-HOME1'
    ) on conflict (id) do update set status = 'in_force';

    insert into policy_cover (id, tenant_id, data_category, policy_id, person_id, customer_id)
    values (v_home_cover, v_tenant, 'sample', v_home_policy, v_person.id, v_customer_id)
    on conflict (id) do nothing;

    insert into insured_items (id, tenant_id, data_category, person_id, item_type, status, display_label, details) values
      (v_building, v_tenant, 'sample', v_person.id, 'building', 'covered', 'Family home — Observatory',
       '{"risk_address":"12 Lower Main Rd, Observatory","building_sum_insured":3200000,"construction":"Brick"}'::jsonb),
      (v_contents, v_tenant, 'sample', v_person.id, 'contents', 'covered', 'Household contents — Observatory',
       '{"location":"12 Lower Main Rd, Observatory","contents_limit":450000,"specified_valuables":"Electronics R80 000"}'::jsonb)
    on conflict (id) do update set details = excluded.details, status = 'covered';

    insert into policy_versions (id, tenant_id, data_category, policy_id, version_no, entered_at, effective_at, terms)
    values (v_home_ver, v_tenant, 'sample', v_home_policy, 1, now(), '2025-09-01 00:00:00+02',
      '{"premium":1450,"schedule":"Buildings and contents"}'::jsonb)
    on conflict (id) do nothing;

    insert into policy_version_items (tenant_id, data_category, policy_version_id, insured_item_id, item_terms) values
      (v_tenant, 'sample', v_home_ver, v_building, '{"section":"buildings","excess":5000}'::jsonb),
      (v_tenant, 'sample', v_home_ver, v_contents, '{"section":"contents","excess":2500}'::jsonb)
    on conflict do nothing;

    insert into claims (
      id, tenant_id, data_category, person_id, policy_id, policy_version_id, original_policy_version_id,
      incident_at, incident_time_unknown, incident_type, description, status, next_action, insurer_reference
    ) values (
      v_storm, v_tenant, 'sample', v_person.id, v_home_policy, v_home_ver, v_home_ver,
      '2025-10-12 18:00:00+02', true, 'storm',
      'Storm damage to roof and household contents at Observatory home.',
      'under_assessment', 'Collect section evidence', 'HOME-STORM-01'
    ) on conflict (id) do update set description = excluded.description;

    delete from claim_affected_items where claim_id = v_storm;
    insert into claim_affected_items (tenant_id, data_category, claim_id, insured_item_id, display_label, item_type, snapshot, section_code, policy_version_id)
    select v_tenant, 'sample', v_storm, id, display_label, item_type, details, item_type, v_home_ver
    from insured_items where id in (v_building, v_contents);
  end if;

  -- Commercial depot sample (prefer a business-linked sample person if present)
  select * into v_biz_person from persons
   where data_category = 'sample' and tenant_id = v_tenant
     and (client_number like 'CL-S%' and id <> v_person.id)
   order by client_number limit 1;
  if found then
    select customer_id into v_customer_id from customer_persons where person_id = v_biz_person.id limit 1;
    if v_customer_id is not null then
      insert into policies (
        id, tenant_id, customer_id, line, provider_id, policy_number, origin, status,
        premium_amount, premium_frequency, inception_date, source, data_category, cover_type, reference
      ) values (
        v_depot_policy, v_tenant, v_customer_id, 'short_term_commercial', v_insurer, 'PRO-CM-440022', 'placed', 'in_force',
        3800, 'monthly', '2025-08-01', 'verified', 'sample', 'commercial_package', 'PL-S-DEPOT1'
      ) on conflict (id) do update set status = 'in_force';

      insert into policy_cover (id, tenant_id, data_category, policy_id, person_id, customer_id)
      values (v_depot_cover, v_tenant, 'sample', v_depot_policy, v_biz_person.id, v_customer_id)
      on conflict (id) do nothing;

      insert into insured_items (id, tenant_id, data_category, person_id, item_type, status, display_label, details)
      values (v_equipment, v_tenant, 'sample', v_biz_person.id, 'contents', 'covered', 'Depot equipment — Montague Gardens',
        '{"location":"Unit 4, Montague Gardens","contents_limit":900000,"specified_valuables":"Workshop plant R650 000","section":"equipment"}'::jsonb)
      on conflict (id) do update set details = excluded.details;

      insert into policy_versions (id, tenant_id, data_category, policy_id, version_no, entered_at, effective_at, terms)
      values (v_depot_ver, v_tenant, 'sample', v_depot_policy, 1, now(), '2025-08-01 00:00:00+02',
        '{"premium":3800,"schedule":"Commercial equipment"}'::jsonb)
      on conflict (id) do nothing;

      insert into policy_version_items (tenant_id, data_category, policy_version_id, insured_item_id, item_terms)
      values (v_tenant, 'sample', v_depot_ver, v_equipment, '{"section":"equipment","excess":10000}'::jsonb)
      on conflict do nothing;

      insert into claims (
        id, tenant_id, data_category, person_id, policy_id, policy_version_id, original_policy_version_id,
        incident_at, incident_time_unknown, incident_type, description, status, next_action, insurer_reference
      ) values (
        v_depot_claim, v_tenant, 'sample', v_biz_person.id, v_depot_policy, v_depot_ver, v_depot_ver,
        '2025-10-20 11:00:00+02', false, 'theft',
        'Forced entry — workshop plant damaged and tools stolen at depot.',
        'awaiting_evidence', 'Supply depot CCTV and inventory', 'DEPOT-THFT-01'
      ) on conflict (id) do update set description = excluded.description;

      delete from claim_affected_items where claim_id = v_depot_claim;
      insert into claim_affected_items (tenant_id, data_category, claim_id, insured_item_id, display_label, item_type, snapshot, section_code, policy_version_id)
      select v_tenant, 'sample', v_depot_claim, id, display_label, item_type, details, 'equipment', v_depot_ver
      from insured_items where id = v_equipment;
    end if;
  end if;
end $$;
