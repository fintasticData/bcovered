-- Distinct Oct/Nov motor excesses, 1 Nov boundary claim, schedule-review claim,
-- and claim/policy detail payloads for as-of excess + schedule preview.

-- ------------------------------------------------------------------ Seed
do $$
declare
  v_person persons%rowtype;
  v_tenant uuid;
  v_policy uuid := 'c1111111-0000-4000-8000-00000000a001';
  v_item_old uuid := 'c1111111-0000-4000-8000-00000000a010';
  v_item_new uuid := 'c1111111-0000-4000-8000-00000000a011';
  v_ver1 uuid := 'c1111111-0000-4000-8000-00000000a020';
  v_ver2 uuid := 'c1111111-0000-4000-8000-00000000a021';
  v_claim1 uuid := 'c1111111-0000-4000-8000-00000000a030';
  v_claim2 uuid := 'c1111111-0000-4000-8000-00000000a031';
  v_claim_review uuid := 'c1111111-0000-4000-8000-00000000a033';
  v_existing uuid;
begin
  select * into v_person from persons
   where client_number = 'CL-S1001' and data_category = 'sample'
   order by case when id = 'c0000000-0000-4000-8000-000000000001' then 0 else 1 end
   limit 1;
  if not found then
    raise notice 'CL-S1001 missing — skipping motor walkthrough excess seed';
    return;
  end if;
  v_tenant := v_person.tenant_id;

  select id into v_existing from policies
   where tenant_id = v_tenant and data_category = 'sample'
     and policy_number = 'PRO-MV-220145' limit 1;
  if v_existing is not null then v_policy := v_existing; end if;

  -- Distinct excesses: Oct R5 000 · from 1 Nov R7 500
  update policy_versions set
    terms = coalesce(terms, '{}'::jsonb) || jsonb_build_object(
      'premium', 850, 'excess', 5000, 'sum_insured', 280000, 'schedule', 'Comprehensive motor'
    )
  where id = v_ver1 and tenant_id = v_tenant;

  update policy_versions set
    terms = coalesce(terms, '{}'::jsonb) || jsonb_build_object(
      'premium', 920, 'excess', 7500, 'sum_insured', 420000, 'schedule', 'Vehicle replacement endorsement'
    )
  where id = v_ver2 and tenant_id = v_tenant;

  update policy_version_items set
    item_terms = coalesce(item_terms, '{}'::jsonb) || jsonb_build_object('section', 'vehicle', 'excess', 5000)
  where policy_version_id = v_ver1 and insured_item_id = v_item_old;

  update policy_version_items set
    item_terms = coalesce(item_terms, '{}'::jsonb) || jsonb_build_object('section', 'vehicle', 'excess', 7500)
  where policy_version_id = v_ver2 and insured_item_id = v_item_new;

  -- Claim1: 28 Oct → Corolla / Oct excess (v1)
  update claims set
    incident_at = '2025-10-28 14:30:00+02',
    policy_version_id = v_ver1,
    original_policy_version_id = v_ver1,
    version_review_needed = false,
    version_review_reason = null,
    description = 'Rear-end collision while parked — loss date 28 Oct (pre-replacement schedule).'
  where id = v_claim1 and tenant_id = v_tenant;

  delete from claim_affected_items where claim_id = v_claim1;
  insert into claim_affected_items (
    tenant_id, data_category, claim_id, insured_item_id, display_label, item_type, snapshot, section_code, policy_version_id
  )
  select v_tenant, 'sample', v_claim1, ii.id, ii.display_label, ii.item_type, ii.details, 'vehicle', v_ver1
  from insured_items ii where ii.id = v_item_old;

  -- Claim2: 1 Nov boundary → Tucson / Nov excess (v2)
  update claims set
    incident_at = '2025-11-01 09:00:00+02',
    incident_time_unknown = false,
    incident_type = 'motor_accident',
    policy_id = v_policy,
    policy_version_id = v_ver2,
    original_policy_version_id = v_ver2,
    version_review_needed = false,
    version_review_reason = null,
    description = '1 Nov boundary claim — loss on replacement effective date; Tucson and R7 500 excess apply.',
    status = 'awaiting_evidence',
    next_action = 'Customer to upload photos'
  where id = v_claim2 and tenant_id = v_tenant;

  -- Ensure claim2 exists if 0040 seed never created it
  if not exists (select 1 from claims where id = v_claim2) then
    insert into claims (
      id, tenant_id, data_category, person_id, policy_id, policy_version_id, original_policy_version_id,
      version_review_needed, incident_at, incident_time_unknown, incident_type, description, status, next_action
    ) values (
      v_claim2, v_tenant, 'sample', v_person.id, v_policy, v_ver2, v_ver2, false,
      '2025-11-01 09:00:00+02', false, 'motor_accident',
      '1 Nov boundary claim — loss on replacement effective date; Tucson and R7 500 excess apply.',
      'awaiting_evidence', 'Customer to upload photos'
    );
    update claims set reference = coalesce(reference, app.next_number(v_tenant, 'claim', 'sample'))
    where id = v_claim2 and reference is null;
  end if;

  delete from claim_affected_items where claim_id = v_claim2;
  insert into claim_affected_items (
    tenant_id, data_category, claim_id, insured_item_id, display_label, item_type, snapshot, section_code, policy_version_id
  )
  select v_tenant, 'sample', v_claim2, ii.id, ii.display_label, ii.item_type, ii.details, 'vehicle', v_ver2
  from insured_items ii where ii.id = v_item_new;

  -- Claim3: missing historical schedule → intake allowed, excess unresolved
  insert into claims (
    id, tenant_id, data_category, person_id, policy_id, policy_version_id, original_policy_version_id,
    version_review_needed, version_review_reason, incident_at, incident_time_unknown, incident_type,
    description, status, next_action
  ) values (
    v_claim_review, v_tenant, 'sample', v_person.id, v_policy, null, null,
    true, 'Schedule review required',
    '2025-09-20 11:00:00+02', false, 'motor_accident',
    'Sample intake before first recorded schedule — broker must link applicable cover; excess unresolved.',
    'in_review', 'Review schedule on loss date'
  )
  on conflict (id) do update set
    policy_id = excluded.policy_id,
    policy_version_id = null,
    original_policy_version_id = null,
    version_review_needed = true,
    version_review_reason = 'Schedule review required',
    incident_at = excluded.incident_at,
    description = excluded.description,
    status = 'in_review',
    next_action = 'Review schedule on loss date';

  update claims set reference = coalesce(reference, app.next_number(v_tenant, 'claim', 'sample'))
  where id = v_claim_review and reference is null;

  delete from claim_affected_items where claim_id = v_claim_review;
  insert into claim_affected_items (
    tenant_id, data_category, claim_id, insured_item_id, display_label, item_type, snapshot, section_code, policy_version_id
  )
  select v_tenant, 'sample', v_claim_review, ii.id, ii.display_label, ii.item_type, ii.details, 'vehicle', null
  from insured_items ii where ii.id = v_item_old;

  insert into claim_events (tenant_id, data_category, claim_id, event_type, to_status, note, visibility)
  select v_tenant, 'sample', v_claim_review, 'created', 'in_review',
    'Sample schedule-review intake — no version as of 20 Sep', 'shared'
  where not exists (
    select 1 from claim_events where claim_id = v_claim_review and event_type = 'created'
  );
