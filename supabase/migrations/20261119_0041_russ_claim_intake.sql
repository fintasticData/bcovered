-- Russ claim intake (customer create) + schedule comparison for vehicle replacements.

begin;

create or replace function public.pc_customer_create_claim(
  p_incident_at timestamptz,
  p_incident_time_unknown boolean,
  p_incident_type text,
  p_description text,
  p_policy_id uuid default null,
  p_item_ids uuid[] default '{}',
  p_idempotency_key text default null,
  p_category text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare cat text := coalesce(p_category, app.active_category());
declare cust uuid := app.my_customer_id();
declare person uuid;
declare c claims%rowtype;
declare resolved jsonb;
declare vid uuid;
declare review bool := false;
declare reason text;
declare item_id uuid;
begin
  if cust is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select cp.person_id into person
    from customer_persons cp
   where cp.customer_id = cust
   order by cp.person_id
   limit 1;
  if person is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_idempotency_key is not null then
    select claim_id into vid from claim_events where idempotency_key = p_idempotency_key limit 1;
    if vid is not null then
      select * into c from claims where id = vid;
      return jsonb_build_object('outcome','saved','claim_id', c.id, 'reference', c.reference, 'summary', 'Replayed claim', 'replayed', true, 'version_review_needed', c.version_review_needed);
    end if;
  end if;
  if p_policy_id is not null then
    if not exists (
      select 1 from policy_cover pc
      where pc.policy_id = p_policy_id and pc.person_id = person and pc.data_category = cat and pc.tenant_id = app.tenant_id()
    ) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
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
    app.tenant_id(), cat, person, p_policy_id, vid, vid, review, reason, p_incident_at, p_incident_time_unknown,
    p_incident_type, p_description, case when review then 'in_review' else 'reported' end,
    null,
    case when review then 'Link applicable policy version' else 'Review incident and evidence' end,
    now() + interval '3 days', auth.uid()
  ) returning * into c;
  foreach item_id in array coalesce(p_item_ids, array[]::uuid[]) loop
    if not exists (select 1 from insured_items ii where ii.id = item_id and ii.person_id = person) then
      continue;
    end if;
    insert into claim_affected_items (tenant_id, data_category, claim_id, insured_item_id, display_label, item_type, snapshot)
    select app.tenant_id(), cat, c.id, ii.id, ii.display_label, ii.item_type, ii.details from insured_items ii where ii.id = item_id;
  end loop;
  insert into claim_evidence_requirements (tenant_id, data_category, claim_id, label, status) values
    (app.tenant_id(), cat, c.id, 'Photos of damage', 'outstanding'),
    (app.tenant_id(), cat, c.id, 'Driver statement', 'outstanding'),
    (app.tenant_id(), cat, c.id, 'Police / case number (if applicable)', 'outstanding');
  insert into claim_events (tenant_id, data_category, claim_id, event_type, to_status, actor_user_id, note, visibility, idempotency_key)
  values (app.tenant_id(), cat, c.id, 'created', c.status, auth.uid(), 'Incident reported by customer', 'shared', p_idempotency_key);
  return jsonb_build_object('outcome','saved','claim_id', c.id, 'reference', c.reference,
    'summary', 'Claim '||c.reference||' created', 'version_review_needed', review);
end $$;

