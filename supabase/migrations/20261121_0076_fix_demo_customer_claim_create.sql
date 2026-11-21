-- Demo VIP customers had app_users.tenant_id null, so pc_customer_create_claim
-- policy_cover checks (pc.tenant_id = app.tenant_id()) never matched → opaque "forbidden".
-- Backfill tenant_id and harden the customer claim RPC with clearer errors + robust tenant resolve.

update app_users u
   set tenant_id = c.tenant_id
  from customers c
 where u.customer_id = c.id
   and u.tenant_id is null
   and c.tenant_id is not null;

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
  tid uuid;
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
  if cat = 'denied' then
    raise exception 'claim_category_denied' using errcode = '42501';
  end if;
  if cust is null then
    raise exception 'claim_not_a_customer' using errcode = '42501';
  end if;

  tid := coalesce(
    app.tenant_id(),
    (select c2.tenant_id from customers c2 where c2.id = cust)
  );
  if tid is null then
    raise exception 'claim_missing_tenant' using errcode = '42501';
  end if;

  -- Keep app_users.tenant_id populated for subsequent app.tenant_id() calls.
  update app_users set tenant_id = tid where id = auth.uid() and tenant_id is null;

  select cp.person_id into person
    from customer_persons cp
   where cp.customer_id = cust and cp.data_category = cat
   order by cp.is_primary desc nulls last, cp.created_at
   limit 1;
  if person is null then
    select cp.person_id into person
      from customer_persons cp
     where cp.customer_id = cust
     order by case when cp.data_category = 'sample' then 0 else 1 end, cp.is_primary desc nulls last
     limit 1;
  end if;
  if person is null then
    raise exception 'claim_no_person_link' using errcode = '42501';
  end if;

  -- If the person only has sample cover, force sample so demo portal always works.
  if cat = 'live' and not exists (
    select 1 from policy_cover pc
     where pc.person_id = person and pc.data_category = 'live' and pc.tenant_id = tid
  ) and exists (
    select 1 from policy_cover pc
     where pc.person_id = person and pc.data_category = 'sample' and pc.tenant_id = tid
  ) then
    cat := 'sample';
  end if;

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
      where pc.policy_id = p_policy_id
        and pc.person_id = person
        and pc.data_category = cat
        and (pc.tenant_id = tid or pc.tenant_id is null)
    ) then
      raise exception 'claim_policy_not_on_cover' using errcode = '42501';
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
    tid, cat, person, p_policy_id, vid, vid, review, reason, p_incident_at, p_incident_time_unknown,
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
    select tid, cat, c.id, ii.id, ii.display_label, ii.item_type, ii.details
      from insured_items ii where ii.id = item_id;
  end loop;

  insert into claim_evidence_requirements (tenant_id, data_category, claim_id, label, status) values
    (tid, cat, c.id, 'Photos of damage', 'outstanding'),
    (tid, cat, c.id, 'Driver statement', 'outstanding'),
    (tid, cat, c.id, 'Police / case number (if applicable)', 'outstanding');

  select id into photo_req
    from claim_evidence_requirements
   where claim_id = c.id and label = 'Photos of damage'
   limit 1;

  foreach asset_id in array coalesce(p_photo_media_asset_ids, array[]::uuid[]) loop
    if not exists (
      select 1 from media_assets m
       where m.id = asset_id
         and m.tenant_id = tid
         and m.uploaded_by = auth.uid()
    ) then
      continue;
    end if;
    insert into claim_evidence_attachments (
      tenant_id, data_category, claim_id, requirement_id, media_asset_id, created_by
    ) values (
      tid, cat, c.id, photo_req, asset_id, auth.uid()
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
    tid, cat, c.id, 'created', c.status, auth.uid(),
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
