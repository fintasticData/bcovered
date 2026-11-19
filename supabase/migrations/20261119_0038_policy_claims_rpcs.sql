-- Policy & Claims RPCs + sample seed for Thandi CL-S1001 motor journeys.

create or replace function app.pc_require_staff() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not app.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
end $$;

create or replace function app.pc_person_name(p_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select trim(both from coalesce(first_names,'') || ' ' || coalesce(surname,'')) from persons where id = p_id
$$;

-- List covers
create or replace function public.pc_list_policy_covers(p_category text default null, p_query text default null, p_person_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cat text := coalesce(p_category, app.active_category());
begin
  perform set_config('request.headers', coalesce(current_setting('request.headers', true), '{}'), true);
  perform app.pc_require_staff();
  return jsonb_build_object('rows', coalesce((
    select jsonb_agg(row_to_json(x)::jsonb order by x.customer_name)
    from (
      select pc.id, pc.policy_id, pol.reference, pol.policy_number, p.client_number,
             app.pc_person_name(p.id) as customer_name, p.id as person_id,
             i.name as insurer_name, pol.status,
             (select string_agg(ii.display_label, ', ' order by ii.display_label)
                from policy_versions pv
                join policy_version_items pvi on pvi.policy_version_id = pv.id
                join insured_items ii on ii.id = pvi.insured_item_id
               where pv.policy_id = pol.id and pv.superseded_at is null) as item_summary
      from policy_cover pc
      join policies pol on pol.id = pc.policy_id and pol.data_category = pc.data_category
      join persons p on p.id = pc.person_id and p.data_category = pc.data_category
      left join insurers i on i.id = pol.provider_id
      where pc.tenant_id = app.tenant_id() and pc.data_category = cat
        and (p_person_id is null or pc.person_id = p_person_id)
        and (not app.book_restricted() or app.can_see_person(pc.person_id))
        and (p_query is null or p_query = '' or p.client_number ilike '%'||p_query||'%'
             or app.pc_person_name(p.id) ilike '%'||p_query||'%'
             or coalesce(pol.policy_number,'') ilike '%'||p_query||'%')
    ) x
  ), '[]'::jsonb));
end $$;

create or replace function public.pc_list_service_requests(p_category text default null, p_query text default null, p_status text default null, p_person_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cat text := coalesce(p_category, app.active_category());
begin
  perform app.pc_require_staff();
  return jsonb_build_object('rows', coalesce((
    select jsonb_agg(row_to_json(x)::jsonb)
    from (
      select r.id, r.reference, p.client_number, app.pc_person_name(p.id) as customer_name, p.id as person_id,
             i.name as insurer_name, ii.display_label as item_label, r.request_type, r.status,
             m.full_name as owner_name, r.next_action, r.due_at, r.policy_id
      from policy_service_requests r
      join persons p on p.id = r.person_id
      join policies pol on pol.id = r.policy_id
      left join insurers i on i.id = pol.provider_id
      left join insured_items ii on ii.id = r.insured_item_id
      left join sales_team_members m on m.id = r.owner_member_id
      where r.tenant_id = app.tenant_id() and r.data_category = cat
        and (p_person_id is null or r.person_id = p_person_id)
        and (p_status is null or p_status = '' or r.status = p_status)
        and (not app.book_restricted() or app.can_see_person(r.person_id))
        and (p_query is null or p_query = '' or p.client_number ilike '%'||p_query||'%'
             or app.pc_person_name(p.id) ilike '%'||p_query||'%' or r.reference ilike '%'||p_query||'%')
      order by r.updated_at desc
    ) x
  ), '[]'::jsonb));
end $$;

create or replace function public.pc_list_claims(p_category text default null, p_query text default null, p_filter text default null, p_person_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cat text := coalesce(p_category, app.active_category());
begin
  perform app.pc_require_staff();
  return jsonb_build_object('rows', coalesce((
    select jsonb_agg(row_to_json(x)::jsonb)
    from (
      select c.id, c.reference, p.client_number, app.pc_person_name(p.id) as customer_name, p.id as person_id,
             c.incident_type, c.incident_at,
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
          or (p_filter = 'new' and c.status = 'reported')
          or (p_filter = 'missing_evidence' and c.status = 'awaiting_evidence')
          or (p_filter = 'awaiting_insurer' and c.status in ('submitted_to_insurer','awaiting_insurer_update','under_assessment'))
          or (p_filter = 'overdue' and c.due_at is not null and c.due_at < now() and c.status not in ('closed','decision_received'))
          or (p_filter = 'version_review' and c.version_review_needed)
        )
      order by c.updated_at desc
    ) x
  ), '[]'::jsonb));
end $$;

create or replace function public.pc_policy_detail(p_policy_id uuid, p_category text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cat text := coalesce(p_category, app.active_category());
declare pc policy_cover%rowtype;
declare pol policies%rowtype;
declare cur policy_versions%rowtype;
begin
  perform app.pc_require_staff();
  select * into pc from policy_cover where policy_id = p_policy_id and data_category = cat and tenant_id = app.tenant_id();
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if app.book_restricted() and not app.can_see_person(pc.person_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into pol from policies where id = p_policy_id;
  select * into cur from policy_versions where policy_id = p_policy_id and superseded_at is null order by version_no desc limit 1;
  return jsonb_build_object(
    'policy_id', pol.id,
    'person_id', pc.person_id,
    'client_number', (select client_number from persons where id = pc.person_id),
    'customer_name', app.pc_person_name(pc.person_id),
    'insurer_name', (select name from insurers where id = pol.provider_id),
    'policy_number', pol.policy_number,
    'reference', pol.reference,
    'status', pol.status,
    'current_version', case when cur.id is null then null else jsonb_build_object(
      'id', cur.id, 'version_no', cur.version_no, 'effective_at', cur.effective_at, 'terms', cur.terms
    ) end,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('id', ii.id, 'item_type', ii.item_type, 'status', ii.status, 'display_label', ii.display_label, 'details', ii.details))
      from policy_version_items pvi join insured_items ii on ii.id = pvi.insured_item_id
      where cur.id is not null and pvi.policy_version_id = cur.id
    ), '[]'::jsonb),
    'versions', coalesce((
      select jsonb_agg(jsonb_build_object('id', v.id, 'version_no', v.version_no, 'effective_at', v.effective_at, 'superseded_at', v.superseded_at) order by v.version_no)
      from policy_versions v where v.policy_id = pol.id
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

create or replace function public.pc_service_request_detail(p_request_id uuid, p_category text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cat text := coalesce(p_category, app.active_category());
declare r policy_service_requests%rowtype;
begin
  perform app.pc_require_staff();
  select * into r from policy_service_requests where id = p_request_id and data_category = cat and tenant_id = app.tenant_id();
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if app.book_restricted() and not app.can_see_person(r.person_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'id', r.id, 'reference', r.reference, 'client_number', (select client_number from persons where id = r.person_id),
    'customer_name', app.pc_person_name(r.person_id), 'person_id', r.person_id,
    'insurer_name', (select i.name from policies pol join insurers i on i.id = pol.provider_id where pol.id = r.policy_id),
    'item_label', (select display_label from insured_items where id = r.insured_item_id),
    'request_type', r.request_type, 'status', r.status,
    'owner_name', (select full_name from sales_team_members where id = r.owner_member_id),
    'next_action', r.next_action, 'due_at', r.due_at, 'policy_id', r.policy_id,
    'requested_change', r.requested_change, 'current_snapshot', r.current_snapshot,
    'events', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'event_type', e.event_type, 'from_status', e.from_status, 'to_status', e.to_status, 'note', e.note, 'created_at', e.created_at) order by e.created_at)
      from policy_service_request_events e where e.request_id = r.id
    ), '[]'::jsonb)
  );
end $$;

create or replace function public.pc_claim_detail(p_claim_id uuid, p_category text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cat text := coalesce(p_category, app.active_category());
declare c claims%rowtype;
begin
  perform app.pc_require_staff();
  select * into c from claims where id = p_claim_id and data_category = cat and tenant_id = app.tenant_id();
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if app.book_restricted() and not app.can_see_person(c.person_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'id', c.id, 'reference', c.reference, 'client_number', (select client_number from persons where id = c.person_id),
    'customer_name', app.pc_person_name(c.person_id), 'person_id', c.person_id,
    'incident_type', c.incident_type, 'incident_at', c.incident_at, 'incident_time_unknown', c.incident_time_unknown,
    'description', c.description, 'status', c.status,
    'owner_name', (select full_name from sales_team_members where id = c.owner_member_id),
    'next_action', c.next_action, 'due_at', c.due_at, 'version_review_needed', c.version_review_needed,
    'version_review_reason', c.version_review_reason, 'policy_id', c.policy_id, 'policy_version_id', c.policy_version_id,
    'insurer_name', (select i.name from policies pol join insurers i on i.id = pol.provider_id where pol.id = c.policy_id),
    'insurer_reference', c.insurer_reference, 'submitted_at', c.submitted_at,
    'decision', c.decision, 'decision_source', c.decision_source, 'settlement_amount', c.settlement_amount,
    'affected_items', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'display_label', a.display_label, 'item_type', a.item_type, 'status', 'covered', 'details', a.snapshot))
      from claim_affected_items a where a.claim_id = c.id
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

create or replace function public.pc_person_insured_items(p_person_id uuid, p_category text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cat text := coalesce(p_category, app.active_category());
begin
  perform app.pc_require_staff();
  if app.book_restricted() and not app.can_see_person(p_person_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object('rows', coalesce((
    select jsonb_agg(jsonb_build_object('id', ii.id, 'item_type', ii.item_type, 'status', ii.status, 'display_label', ii.display_label, 'details', ii.details))
    from insured_items ii where ii.person_id = p_person_id and ii.data_category = cat and ii.tenant_id = app.tenant_id()
  ), '[]'::jsonb));
end $$;

create or replace function public.pc_my_cover(p_category text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cat text := coalesce(p_category, app.active_category());
declare cust uuid := app.my_customer_id();
begin
  if cust is null then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object('id', ii.id, 'item_type', ii.item_type, 'status', ii.status, 'display_label', ii.display_label, 'details', ii.details, 'policy_id', pc.policy_id))
      from insured_items ii
      left join policy_cover pc on pc.person_id = ii.person_id and pc.data_category = ii.data_category
      where ii.data_category = cat and ii.person_id in (select person_id from customer_persons where customer_id = cust)
    ), '[]'::jsonb),
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'reference', r.reference, 'status', r.status, 'request_type', r.request_type, 'next_action', r.next_action,
        'client_number', p.client_number, 'customer_name', app.pc_person_name(p.id), 'person_id', p.id, 'insurer_name', null, 'item_label', null,
        'owner_name', null, 'due_at', r.due_at, 'policy_id', r.policy_id))
      from policy_service_requests r join persons p on p.id = r.person_id
      where r.data_category = cat and r.person_id in (select person_id from customer_persons where customer_id = cust)
        and r.status not in ('confirmed','declined','withdrawn')
    ), '[]'::jsonb),
    'claims', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'reference', c.reference, 'status', c.status, 'incident_type', c.incident_type, 'incident_at', c.incident_at,
        'client_number', p.client_number, 'customer_name', app.pc_person_name(p.id), 'person_id', p.id, 'affected_summary', null,
        'insurer_name', null, 'insurer_reference', c.insurer_reference, 'owner_name', null, 'next_action', c.next_action, 'due_at', c.due_at))
      from claims c join persons p on p.id = c.person_id
      where c.data_category = cat and c.person_id in (select person_id from customer_persons where customer_id = cust)
    ), '[]'::jsonb)
  );
end $$;
