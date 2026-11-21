-- Broker special alerts for customer-submitted claims.
-- intake_source + broker_acknowledged_at power shell alerts, nav badges, and queue highlights.

alter table public.claims
  add column if not exists intake_source text not null default 'broker'
    check (intake_source in ('customer', 'broker')),
  add column if not exists broker_acknowledged_at timestamptz;

comment on column public.claims.intake_source is 'Who opened the claim: customer portal or broker desk.';
comment on column public.claims.broker_acknowledged_at is 'When a broker first acknowledged / started work on a customer-submitted claim.';

-- Backfill: treat existing customer-reported events as customer intake (still unacknowledged).
update public.claims c
   set intake_source = 'customer'
 where c.intake_source = 'broker'
   and exists (
     select 1 from public.claim_events e
      where e.claim_id = c.id
        and e.event_type = 'created'
        and e.note ilike 'Incident reported by customer%'
   );

create or replace function public.pc_customer_create_claim(
  p_incident_at timestamptz,
  p_incident_time_unknown boolean,
  p_incident_type text,
  p_description text,
  p_policy_id uuid default null,
  p_item_ids uuid[] default '{}',
  p_idempotency_key text default null,
  p_category text default null,
  p_photo_media_asset_ids uuid[] default '{}'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cat text := coalesce(nullif(p_category, ''), nullif(app.active_category(), 'denied'), 'sample');
  cust uuid := app.my_customer_id();
  person uuid;
  owner uuid;
  c claims%rowtype;
  resolved jsonb;
  vid uuid;
  review bool := false;
  reason text;
  item_id uuid;
  photo_req uuid;
  asset_id uuid;
  attached int := 0;
begin
  if cat = 'denied' or cust is null then raise exception 'forbidden' using errcode = '42501'; end if;

  select cp.person_id into person
    from customer_persons cp
   where cp.customer_id = cust and cp.data_category = cat
   order by cp.is_primary desc nulls last, cp.created_at
   limit 1;
  if person is null then
    select cp.person_id into person from customer_persons cp where cp.customer_id = cust limit 1;
  end if;
  if person is null then raise exception 'forbidden' using errcode = '42501'; end if;

  select coalesce(p.assigned_member_id, cu.assigned_member_id) into owner
    from persons p
    left join customer_persons cp on cp.person_id = p.id and cp.data_category = cat
    left join customers cu on cu.id = cp.customer_id
   where p.id = person
   order by cp.is_primary desc nulls last
   limit 1;

  if p_idempotency_key is not null then
    select claim_id into vid from claim_events where idempotency_key = p_idempotency_key limit 1;
    if vid is not null then
      select * into c from claims where id = vid;
      return jsonb_build_object(
        'outcome', 'saved', 'claim_id', c.id, 'reference', c.reference,
        'summary', 'Replayed claim', 'replayed', true, 'version_review_needed', c.version_review_needed
      );
    end if;
  end if;

  if p_policy_id is not null then
    if not exists (
      select 1 from policy_cover pc
      where pc.policy_id = p_policy_id and pc.person_id = person
        and pc.data_category = cat and pc.tenant_id = app.tenant_id()
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
    status, owner_member_id, next_action, due_at, created_by, intake_source, broker_acknowledged_at
  ) values (
    app.tenant_id(), cat, person, p_policy_id, vid, vid, review, reason, p_incident_at, p_incident_time_unknown,
    p_incident_type, p_description, case when review then 'in_review' else 'reported' end,
    owner,
    case when review then 'Link applicable policy version' else 'Review incident and evidence' end,
    now() + interval '3 days', auth.uid(), 'customer', null
  ) returning * into c;

  foreach item_id in array coalesce(p_item_ids, array[]::uuid[]) loop
    if not exists (select 1 from insured_items ii where ii.id = item_id and ii.person_id = person) then
      continue;
    end if;
    insert into claim_affected_items (tenant_id, data_category, claim_id, insured_item_id, display_label, item_type, snapshot)
    select app.tenant_id(), cat, c.id, ii.id, ii.display_label, ii.item_type, ii.details
      from insured_items ii where ii.id = item_id;
  end loop;

  insert into claim_evidence_requirements (tenant_id, data_category, claim_id, label, status) values
    (app.tenant_id(), cat, c.id, 'Photos of damage', 'outstanding'),
    (app.tenant_id(), cat, c.id, 'Driver statement', 'outstanding'),
    (app.tenant_id(), cat, c.id, 'Police / case number (if applicable)', 'outstanding');

  select id into photo_req
    from claim_evidence_requirements
   where claim_id = c.id and label = 'Photos of damage'
   limit 1;

  foreach asset_id in array coalesce(p_photo_media_asset_ids, array[]::uuid[]) loop
    if not exists (
      select 1 from media_assets m
       where m.id = asset_id
         and m.tenant_id = app.tenant_id()
         and m.uploaded_by = auth.uid()
    ) then
      continue;
    end if;
    insert into claim_evidence_attachments (
      tenant_id, data_category, claim_id, requirement_id, media_asset_id, created_by
    ) values (
      app.tenant_id(), cat, c.id, photo_req, asset_id, auth.uid()
    )
    on conflict (requirement_id, media_asset_id) do nothing;
    update media_assets
       set owner_table = 'claim_evidence_requirements', owner_id = photo_req
     where id = asset_id;
  end loop;
  select count(*)::int into attached
    from claim_evidence_attachments
   where requirement_id = photo_req;

  if attached > 0 then
    update claim_evidence_requirements
       set status = 'received',
           media_asset_id = (
             select a.media_asset_id from claim_evidence_attachments a
              where a.requirement_id = photo_req order by a.created_at limit 1
           )
     where id = photo_req;
  end if;

  insert into claim_events (tenant_id, data_category, claim_id, event_type, to_status, actor_user_id, note, visibility, idempotency_key)
  values (
    app.tenant_id(), cat, c.id, 'created', c.status, auth.uid(),
    'Incident reported by customer' || case when attached > 0 then ' with '||attached||' photo(s)' else '' end,
    'shared', p_idempotency_key
  );

  return jsonb_build_object(
    'outcome', 'saved',
    'claim_id', c.id,
    'reference', c.reference,
    'summary', 'Claim '||c.reference||' created',
    'version_review_needed', review,
    'photo_requirement_id', photo_req,
    'photos_attached', attached
  );
end;
$$;

revoke all on function public.pc_customer_create_claim(timestamptz, boolean, text, text, uuid, uuid[], text, text, uuid[]) from public, anon;
grant execute on function public.pc_customer_create_claim(timestamptz, boolean, text, text, uuid, uuid[], text, text, uuid[]) to authenticated;

create or replace function public.pc_list_claims(
  p_category text default null,
  p_query text default null,
  p_filter text default null,
  p_person_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare cat text := coalesce(p_category, app.active_category());
begin
  perform app.pc_require_staff();
  return jsonb_build_object('rows', coalesce((
    select jsonb_agg(row_to_json(x)::jsonb)
    from (
      select c.id, c.reference, p.client_number, app.pc_person_name(p.id) as customer_name, p.id as person_id,
             c.incident_type, c.incident_at, c.created_at, c.intake_source, c.broker_acknowledged_at,
             (select string_agg(a.display_label, ', ') from claim_affected_items a where a.claim_id = c.id) as affected_summary,
             i.name as insurer_name, c.insurer_reference, c.status, m.full_name as owner_name,
             c.next_action, c.due_at, c.version_review_needed
      from claims c
      join persons p on p.id = c.person_id
      left join policies pol on pol.id = c.policy_id
      left join insurers i on i.id = pol.provider_id
      left join sales_team_members m on m.id = c.owner_member_id
      where c.tenant_id = app.tenant_id() and c.data_category = cat
        and (p_person_id is null or c.person_id = p_person_id)
        and (not app.book_restricted() or app.can_see_person(c.person_id))
        and (p_query is null or p_query = '' or p.client_number ilike '%'||p_query||'%'
             or app.pc_person_name(p.id) ilike '%'||p_query||'%' or c.reference ilike '%'||p_query||'%')
        and (
          p_filter is null or p_filter = ''
          or (p_filter = 'new' and (
            c.status = 'reported'
            or (c.intake_source = 'customer' and c.broker_acknowledged_at is null)
          ))
          or (p_filter = 'missing_evidence' and c.status = 'awaiting_evidence')
          or (p_filter = 'awaiting_insurer' and c.status in ('submitted_to_insurer','awaiting_insurer_update','under_assessment'))
          or (p_filter = 'overdue' and c.due_at is not null and c.due_at < now() and c.status not in ('closed','decision_received'))
          or (p_filter = 'version_review' and c.version_review_needed)
        )
      order by c.updated_at desc
    ) x
  ), '[]'::jsonb));
end;
$$;

revoke all on function public.pc_list_claims(text, text, text, uuid) from public, anon;
grant execute on function public.pc_list_claims(text, text, text, uuid) to authenticated;

create or replace function public.pc_broker_claim_alerts(p_category text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare cat text := coalesce(nullif(p_category, ''), app.active_category());
begin
  perform app.pc_require_staff();
  return jsonb_build_object(
    'count', coalesce((
      select count(*)::int
      from claims c
      where c.tenant_id = app.tenant_id()
        and c.data_category = cat
        and c.intake_source = 'customer'
        and c.broker_acknowledged_at is null
        and c.status not in ('closed')
        and (not app.book_restricted() or app.can_see_person(c.person_id))
    ), 0),
    'rows', coalesce((
      select jsonb_agg(row_to_json(x)::jsonb)
      from (
        select c.id, c.reference, c.person_id, app.pc_person_name(c.person_id) as customer_name,
               c.incident_type, c.status, c.created_at, c.incident_at
        from claims c
        where c.tenant_id = app.tenant_id()
          and c.data_category = cat
          and c.intake_source = 'customer'
          and c.broker_acknowledged_at is null
          and c.status not in ('closed')
          and (not app.book_restricted() or app.can_see_person(c.person_id))
        order by c.created_at desc
        limit 20
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.pc_broker_claim_alerts(text) from public, anon;
grant execute on function public.pc_broker_claim_alerts(text) to authenticated;

create or replace function public.pc_acknowledge_claim_alert(
  p_claim_id uuid,
  p_category text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cat text := coalesce(nullif(p_category, ''), app.active_category());
  c claims%rowtype;
begin
  perform app.pc_require_staff();
  select * into c from claims
   where id = p_claim_id and data_category = cat and tenant_id = app.tenant_id();
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if app.book_restricted() and not app.can_see_person(c.person_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if c.broker_acknowledged_at is null then
    update claims
       set broker_acknowledged_at = now(), updated_at = now()
     where id = c.id;
  end if;
  return jsonb_build_object(
    'outcome', 'saved',
    'claim_id', c.id,
    'reference', c.reference,
    'summary', 'Claim alert acknowledged'
  );
end;
$$;

revoke all on function public.pc_acknowledge_claim_alert(uuid, text) from public, anon;
grant execute on function public.pc_acknowledge_claim_alert(uuid, text) to authenticated;

-- Acknowledge customer-intake alerts when a broker transitions the claim.
create or replace function public.pc_transition_claim(
  p_claim_id uuid,
  p_to_status text,
  p_note text default null,
  p_idempotency_key text default null,
  p_category text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cat text := coalesce(p_category, app.active_category());
  c claims%rowtype;
begin
  perform app.pc_require_staff();
  select * into c from claims where id = p_claim_id and data_category = cat and tenant_id = app.tenant_id();
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if app.book_restricted() and not app.can_see_person(c.person_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_idempotency_key is not null and exists (select 1 from claim_events where claim_id = c.id and idempotency_key = p_idempotency_key) then
    return jsonb_build_object('outcome','saved','summary','Replayed','replayed', true);
  end if;
  update claims set
    status = p_to_status,
    next_action = case p_to_status
      when 'in_review' then 'Review evidence'
      when 'awaiting_evidence' then 'Customer to upload outstanding evidence'
      when 'submitted_to_insurer' then 'Record insurer reference when received'
      when 'awaiting_insurer_update' then 'Follow up with insurer'
      when 'under_assessment' then 'Monitor insurer assessment'
      else next_action end,
    broker_acknowledged_at = coalesce(broker_acknowledged_at, now()),
    updated_at = now()
  where id = c.id;
  insert into claim_events (tenant_id, data_category, claim_id, event_type, from_status, to_status, actor_user_id, note, visibility, idempotency_key)
  values (app.tenant_id(), cat, c.id, 'status_change', c.status, p_to_status, auth.uid(), p_note, 'internal', p_idempotency_key);
  return jsonb_build_object('outcome','saved','summary','Claim status set to '||p_to_status);
end;
$$;

revoke all on function public.pc_transition_claim(uuid, text, text, text, text) from public, anon;
grant execute on function public.pc_transition_claim(uuid, text, text, text, text) to authenticated;
