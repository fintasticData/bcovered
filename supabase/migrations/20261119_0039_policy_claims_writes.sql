-- Policy & Claims write RPCs (vehicle replacement, claims, Russ) + sample seed.

create or replace function public.pc_create_vehicle_replacement(
  p_person_id uuid, p_policy_id uuid, p_item_id uuid, p_requested_effective_at timestamptz,
  p_replacement jsonb, p_notes text default null, p_idempotency_key text default null, p_category text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare cat text := coalesce(p_category, app.active_category());
declare r policy_service_requests%rowtype;
declare existing uuid;
declare snap jsonb;
declare label text;
begin
  perform app.pc_require_staff();
  if app.book_restricted() and not app.can_see_person(p_person_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_idempotency_key is not null then
    select request_id into existing from policy_service_request_events where idempotency_key = p_idempotency_key limit 1;
    if existing is not null then
      select * into r from policy_service_requests where id = existing;
      return jsonb_build_object('outcome','saved','request_id', r.id, 'reference', r.reference, 'summary', 'Replayed vehicle replacement request', 'replayed', true);
    end if;
  end if;
  select display_label into label from insured_items where id = p_item_id;
  select jsonb_build_object('item_id', ii.id, 'label', ii.display_label, 'details', ii.details)
    into snap from insured_items ii where ii.id = p_item_id;
  insert into policy_service_requests (
    tenant_id, data_category, person_id, policy_id, insured_item_id, request_type, status,
    owner_member_id, next_action, due_at, requested_effective_at, requested_change, current_snapshot, created_by
  ) values (
    app.tenant_id(), cat, p_person_id, p_policy_id, p_item_id, 'vehicle_replacement', 'requested',
    app.my_member_id(), 'Broker review', now() + interval '2 days', p_requested_effective_at,
    jsonb_build_object('replacement', p_replacement, 'notes', p_notes), snap, auth.uid()
  ) returning * into r;
  insert into policy_service_request_events (tenant_id, data_category, request_id, event_type, to_status, actor_user_id, note, idempotency_key)
  values (app.tenant_id(), cat, r.id, 'created', 'requested', auth.uid(), coalesce(p_notes, 'Vehicle replacement requested'), p_idempotency_key);
  return jsonb_build_object('outcome','saved','request_id', r.id, 'reference', r.reference, 'summary', 'Vehicle replacement '||r.reference||' created');
end $$;

create or replace function public.pc_transition_service_request(
  p_request_id uuid, p_to_status text, p_note text default null, p_idempotency_key text default null, p_category text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare cat text := coalesce(p_category, app.active_category());
declare r policy_service_requests%rowtype;
declare next_act text;
begin
  perform app.pc_require_staff();
  select * into r from policy_service_requests where id = p_request_id and data_category = cat and tenant_id = app.tenant_id();
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if app.book_restricted() and not app.can_see_person(r.person_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_idempotency_key is not null and exists (select 1 from policy_service_request_events where request_id = r.id and idempotency_key = p_idempotency_key) then
    return jsonb_build_object('outcome','saved','summary','Replayed transition','replayed', true);
  end if;
  next_act := case p_to_status
    when 'in_review' then 'Review proposed change'
    when 'awaiting_customer' then 'Customer to provide missing details'
    when 'awaiting_confirmation' then 'Await insurer confirmation'
    when 'declined' then null when 'withdrawn' then null else r.next_action end;
  update policy_service_requests set status = p_to_status, next_action = next_act, updated_at = now(),
    outcome_reason = case when p_to_status in ('declined','withdrawn') then p_note else outcome_reason end
  where id = r.id;
  insert into policy_service_request_events (tenant_id, data_category, request_id, event_type, from_status, to_status, actor_user_id, note, idempotency_key)
  values (app.tenant_id(), cat, r.id, 'status_change', r.status, p_to_status, auth.uid(), p_note, p_idempotency_key);
  return jsonb_build_object('outcome','saved','summary','Status set to '||p_to_status);
end $$;

create or replace function public.pc_confirm_vehicle_replacement(
  p_request_id uuid, p_confirmed_effective_at timestamptz, p_confirmation_source text,
  p_insurer_reference text default null, p_revised_premium numeric default null,
  p_idempotency_key text default null, p_category text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare cat text := coalesce(p_category, app.active_category());
declare r policy_service_requests%rowtype;
declare old_v policy_versions%rowtype;
declare new_v policy_versions%rowtype;
declare new_item insured_items%rowtype;
declare repl jsonb;
declare flagged int := 0;
begin
  perform app.pc_require_staff();
  select * into r from policy_service_requests where id = p_request_id and data_category = cat and tenant_id = app.tenant_id();
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if app.book_restricted() and not app.can_see_person(r.person_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_idempotency_key is not null and exists (
    select 1 from policy_service_request_events where request_id = r.id and idempotency_key = p_idempotency_key and event_type = 'confirmed'
  ) then
    return jsonb_build_object('outcome','saved','summary','Confirmation already recorded','replayed', true);
  end if;
  if r.status = 'confirmed' then
    return jsonb_build_object('outcome','saved','summary','Already confirmed','replayed', true);
  end if;
  select * into old_v from policy_versions where policy_id = r.policy_id and superseded_at is null order by version_no desc limit 1;
  repl := r.requested_change->'replacement';
  insert into insured_items (tenant_id, data_category, person_id, item_type, status, display_label, details)
  values (
    app.tenant_id(), cat, r.person_id, 'vehicle',
    case when p_confirmed_effective_at <= now() then 'covered' else 'awaiting_cover' end,
    coalesce(repl->>'make','') || ' ' || coalesce(repl->>'model','') || coalesce(' '||(repl->>'registration'),''),
    repl
  ) returning * into new_item;
  if p_confirmed_effective_at <= now() then
    update insured_items set status = 'replaced', updated_at = now() where id = r.insured_item_id;
  end if;
  update policy_versions set superseded_at = p_confirmed_effective_at where id = old_v.id;
  insert into policy_versions (tenant_id, data_category, policy_id, version_no, entered_at, effective_at, terms, created_by)
  values (
    app.tenant_id(), cat, r.policy_id, coalesce(old_v.version_no,0)+1, now(), p_confirmed_effective_at,
    jsonb_build_object(
      'premium', coalesce(p_revised_premium, (old_v.terms->>'premium')::numeric),
      'excess', old_v.terms->'excess',
      'sum_insured', old_v.terms->'sum_insured',
      'schedule', 'Vehicle replacement endorsement'
    ), auth.uid()
  ) returning * into new_v;
  insert into policy_version_items (tenant_id, data_category, policy_version_id, insured_item_id, item_terms)
  select app.tenant_id(), cat, new_v.id, pvi.insured_item_id, pvi.item_terms
  from policy_version_items pvi where pvi.policy_version_id = old_v.id and pvi.insured_item_id <> r.insured_item_id;
  insert into policy_version_items (tenant_id, data_category, policy_version_id, insured_item_id, item_terms)
  values (app.tenant_id(), cat, new_v.id, new_item.id, repl);
  insert into policy_endorsements (tenant_id, data_category, policy_id, service_request_id, from_version_id, to_version_id, confirmation_source, confirmed_effective_at, insurer_reference)
  values (app.tenant_id(), cat, r.policy_id, r.id, old_v.id, new_v.id, p_confirmation_source, p_confirmed_effective_at, p_insurer_reference);
  update policy_service_requests set status = 'confirmed', confirmed_effective_at = p_confirmed_effective_at,
    confirmation_source = p_confirmation_source, insurer_reference = p_insurer_reference, next_action = null, updated_at = now()
  where id = r.id;
  insert into policy_service_request_events (tenant_id, data_category, request_id, event_type, from_status, to_status, actor_user_id, note, idempotency_key, payload)
  values (app.tenant_id(), cat, r.id, 'confirmed', r.status, 'confirmed', auth.uid(), 'Cover confirmation from '||p_confirmation_source, p_idempotency_key,
    jsonb_build_object('version_id', new_v.id, 'source', p_confirmation_source));
  -- Flag claims whose as-of link may be affected by backdated confirmation
  update claims set version_review_needed = true,
    version_review_reason = coalesce(version_review_reason||' ','') || 'Policy history changed by backdated confirmation on '||r.reference,
    updated_at = now()
  where policy_id = r.policy_id and incident_at >= p_confirmed_effective_at and status not in ('closed')
    and (policy_version_id is distinct from new_v.id);
  get diagnostics flagged = row_count;
  return jsonb_build_object('outcome','saved','summary','Confirmed replacement; version '||new_v.version_no||' created'||case when flagged>0 then '; '||flagged||' claim(s) flagged' else '' end, 'version_id', new_v.id);
end $$;

create or replace function public.pc_resolve_policy_version(p_policy_id uuid, p_incident_at timestamptz, p_time_unknown boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v policy_versions%rowtype;
declare cnt int;
declare day_start timestamptz := date_trunc('day', p_incident_at);
declare day_end timestamptz := day_start + interval '1 day';
begin
  select count(*) into cnt from policy_versions
   where policy_id = p_policy_id and effective_at >= day_start and effective_at < day_end;
  if p_time_unknown and cnt > 0 then
    return jsonb_build_object('version_id', null, 'review_needed', true,
      'reason', 'Incident time missing and cover changed on the same day — broker must link the applicable policy version.');
  end if;
  select * into v from policy_versions
   where policy_id = p_policy_id and effective_at <= p_incident_at
     and (superseded_at is null or superseded_at > p_incident_at)
   order by effective_at desc limit 1;
  if not found then
    return jsonb_build_object('version_id', null, 'review_needed', true, 'reason', 'No policy version found as of the incident date/time.');
  end if;
  return jsonb_build_object('version_id', v.id, 'review_needed', false, 'reason', null);
end $$;

create or replace function public.pc_create_claim(
  p_person_id uuid, p_policy_id uuid, p_incident_at timestamptz, p_incident_time_unknown boolean,
  p_incident_type text, p_description text, p_item_ids uuid[], p_idempotency_key text default null, p_category text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare cat text := coalesce(p_category, app.active_category());
declare c claims%rowtype;
declare resolved jsonb;
declare vid uuid;
declare review bool := false;
declare reason text;
declare item_id uuid;
begin
  perform app.pc_require_staff();
  if app.book_restricted() and not app.can_see_person(p_person_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_idempotency_key is not null then
    select claim_id into vid from claim_events where idempotency_key = p_idempotency_key limit 1;
    if vid is not null then
      select * into c from claims where id = vid;
      return jsonb_build_object('outcome','saved','claim_id', c.id, 'reference', c.reference, 'summary', 'Replayed claim', 'replayed', true, 'version_review_needed', c.version_review_needed);
    end if;
  end if;
  if p_policy_id is not null then
    resolved := public.pc_resolve_policy_version(p_policy_id, p_incident_at, p_incident_time_unknown);
    vid := (resolved->>'version_id')::uuid;
    review := coalesce((resolved->>'review_needed')::boolean, false);
    reason := resolved->>'reason';
  end if;
  insert into claims (
    tenant_id, data_category, person_id, policy_id, policy_version_id, original_policy_version_id,
    version_review_needed, version_review_reason, incident_at, incident_time_unknown, incident_type, description,
    status, owner_member_id, next_action, due_at, created_by
  ) values (
    app.tenant_id(), cat, p_person_id, p_policy_id, vid, vid, review, reason, p_incident_at, p_incident_time_unknown,
    p_incident_type, p_description, case when review then 'in_review' else 'reported' end,
    app.my_member_id(),
    case when review then 'Link applicable policy version' else 'Review incident and evidence' end,
    now() + interval '3 days', auth.uid()
  ) returning * into c;
  foreach item_id in array coalesce(p_item_ids, array[]::uuid[]) loop
    insert into claim_affected_items (tenant_id, data_category, claim_id, insured_item_id, display_label, item_type, snapshot)
    select app.tenant_id(), cat, c.id, ii.id, ii.display_label, ii.item_type, ii.details from insured_items ii where ii.id = item_id;
  end loop;
  insert into claim_evidence_requirements (tenant_id, data_category, claim_id, label, status) values
    (app.tenant_id(), cat, c.id, 'Photos of damage', 'outstanding'),
    (app.tenant_id(), cat, c.id, 'Driver statement', 'outstanding'),
    (app.tenant_id(), cat, c.id, 'Police / case number (if applicable)', 'outstanding');
  insert into claim_events (tenant_id, data_category, claim_id, event_type, to_status, actor_user_id, note, visibility, idempotency_key)
  values (app.tenant_id(), cat, c.id, 'created', c.status, auth.uid(), 'Incident reported to B-Covered', 'shared', p_idempotency_key);
  return jsonb_build_object('outcome','saved','claim_id', c.id, 'reference', c.reference,
    'summary', 'Claim '||c.reference||' created', 'version_review_needed', review);
end $$;

create or replace function public.pc_transition_claim(
  p_claim_id uuid, p_to_status text, p_note text default null, p_idempotency_key text default null, p_category text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare cat text := coalesce(p_category, app.active_category());
declare c claims%rowtype;
begin
  perform app.pc_require_staff();
  select * into c from claims where id = p_claim_id and data_category = cat and tenant_id = app.tenant_id();
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if app.book_restricted() and not app.can_see_person(c.person_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_idempotency_key is not null and exists (select 1 from claim_events where claim_id = c.id and idempotency_key = p_idempotency_key) then
    return jsonb_build_object('outcome','saved','summary','Replayed','replayed', true);
  end if;
  update claims set status = p_to_status, next_action = case p_to_status
    when 'in_review' then 'Review evidence'
    when 'awaiting_evidence' then 'Customer to upload outstanding evidence'
    when 'submitted_to_insurer' then 'Record insurer reference when received'
    when 'awaiting_insurer_update' then 'Follow up with insurer'
    when 'under_assessment' then 'Monitor insurer assessment'
    else next_action end, updated_at = now() where id = c.id;
  insert into claim_events (tenant_id, data_category, claim_id, event_type, from_status, to_status, actor_user_id, note, visibility, idempotency_key)
  values (app.tenant_id(), cat, c.id, 'status_change', c.status, p_to_status, auth.uid(), p_note, 'internal', p_idempotency_key);
  return jsonb_build_object('outcome','saved','summary','Claim status set to '||p_to_status);
end $$;

create or replace function public.pc_record_claim_submission(
  p_claim_id uuid, p_channel text, p_insurer_reference text, p_submitted_at timestamptz,
  p_idempotency_key text default null, p_category text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare cat text := coalesce(p_category, app.active_category());
declare c claims%rowtype;
begin
  perform app.pc_require_staff();
  select * into c from claims where id = p_claim_id and data_category = cat and tenant_id = app.tenant_id();
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_idempotency_key is not null and exists (select 1 from claim_events where claim_id = c.id and idempotency_key = p_idempotency_key and event_type = 'insurer_submission') then
    return jsonb_build_object('outcome','saved','summary','Submission already recorded','replayed', true);
  end if;
  if c.submitted_at is not null then
    return jsonb_build_object('outcome','saved','summary','Submission already recorded','replayed', true);
  end if;
  update claims set submitted_at = p_submitted_at, submission_channel = p_channel,
    insurer_reference = coalesce(p_insurer_reference, insurer_reference),
    status = 'submitted_to_insurer', next_action = 'Await insurer update', updated_at = now()
  where id = c.id;
  insert into claim_events (tenant_id, data_category, claim_id, event_type, from_status, to_status, actor_user_id, note, visibility, idempotency_key, payload)
  values (app.tenant_id(), cat, c.id, 'insurer_submission', c.status, 'submitted_to_insurer', auth.uid(),
    'Manual submission via '||p_channel, 'shared', p_idempotency_key,
    jsonb_build_object('channel', p_channel, 'insurer_reference', p_insurer_reference, 'submitted_at', p_submitted_at));
  return jsonb_build_object('outcome','saved','summary','Insurer submission recorded');
end $$;

create or replace function public.pc_record_claim_decision(
  p_claim_id uuid, p_decision text, p_decision_source text, p_settlement_amount numeric default null,
  p_closure_reason text default null, p_idempotency_key text default null, p_category text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare cat text := coalesce(p_category, app.active_category());
declare c claims%rowtype;
begin
  perform app.pc_require_staff();
  select * into c from claims where id = p_claim_id and data_category = cat and tenant_id = app.tenant_id();
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_idempotency_key is not null and exists (select 1 from claim_events where claim_id = c.id and idempotency_key = p_idempotency_key and event_type = 'decision') then
    return jsonb_build_object('outcome','saved','summary','Decision already recorded','replayed', true);
  end if;
  if c.decision is not null and c.status = 'closed' then
    return jsonb_build_object('outcome','saved','summary','Decision already recorded','replayed', true);
  end if;
  update claims set decision = p_decision, decision_source = p_decision_source, settlement_amount = p_settlement_amount,
    closure_reason = p_closure_reason, status = 'closed', next_action = null, updated_at = now()
  where id = c.id;
  insert into claim_events (tenant_id, data_category, claim_id, event_type, from_status, to_status, actor_user_id, note, visibility, idempotency_key, payload)
  values (app.tenant_id(), cat, c.id, 'decision', c.status, 'closed', auth.uid(),
    'Decision from '||p_decision_source||': '||p_decision, 'shared', p_idempotency_key,
    jsonb_build_object('decision', p_decision, 'source', p_decision_source, 'settlement_amount', p_settlement_amount));
  return jsonb_build_object('outcome','saved','summary','Decision recorded and claim closed');
end $$;

create or replace function public.pc_russ_prepare_endorsement(p_request_id uuid, p_approve boolean, p_idempotency_key text default null, p_category text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cat text := coalesce(p_category, app.active_category());
declare r policy_service_requests%rowtype;
declare draft text;
begin
  perform app.pc_require_staff();
  select * into r from policy_service_requests where id = p_request_id and data_category = cat;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  draft := 'Endorsement request for '||r.reference||E'\nClient: '||app.pc_person_name(r.person_id)||E'\nRequested change: '||(r.requested_change::text)||E'\nPlease confirm cover change effective '||coalesce(r.requested_effective_at::text,'TBD')||'.';
  if p_approve then
    insert into policy_service_request_events (tenant_id, data_category, request_id, event_type, actor_user_id, note, idempotency_key, payload)
    values (app.tenant_id(), cat, r.id, 'russ_endorsement_draft', auth.uid(), 'Russ endorsement request approved', p_idempotency_key, jsonb_build_object('draft', draft))
    on conflict do nothing;
  end if;
  return jsonb_build_object('outcome', case when p_approve then 'saved' else 'needs_input' end, 'draft', draft, 'summary', case when p_approve then 'Endorsement draft recorded on case' else 'Review draft before approving' end);
end $$;

create or replace function public.pc_russ_check_evidence(p_claim_id uuid, p_approve boolean, p_idempotency_key text default null, p_category text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cat text := coalesce(p_category, app.active_category());
declare missing text[];
declare draft text;
begin
  perform app.pc_require_staff();
  select coalesce(array_agg(label), array[]::text[]) into missing from claim_evidence_requirements where claim_id = p_claim_id and status = 'outstanding';
  draft := 'Missing evidence for claim: '||array_to_string(missing, ', ');
  if p_approve then
    insert into claim_events (tenant_id, data_category, claim_id, event_type, actor_user_id, note, visibility, idempotency_key, payload)
    values (app.tenant_id(), cat, p_claim_id, 'russ_evidence_check', auth.uid(), draft, 'internal', p_idempotency_key, jsonb_build_object('missing', missing));
  end if;
  return jsonb_build_object('outcome', case when p_approve then 'saved' else 'needs_input' end, 'missing', to_jsonb(missing), 'draft', draft, 'summary', draft);
end $$;

create or replace function public.pc_russ_draft_customer_update(
  p_claim_id uuid default null, p_request_id uuid default null, p_share boolean default false,
  p_idempotency_key text default null, p_category text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare cat text := coalesce(p_category, app.active_category());
declare draft text;
declare c claims%rowtype;
declare r policy_service_requests%rowtype;
begin
  perform app.pc_require_staff();
  if p_claim_id is not null then
    select * into c from claims where id = p_claim_id;
    draft := 'Update on your claim '||c.reference||': status is now "'||replace(c.status,'_',' ')||'". Next step: '||coalesce(c.next_action,'none')||'.';
    if p_share then
      insert into case_shared_notes (tenant_id, data_category, claim_id, body, shared_with_customer, created_by)
      values (app.tenant_id(), cat, c.id, draft, true, auth.uid());
      insert into claim_events (tenant_id, data_category, claim_id, event_type, actor_user_id, note, visibility, idempotency_key)
      values (app.tenant_id(), cat, c.id, 'russ_customer_update', auth.uid(), draft, 'shared', p_idempotency_key);
    end if;
  elsif p_request_id is not null then
    select * into r from policy_service_requests where id = p_request_id;
    draft := 'Update on your policy request '||r.reference||': status is "'||replace(r.status,'_',' ')||'". Next step: '||coalesce(r.next_action,'none')||'.';
    if p_share then
      insert into case_shared_notes (tenant_id, data_category, request_id, body, shared_with_customer, created_by)
      values (app.tenant_id(), cat, r.id, draft, true, auth.uid());
      insert into policy_service_request_events (tenant_id, data_category, request_id, event_type, actor_user_id, note, idempotency_key)
      values (app.tenant_id(), cat, r.id, 'russ_customer_update', auth.uid(), draft, p_idempotency_key);
    end if;
  else
    raise exception 'needs_input' using errcode = 'P0001';
  end if;
  return jsonb_build_object('outcome', case when p_share then 'saved' else 'needs_input' end, 'draft', draft, 'summary', case when p_share then 'Customer update shared' else 'Review draft' end);
end $$;

grant execute on function public.pc_list_policy_covers(text,text,uuid) to authenticated;
grant execute on function public.pc_list_service_requests(text,text,text,uuid) to authenticated;
grant execute on function public.pc_list_claims(text,text,text,uuid) to authenticated;
grant execute on function public.pc_policy_detail(uuid,text) to authenticated;
grant execute on function public.pc_service_request_detail(uuid,text) to authenticated;
grant execute on function public.pc_claim_detail(uuid,text) to authenticated;
grant execute on function public.pc_person_insured_items(uuid,text) to authenticated;
grant execute on function public.pc_my_cover(text) to authenticated;
grant execute on function public.pc_create_vehicle_replacement(uuid,uuid,uuid,timestamptz,jsonb,text,text,text) to authenticated;
grant execute on function public.pc_transition_service_request(uuid,text,text,text,text) to authenticated;
grant execute on function public.pc_confirm_vehicle_replacement(uuid,timestamptz,text,text,numeric,text,text) to authenticated;
grant execute on function public.pc_create_claim(uuid,uuid,timestamptz,boolean,text,text,uuid[],text,text) to authenticated;
grant execute on function public.pc_transition_claim(uuid,text,text,text,text) to authenticated;
grant execute on function public.pc_record_claim_submission(uuid,text,text,timestamptz,text,text) to authenticated;
grant execute on function public.pc_record_claim_decision(uuid,text,text,numeric,text,text,text) to authenticated;
grant execute on function public.pc_russ_prepare_endorsement(uuid,boolean,text,text) to authenticated;
grant execute on function public.pc_russ_check_evidence(uuid,boolean,text,text) to authenticated;
grant execute on function public.pc_russ_draft_customer_update(uuid,uuid,boolean,text,text) to authenticated;