end $$;

-- ------------------------------------------------------------------ pc_claim_detail (as-of excess + schedule window)
create or replace function public.pc_claim_detail(p_claim_id uuid, p_category text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cat text := coalesce(p_category, app.active_category());
declare c claims%rowtype;
declare paid numeric;
declare recoveries numeric;
declare as_of_excess numeric;
declare sched_from timestamptz;
declare sched_to timestamptz;
begin
  perform app.pc_require_staff();
  select * into c from claims where id = p_claim_id and data_category = cat and tenant_id = app.tenant_id();
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if app.book_restricted() and not app.can_see_person(c.person_id) then raise exception 'forbidden' using errcode = '42501'; end if;

  select coalesce(sum(case when txn_type = 'payment' and status = 'confirmed' then amount
                           when txn_type = 'reversal' and status = 'confirmed' then -amount else 0 end), 0),
         coalesce(sum(case when txn_type = 'recovery' and status = 'confirmed' then amount else 0 end), 0)
    into paid, recoveries
  from claim_transactions where claim_id = c.id and data_category = cat;

  if c.policy_version_id is not null then
    select (terms->>'excess')::numeric, effective_at, superseded_at
      into as_of_excess, sched_from, sched_to
    from policy_versions where id = c.policy_version_id;
  end if;

  return jsonb_build_object(
    'id', c.id, 'reference', c.reference, 'client_number', (select client_number from persons where id = c.person_id),
    'customer_name', app.pc_person_name(c.person_id), 'person_id', c.person_id,
    'incident_type', c.incident_type, 'incident_at', c.incident_at, 'incident_time_unknown', c.incident_time_unknown,
    'description', c.description, 'status', c.status,
    'owner_name', (select full_name from sales_team_members where id = c.owner_member_id),
    'next_action', c.next_action, 'due_at', c.due_at, 'version_review_needed', c.version_review_needed,
    'version_review_reason', c.version_review_reason, 'policy_id', c.policy_id, 'policy_version_id', c.policy_version_id,
    'as_of_excess', as_of_excess,
    'schedule_effective_at', sched_from,
    'schedule_superseded_at', sched_to,
    'insurer_name', (select i.name from policies pol join insurers i on i.id = pol.provider_id where pol.id = c.policy_id),
    'insurer_reference', c.insurer_reference, 'submitted_at', c.submitted_at,
    'decision', c.decision, 'decision_source', c.decision_source, 'settlement_amount', c.settlement_amount,
    'approved_settlement', coalesce(c.settlement_amount, 0),
    'confirmed_payments', paid,
    'outstanding', greatest(coalesce(c.settlement_amount, 0) - paid, 0),
    'recoveries', recoveries,
    'affected_items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'display_label', a.display_label, 'item_type', a.item_type, 'status', 'covered',
        'details', a.snapshot, 'section_code', a.section_code, 'policy_version_id', a.policy_version_id
      ))
      from claim_affected_items a where a.claim_id = c.id
    ), '[]'::jsonb),
    'settlement_transactions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'txn_type', t.txn_type, 'payee', t.payee, 'amount', t.amount,
        'status', t.status, 'txn_date', t.txn_date, 'reference', t.reference
      ) order by t.txn_date, t.created_at)
      from claim_transactions t where t.claim_id = c.id
    ), '[]'::jsonb),
    'evidence', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'label', e.label, 'status', e.status))
      from claim_evidence_requirements e where e.claim_id = c.id
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'event_type', e.event_type, 'from_status', e.from_status, 'to_status', e.to_status, 'note', e.note, 'created_at', e.created_at, 'visibility', e.visibility) order by e.created_at)
      from claim_events e where e.claim_id = c.id
    ), '[]'::jsonb)
  );
