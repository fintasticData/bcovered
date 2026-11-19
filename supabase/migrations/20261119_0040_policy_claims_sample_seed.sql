-- Sample records: Thandi CL-S1001 motor policy with v1 (pre-12 Nov), v2 (15 Nov replacement),
-- claim on 12 Nov linked to v1, and a second claim with outstanding photos.

do $$
declare
  v_person persons%rowtype;
  v_customer_id uuid;
  v_tenant uuid;
  v_insurer uuid := 'a0000000-0000-4000-8000-000000000101'; -- Protea Insure
  v_policy uuid := 'c1111111-0000-4000-8000-00000000a001';
  v_existing_policy uuid;
  v_cover uuid := 'c1111111-0000-4000-8000-00000000a002';
  v_item_old uuid := 'c1111111-0000-4000-8000-00000000a010';
  v_item_new uuid := 'c1111111-0000-4000-8000-00000000a011';
  v_item_contents uuid := 'c1111111-0000-4000-8000-00000000a012';
  v_ver1 uuid := 'c1111111-0000-4000-8000-00000000a020';
  v_ver2 uuid := 'c1111111-0000-4000-8000-00000000a021';
  v_claim1 uuid := 'c1111111-0000-4000-8000-00000000a030';
  v_claim2 uuid := 'c1111111-0000-4000-8000-00000000a031';
  v_psr uuid := 'c1111111-0000-4000-8000-00000000a040';
