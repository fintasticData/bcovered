-- Fix pc_my_cover: stop cartesian join of items × policies (caused duplicate
-- checkboxes on Report an incident). Attach one policy per item via
-- policy_version_items, and surface photo_url / section_code for the UI.

begin;

create or replace function public.pc_my_cover(p_category text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cat text := coalesce(nullif(p_category, ''), nullif(app.active_category(), 'denied'), 'sample');
  cust uuid := app.my_customer_id();
begin
  if cat = 'denied' then raise exception 'forbidden' using errcode = '42501'; end if;
  if cust is null then raise exception 'forbidden' using errcode = '42501'; end if;

  return jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ii.id,
        'item_type', ii.item_type,
        'status', ii.status,
        'display_label', ii.display_label,
        'details', ii.details,
        'policy_id', coalesce(nullif(ii.details->>'policy_id', '')::uuid, pol.id),
        'photo_url', nullif(ii.details->>'photo_url', ''),
        'section_code', coalesce(
          nullif(ii.details->>'section_code', ''),
          case ii.item_type
            when 'contents' then 'HCAT'
            when 'building' then 'HOB'
            when 'vehicle' then 'MOT'
            when 'equipment' then 'PAV'
            else upper(left(ii.item_type, 4))
          end
        ),
        'policy_number', pol.policy_number,
        'insurer_name', pol.insurer_name
      ) order by ii.display_label)
      from insured_items ii
      left join lateral (
        select pol.id, pol.policy_number, ins.name as insurer_name
          from policy_version_items pvi
          join policy_versions pv
            on pv.id = pvi.policy_version_id
           and pv.superseded_at is null
          join policies pol
            on pol.id = pv.policy_id
           and pol.data_category = pv.data_category
          left join insurers ins on ins.id = pol.provider_id
         where pvi.insured_item_id = ii.id
           and pvi.data_category = ii.data_category
         limit 1
      ) pol on true
      where ii.data_category = cat
        and ii.person_id in (
          select person_id from customer_persons where customer_id = cust
        )
        and ii.status not in ('removed')
    ), '[]'::jsonb),
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'reference', r.reference,
        'status', r.status,
        'request_type', r.request_type,
        'next_action', r.next_action,
        'client_number', p.client_number,
        'customer_name', app.pc_person_name(p.id),
        'person_id', p.id,
        'insurer_name', null,
        'item_label', null,
        'owner_name', null,
        'due_at', r.due_at,
        'policy_id', r.policy_id
      ))
      from policy_service_requests r
      join persons p on p.id = r.person_id
      where r.data_category = cat
        and r.person_id in (select person_id from customer_persons where customer_id = cust)
        and r.status not in ('confirmed', 'declined', 'withdrawn')
    ), '[]'::jsonb),
    'claims', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'reference', c.reference,
        'status', c.status,
        'incident_type', c.incident_type,
        'incident_at', c.incident_at,
        'client_number', p.client_number,
        'customer_name', app.pc_person_name(p.id),
        'person_id', p.id,
        'affected_summary', null,
        'insurer_name', null,
        'insurer_reference', c.insurer_reference,
        'owner_name', null,
        'next_action', c.next_action,
        'due_at', c.due_at
      ))
      from claims c
      join persons p on p.id = c.person_id
      where c.data_category = cat
        and c.person_id in (select person_id from customer_persons where customer_id = cust)
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.pc_my_cover(text) from public, anon;
grant execute on function public.pc_my_cover(text) to authenticated;

commit;