create or replace function public.pc_russ_compare_schedule(
  p_request_id uuid,
  p_proposed jsonb,
  p_approve boolean default false,
  p_idempotency_key text default null,
  p_category text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare cat text := coalesce(p_category, app.active_category());
declare r policy_service_requests%rowtype;
declare req jsonb;
declare prop_repl jsonb;
declare req_repl jsonb;
declare diffs jsonb := '[]'::jsonb;
declare summary text;
declare draft text;
begin
  perform app.pc_require_staff();
  select * into r from policy_service_requests where id = p_request_id and data_category = cat and tenant_id = app.tenant_id();
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if app.book_restricted() and not app.can_see_person(r.person_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  req := coalesce(r.requested_change, '{}'::jsonb);
  req_repl := coalesce(req->'replacement', '{}'::jsonb);
  prop_repl := coalesce(p_proposed->'replacement', '{}'::jsonb);

  if coalesce(prop_repl->>'make','') <> '' and coalesce(prop_repl->>'make','') is distinct from coalesce(req_repl->>'make','') then
    diffs := diffs || jsonb_build_array(jsonb_build_object('field','make','requested', coalesce(req_repl->>'make',''), 'proposed', coalesce(prop_repl->>'make','')));
  end if;
  if coalesce(prop_repl->>'model','') <> '' and coalesce(prop_repl->>'model','') is distinct from coalesce(req_repl->>'model','') then
    diffs := diffs || jsonb_build_array(jsonb_build_object('field','model','requested', coalesce(req_repl->>'model',''), 'proposed', coalesce(prop_repl->>'model','')));
  end if;
  if coalesce(prop_repl->>'year','') <> '' and coalesce(prop_repl->>'year','') is distinct from coalesce(req_repl->>'year','') then
    diffs := diffs || jsonb_build_array(jsonb_build_object('field','year','requested', coalesce(req_repl->>'year',''), 'proposed', coalesce(prop_repl->>'year','')));
  end if;
  if coalesce(prop_repl->>'registration','') <> '' and coalesce(prop_repl->>'registration','') is distinct from coalesce(req_repl->>'registration','') then
    diffs := diffs || jsonb_build_array(jsonb_build_object('field','registration','requested', coalesce(req_repl->>'registration',''), 'proposed', coalesce(prop_repl->>'registration','')));
  end if;
  if coalesce(p_proposed->>'premium','') <> '' and coalesce(p_proposed->>'premium','') is distinct from coalesce(req->>'premium','') then
    diffs := diffs || jsonb_build_array(jsonb_build_object('field','premium','requested', coalesce(req->>'premium',''), 'proposed', coalesce(p_proposed->>'premium','')));
  end if;
  if coalesce(p_proposed->>'excess','') <> '' and coalesce(p_proposed->>'excess','') is distinct from coalesce(req->>'excess','') then
    diffs := diffs || jsonb_build_array(jsonb_build_object('field','excess','requested', coalesce(req->>'excess',''), 'proposed', coalesce(p_proposed->>'excess','')));
  end if;
  if coalesce(p_proposed->>'effective_at','') <> '' and coalesce(p_proposed->>'effective_at','') is distinct from coalesce(r.requested_effective_at::text,'') then
    diffs := diffs || jsonb_build_array(jsonb_build_object(
      'field','effective_at',
      'requested', coalesce(r.requested_effective_at::text,''),
      'proposed', coalesce(p_proposed->>'effective_at','')
    ));
  end if;

  if jsonb_array_length(diffs) = 0 then
    summary := 'Revised schedule matches the requested change for '||r.reference||'.';
    draft := summary;
  else
    summary := jsonb_array_length(diffs)::text || ' difference(s) between requested change and revised schedule for '||r.reference||'.';
    draft := summary || E'\n' || (
      select string_agg(format('- %s: requested %s → schedule %s', d->>'field', nullif(d->>'requested',''), nullif(d->>'proposed','')), E'\n')
      from jsonb_array_elements(diffs) d
    );
  end if;

  if p_approve then
    insert into policy_service_request_events (tenant_id, data_category, request_id, event_type, actor_user_id, note, idempotency_key, payload)
    values (app.tenant_id(), cat, r.id, 'russ_schedule_compare', auth.uid(), draft, p_idempotency_key,
      jsonb_build_object('diffs', diffs, 'proposed', p_proposed))
    on conflict do nothing;
  end if;

  return jsonb_build_object(
    'outcome', case when p_approve then 'saved' else 'needs_input' end,
    'summary', summary,
    'draft', draft,
    'diffs', diffs
  );
end $$;

grant execute on function public.pc_customer_create_claim(timestamptz,boolean,text,text,uuid,uuid[],text,text) to authenticated;
grant execute on function public.pc_russ_compare_schedule(uuid,jsonb,boolean,text,text) to authenticated;

commit;