begin
  -- Prefer canonical sample person tied to existing PRO-MV-220145 policy seed
  select * into v_person from persons
   where client_number = 'CL-S1001' and data_category = 'sample'
     and id = 'c0000000-0000-4000-8000-000000000001'
   limit 1;
  if not found then
    select * into v_person from persons where client_number = 'CL-S1001' and data_category = 'sample' limit 1;
  end if;
  if not found then
    raise notice 'Sample person CL-S1001 not found — skipping policy/claims seed';
    return;
  end if;
  v_tenant := v_person.tenant_id;
  select customer_id into v_customer_id from customer_persons where person_id = v_person.id limit 1;
  if v_customer_id is null then
    raise notice 'No customer link for CL-S1001 — skipping seed';
    return;
  end if;

  -- Reuse existing sample policy if policy_number already seeded under another id
  select id into v_existing_policy from policies
   where tenant_id = v_tenant and data_category = 'sample'
     and provider_id = v_insurer and policy_number = 'PRO-MV-220145'
   limit 1;
  if v_existing_policy is not null then
    v_policy := v_existing_policy;
    update policies set
      status = 'in_force',
      premium_amount = 1250,
      premium_frequency = 'monthly',
      cover_type = coalesce(cover_type, 'motor'),
      customer_id = v_customer_id
    where id = v_policy;
  else
    insert into policies (
      id, tenant_id, customer_id, line, provider_id, policy_number, origin, status,
      premium_amount, premium_frequency, inception_date, source, data_category, cover_type, reference
    ) values (
      v_policy, v_tenant, v_customer_id, 'short_term_personal', v_insurer, 'PRO-MV-220145', 'placed', 'in_force',
      1250, 'monthly', '2025-03-01', 'verified', 'sample', 'motor', app.next_number(v_tenant, 'policy', 'sample')
    ) on conflict (id) do update set status = excluded.status, premium_amount = excluded.premium_amount;
  end if;

  insert into policy_cover (id, tenant_id, data_category, policy_id, person_id, customer_id)
  values (v_cover, v_tenant, 'sample', v_policy, v_person.id, v_customer_id)
  on conflict (id) do nothing;

  insert into insured_items (id, tenant_id, data_category, person_id, item_type, status, display_label, details)
  values
    (v_item_old, v_tenant, 'sample', v_person.id, 'vehicle', 'replaced', '2019 Toyota Corolla CA 123-456',
      '{"make":"Toyota","model":"Corolla","year":2019,"registration":"CA 123-456"}'::jsonb),
    (v_item_new, v_tenant, 'sample', v_person.id, 'vehicle', 'covered', '2024 Hyundai Tucson CY 987-654',
      '{"make":"Hyundai","model":"Tucson","year":2024,"registration":"CY 987-654"}'::jsonb),
    (v_item_contents, v_tenant, 'sample', v_person.id, 'contents', 'covered', 'Home contents — Sea Point flat',
      '{"sum_insured":450000}'::jsonb)
  on conflict (id) do update set status = excluded.status, display_label = excluded.display_label, details = excluded.details;

  insert into policy_versions (id, tenant_id, data_category, policy_id, version_no, entered_at, effective_at, superseded_at, terms)
  values
    (v_ver1, v_tenant, 'sample', v_policy, 1, '2025-03-01', '2025-03-01', '2025-11-15 09:00:00+02',
      '{"premium":1250,"excess":5000,"sum_insured":280000,"schedule":"Comprehensive motor"}'::jsonb),
    (v_ver2, v_tenant, 'sample', v_policy, 2, '2025-11-16', '2025-11-15 09:00:00+02', null,
      '{"premium":1380,"excess":5000,"sum_insured":420000,"schedule":"Vehicle replacement endorsement"}'::jsonb)
  on conflict (id) do update set effective_at = excluded.effective_at, superseded_at = excluded.superseded_at, terms = excluded.terms;

  delete from policy_version_items where policy_version_id in (v_ver1, v_ver2);
  insert into policy_version_items (tenant_id, data_category, policy_version_id, insured_item_id, item_terms) values
    (v_tenant, 'sample', v_ver1, v_item_old, '{"role":"vehicle"}'::jsonb),
    (v_tenant, 'sample', v_ver1, v_item_contents, '{"role":"contents"}'::jsonb),
    (v_tenant, 'sample', v_ver2, v_item_new, '{"role":"vehicle"}'::jsonb),
    (v_tenant, 'sample', v_ver2, v_item_contents, '{"role":"contents"}'::jsonb);

  insert into policy_service_requests (
    id, tenant_id, data_category, person_id, policy_id, insured_item_id, request_type, status,
    next_action, requested_effective_at, confirmed_effective_at, confirmation_source, insurer_reference,
    requested_change, current_snapshot
  ) values (
    v_psr, v_tenant, 'sample', v_person.id, v_policy, v_item_old, 'vehicle_replacement', 'confirmed',
    null, '2025-11-15 09:00:00+02', '2025-11-15 09:00:00+02', 'insurer_email', 'PROT-END-8891',
    '{"replacement":{"make":"Hyundai","model":"Tucson","year":2024,"registration":"CY 987-654"}}'::jsonb,
    '{"item_id":"c1111111-0000-4000-8000-00000000a010","label":"2019 Toyota Corolla CA 123-456"}'::jsonb
  ) on conflict (id) do update set status = 'confirmed';

  update policy_service_requests set reference = coalesce(reference, app.next_number(v_tenant, 'service_request', 'sample'))
  where id = v_psr and reference is null;

  insert into policy_endorsements (tenant_id, data_category, policy_id, service_request_id, from_version_id, to_version_id, confirmation_source, confirmed_effective_at, insurer_reference)
  select v_tenant, 'sample', v_policy, v_psr, v_ver1, v_ver2, 'insurer_email', '2025-11-15 09:00:00+02', 'PROT-END-8891'
  where not exists (select 1 from policy_endorsements where service_request_id = v_psr);

  insert into claims (
    id, tenant_id, data_category, person_id, policy_id, policy_version_id, original_policy_version_id,
    version_review_needed, incident_at, incident_time_unknown, incident_type, description, status,
    next_action, insurer_reference, submission_channel, submitted_at, decision, decision_source, settlement_amount
  ) values (
    v_claim1, v_tenant, 'sample', v_person.id, v_policy, v_ver1, v_ver1, false,
    '2025-11-12 14:30:00+02', false, 'motor_accident',
    'Rear-ended at traffic lights on Main Road. Other driver admitted fault. Photos taken at scene.',
    'under_assessment', 'Await insurer assessor report', 'PROT-CLM-4412', 'email', '2025-11-13 10:00:00+02',
    null, null, null
  ) on conflict (id) do update set policy_version_id = excluded.policy_version_id, status = excluded.status;

  insert into claims (
    id, tenant_id, data_category, person_id, policy_id, policy_version_id, original_policy_version_id,
    version_review_needed, incident_at, incident_time_unknown, incident_type, description, status, next_action
  ) values (
    v_claim2, v_tenant, 'sample', v_person.id, v_policy, v_ver2, v_ver2, false,
    '2025-11-17 09:00:00+02', true, 'storm_hail',
    'Hail damage to new Tucson windscreen and bonnet after overnight storm. Photos still to be uploaded.',
    'awaiting_evidence', 'Customer to upload photos'
  ) on conflict (id) do update set status = excluded.status;

  update claims set reference = coalesce(reference, app.next_number(v_tenant, 'claim', 'sample')) where id in (v_claim1, v_claim2) and reference is null;

  delete from claim_affected_items where claim_id in (v_claim1, v_claim2);
  insert into claim_affected_items (tenant_id, data_category, claim_id, insured_item_id, display_label, item_type, snapshot) values
    (v_tenant, 'sample', v_claim1, v_item_old, '2019 Toyota Corolla CA 123-456', 'vehicle', '{"make":"Toyota","model":"Corolla"}'::jsonb),
    (v_tenant, 'sample', v_claim2, v_item_new, '2024 Hyundai Tucson CY 987-654', 'vehicle', '{"make":"Hyundai","model":"Tucson"}'::jsonb);

  delete from claim_evidence_requirements where claim_id in (v_claim1, v_claim2);
  insert into claim_evidence_requirements (tenant_id, data_category, claim_id, label, status) values
    (v_tenant, 'sample', v_claim1, 'Photos of damage', 'received'),
    (v_tenant, 'sample', v_claim1, 'Driver statement', 'received'),
    (v_tenant, 'sample', v_claim1, 'Police / case number (if applicable)', 'waived'),
    (v_tenant, 'sample', v_claim2, 'Photos of damage', 'outstanding'),
    (v_tenant, 'sample', v_claim2, 'Driver statement', 'outstanding');

  insert into claim_events (tenant_id, data_category, claim_id, event_type, to_status, note, visibility)
  select v_tenant, 'sample', v_claim1, 'created', 'reported', 'Sample incident 12 Nov — linked to pre-replacement vehicle', 'shared'
  where not exists (select 1 from claim_events where claim_id = v_claim1 and event_type = 'created');
  insert into claim_events (tenant_id, data_category, claim_id, event_type, from_status, to_status, note, visibility, payload)
  select v_tenant, 'sample', v_claim1, 'insurer_submission', 'in_review', 'submitted_to_insurer', 'Manual email submission', 'shared',
    '{"channel":"email","insurer_reference":"PROT-CLM-4412"}'::jsonb
  where not exists (select 1 from claim_events where claim_id = v_claim1 and event_type = 'insurer_submission');

  insert into claim_events (tenant_id, data_category, claim_id, event_type, to_status, note, visibility)
  select v_tenant, 'sample', v_claim2, 'created', 'awaiting_evidence', 'Sample claim with photos outstanding', 'shared'
  where not exists (select 1 from claim_events where claim_id = v_claim2 and event_type = 'created');
end $$;