end $$;

-- ------------------------------------------------------------------ pc_policy_detail (versions carry terms + items for loss-date preview)
create or replace function public.pc_policy_detail(p_policy_id uuid, p_category text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cat text := coalesce(p_category, app.active_category());
declare pc policy_cover%rowtype;
declare pol policies%rowtype;
declare cur policy_versions%rowtype;
declare schedule_required boolean := false;
begin
  perform app.pc_require_staff();
  select * into pc from policy_cover where policy_id = p_policy_id and data_category = cat and tenant_id = app.tenant_id();
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if app.book_restricted() and not app.can_see_person(pc.person_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into pol from policies where id = p_policy_id;
  select * into cur from policy_versions where policy_id = p_policy_id and superseded_at is null order by version_no desc limit 1;
  schedule_required := cur.id is null or not exists (
    select 1 from policy_version_items pvi where pvi.policy_version_id = cur.id
  );
  return jsonb_build_object(
    'policy_id', pol.id,
    'person_id', pc.person_id,
    'client_number', (select client_number from persons where id = pc.person_id),
    'customer_name', app.pc_person_name(pc.person_id),
    'insurer_name', (select name from insurers where id = pol.provider_id),
    'policy_number', pol.policy_number,
    'reference', pol.reference,
    'status', pol.status,
    'inception_date', pol.inception_date,
    'premium_amount', pol.premium_amount,
    'premium_frequency', pol.premium_frequency,
    'cover_type', pol.cover_type,
    'schedule_required', schedule_required,
    'next_action', case when schedule_required then 'Schedule required' else null end,
    'current_version', case when cur.id is null then null else jsonb_build_object(
      'id', cur.id, 'version_no', cur.version_no, 'effective_at', cur.effective_at, 'terms', cur.terms
    ) end,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ii.id, 'item_type', ii.item_type, 'status', ii.status,
        'display_label', ii.display_label, 'details', ii.details,
        'item_terms', pvi.item_terms
      ))
      from policy_version_items pvi join insured_items ii on ii.id = pvi.insured_item_id
      where cur.id is not null and pvi.policy_version_id = cur.id
    ), '[]'::jsonb),
    'versions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', v.id,
        'version_no', v.version_no,
        'effective_at', v.effective_at,
        'superseded_at', v.superseded_at,
        'terms', v.terms,
        'items', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', ii.id, 'display_label', ii.display_label, 'item_type', ii.item_type, 'item_terms', pvi.item_terms
          ))
          from policy_version_items pvi
          join insured_items ii on ii.id = pvi.insured_item_id
          where pvi.policy_version_id = v.id
        ), '[]'::jsonb)
      ) order by v.version_no)
      from policy_versions v where v.policy_id = pol.id
    ), '[]'::jsonb),
    'premium_rates', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'amount', r.amount, 'frequency', r.frequency, 'effective_from', r.effective_from,
        'effective_to', r.effective_to, 'source', r.source, 'reason', r.reason, 'status', r.status,
        'included_in_policy', r.included_in_policy, 'breakdown_available', r.breakdown_available,
        'section_code', r.section_code
      ) order by r.effective_from)
      from policy_premium_rates r where r.policy_id = pol.id and r.data_category = cat
    ), '[]'::jsonb),
    'transactions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'txn_type', t.txn_type, 'amount', t.amount, 'txn_date', t.txn_date,
        'reference', t.reference, 'source', t.source, 'reconciliation_status', t.reconciliation_status
      ) order by t.txn_date, t.created_at)
      from policy_transactions t where t.policy_id = pol.id and t.data_category = cat
    ), '[]'::jsonb),
    'open_requests', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'reference', r.reference, 'status', r.status))
      from policy_service_requests r where r.policy_id = pol.id and r.status not in ('confirmed','declined','withdrawn')
    ), '[]'::jsonb),
    'related_claims', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'reference', c.reference, 'status', c.status))
      from claims c where c.policy_id = pol.id
    ), '[]'::jsonb)
  );
end $$;
