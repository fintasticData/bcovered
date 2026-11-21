-- Claim evidence: multi-file attachments (images / PDF / docs) linked to media_assets,
-- with gallery-ready URLs returned from pc_claim_detail.

-- ------------------------------------------------------------------ owner types
alter table public.media_assets drop constraint if exists media_assets_owner_table_check;
alter table public.media_assets add constraint media_assets_owner_table_check
  check (owner_table is null or owner_table in (
    'organisations','sales_offers','sales_sales','persons','commercial_assets',
    'policy_service_requests','claims','policy_versions','insured_items',
    'claim_evidence_requirements'
  ));

-- ------------------------------------------------------------------ attachments
create table if not exists public.claim_evidence_attachments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  data_category text not null check (data_category in ('sample','live')),
  claim_id uuid not null,
  requirement_id uuid not null references claim_evidence_requirements(id) on delete cascade,
  media_asset_id uuid not null references media_assets(id),
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  unique (requirement_id, media_asset_id),
  foreign key (claim_id, data_category) references claims (id, data_category)
);

create index if not exists claim_evidence_attachments_claim_idx
  on public.claim_evidence_attachments (claim_id, data_category);
create index if not exists claim_evidence_attachments_req_idx
  on public.claim_evidence_attachments (requirement_id);

alter table public.claim_evidence_attachments enable row level security;

drop policy if exists claim_evidence_attachments_staff on public.claim_evidence_attachments;
create policy claim_evidence_attachments_staff on public.claim_evidence_attachments for all
  using (tenant_id = app.tenant_id() and app.is_staff() and data_category = app.active_category())
  with check (tenant_id = app.tenant_id() and app.is_staff() and data_category = app.active_category());

-- ------------------------------------------------------------------ attach files → mark received
create or replace function public.pc_attach_claim_evidence(
  p_requirement_id uuid,
  p_media_asset_ids uuid[],
  p_idempotency_key text default null,
  p_category text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  cat text := coalesce(p_category, app.active_category());
  req claim_evidence_requirements%rowtype;
  c claims%rowtype;
  asset_id uuid;
  attached int := 0;
  inserted int := 0;
  names text[] := array[]::text[];
begin
  perform app.pc_require_staff();
  if p_media_asset_ids is null or cardinality(p_media_asset_ids) = 0 then
    raise exception 'invalid_input' using errcode = '22023', message = 'Select at least one file';
  end if;

  select * into req from claim_evidence_requirements
   where id = p_requirement_id and data_category = cat and tenant_id = app.tenant_id();
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;

  select * into c from claims where id = req.claim_id and data_category = cat and tenant_id = app.tenant_id();
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if app.book_restricted() and not app.can_see_person(c.person_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_idempotency_key is not null and exists (
    select 1 from claim_events where claim_id = c.id and idempotency_key = p_idempotency_key
  ) then
    return jsonb_build_object(
      'outcome', 'saved',
      'replayed', true,
      'requirement_id', req.id,
      'status', (select status from claim_evidence_requirements where id = req.id),
      'summary', 'Evidence attach already recorded'
    );
  end if;

  foreach asset_id in array p_media_asset_ids loop
    if not exists (
      select 1 from media_assets m
       where m.id = asset_id and m.tenant_id = app.tenant_id()
    ) then
      raise exception 'not_found' using errcode = 'P0002', message = 'Media asset not found for tenant';
    end if;

    insert into claim_evidence_attachments (
      tenant_id, data_category, claim_id, requirement_id, media_asset_id, created_by
    ) values (
      app.tenant_id(), cat, c.id, req.id, asset_id, auth.uid()
    )
    on conflict (requirement_id, media_asset_id) do nothing;
    get diagnostics inserted = row_count;

    if inserted > 0 then
      attached := attached + 1;
      update media_assets
         set owner_table = 'claim_evidence_requirements',
             owner_id = req.id
       where id = asset_id
         and (owner_table is distinct from 'claim_evidence_requirements' or owner_id is distinct from req.id);
      names := array_append(names, (select file_name from media_assets where id = asset_id));
    end if;
  end loop;

  update claim_evidence_requirements e
     set status = 'received',
         media_asset_id = coalesce(
           e.media_asset_id,
           (select a.media_asset_id from claim_evidence_attachments a
             where a.requirement_id = e.id order by a.created_at limit 1)
         )
   where e.id = req.id;

  insert into claim_events (
    tenant_id, data_category, claim_id, event_type, from_status, to_status,
    actor_user_id, note, visibility, idempotency_key, payload
  ) values (
    app.tenant_id(), cat, c.id, 'evidence_attached', c.status, c.status,
    auth.uid(),
    'Attached '||attached||' file(s) for '||req.label||case when cardinality(names) > 0 then ': '||array_to_string(names, ', ') else '' end,
    'internal', p_idempotency_key,
    jsonb_build_object(
      'requirement_id', req.id,
      'label', req.label,
      'media_asset_ids', to_jsonb(p_media_asset_ids),
      'attached_count', attached
    )
  );

  return jsonb_build_object(
    'outcome', 'saved',
    'requirement_id', req.id,
    'attached_count', attached,
    'status', 'received',
    'summary', 'Saved '||attached||' file(s) for '||req.label
  );
end $$;

-- ------------------------------------------------------------------ remove one attachment
create or replace function public.pc_remove_claim_evidence_attachment(
  p_attachment_id uuid,
  p_idempotency_key text default null,
  p_category text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  cat text := coalesce(p_category, app.active_category());
  att claim_evidence_attachments%rowtype;
  req claim_evidence_requirements%rowtype;
  c claims%rowtype;
  remaining int;
begin
  perform app.pc_require_staff();
  select * into att from claim_evidence_attachments
   where id = p_attachment_id and data_category = cat and tenant_id = app.tenant_id();
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;

  select * into req from claim_evidence_requirements where id = att.requirement_id;
  select * into c from claims where id = att.claim_id and data_category = cat and tenant_id = app.tenant_id();
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if app.book_restricted() and not app.can_see_person(c.person_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  delete from claim_evidence_attachments where id = att.id;

  select count(*) into remaining from claim_evidence_attachments where requirement_id = req.id;
  update claim_evidence_requirements e
     set media_asset_id = (
           select a.media_asset_id from claim_evidence_attachments a
            where a.requirement_id = e.id order by a.created_at limit 1
         ),
         status = case
           when remaining > 0 then 'received'
           when e.status = 'waived' then 'waived'
           else 'outstanding'
         end
   where e.id = req.id;

  insert into claim_events (
    tenant_id, data_category, claim_id, event_type, actor_user_id, note, visibility, idempotency_key, payload
  ) values (
    app.tenant_id(), cat, c.id, 'evidence_removed', auth.uid(),
    'Removed file from '||req.label, 'internal', p_idempotency_key,
    jsonb_build_object('requirement_id', req.id, 'attachment_id', att.id, 'media_asset_id', att.media_asset_id)
  );

  return jsonb_build_object(
    'outcome', 'saved',
    'requirement_id', req.id,
    'remaining', remaining,
    'status', (select status from claim_evidence_requirements where id = req.id),
    'summary', 'Removed attachment from '||req.label
  );
end $$;

-- ------------------------------------------------------------------ waive / reopen requirement
create or replace function public.pc_set_claim_evidence_status(
  p_requirement_id uuid,
  p_status text,
  p_idempotency_key text default null,
  p_category text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  cat text := coalesce(p_category, app.active_category());
  req claim_evidence_requirements%rowtype;
  c claims%rowtype;
  has_files boolean;
begin
  perform app.pc_require_staff();
  if p_status not in ('outstanding','received','waived') then
    raise exception 'invalid_input' using errcode = '22023', message = 'Invalid evidence status';
  end if;

  select * into req from claim_evidence_requirements
   where id = p_requirement_id and data_category = cat and tenant_id = app.tenant_id();
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into c from claims where id = req.claim_id and data_category = cat and tenant_id = app.tenant_id();
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if app.book_restricted() and not app.can_see_person(c.person_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select exists (
    select 1 from claim_evidence_attachments a where a.requirement_id = req.id
  ) into has_files;

  if p_status = 'outstanding' and has_files then
    raise exception 'invalid_input' using errcode = '22023',
      message = 'Remove attached files before marking outstanding';
  end if;
  if p_status = 'received' and not has_files then
    raise exception 'invalid_input' using errcode = '22023',
      message = 'Attach at least one file before marking received';
  end if;

  update claim_evidence_requirements set status = p_status where id = req.id;

  insert into claim_events (
    tenant_id, data_category, claim_id, event_type, actor_user_id, note, visibility, idempotency_key, payload
  ) values (
    app.tenant_id(), cat, c.id, 'evidence_status', auth.uid(),
    req.label||' → '||p_status, 'internal', p_idempotency_key,
    jsonb_build_object('requirement_id', req.id, 'status', p_status)
  );

  return jsonb_build_object(
    'outcome', 'saved',
    'requirement_id', req.id,
    'status', p_status,
    'summary', req.label||' marked '||p_status
  );
end $$;

-- ------------------------------------------------------------------ pc_claim_detail with attachment URLs
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
      select jsonb_agg(jsonb_build_object(
        'id', e.id,
        'label', e.label,
        'status', e.status,
        'media_asset_id', e.media_asset_id,
        'attachments', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', att.id,
            'media_asset_id', m.id,
            'file_name', m.file_name,
            'kind', m.kind,
            'bucket', m.bucket,
            'mime_type', m.mime_type,
            'storage_path', m.storage_path,
            'public_url', m.public_url,
            'url', coalesce(m.public_url, m.storage_path),
            'created_at', att.created_at
          ) order by att.created_at)
          from claim_evidence_attachments att
          join media_assets m on m.id = att.media_asset_id
          where att.requirement_id = e.id
        ), '[]'::jsonb)
      ) order by e.created_at)
      from claim_evidence_requirements e where e.claim_id = c.id
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'event_type', e.event_type, 'from_status', e.from_status, 'to_status', e.to_status,
        'note', e.note, 'created_at', e.created_at, 'visibility', e.visibility
      ) order by e.created_at)
      from claim_events e where e.claim_id = c.id
    ), '[]'::jsonb)
  );
end $$;

grant execute on function public.pc_attach_claim_evidence(uuid, uuid[], text, text) to authenticated;
grant execute on function public.pc_remove_claim_evidence_attachment(uuid, text, text) to authenticated;
grant execute on function public.pc_set_claim_evidence_status(uuid, text, text, text) to authenticated;
grant execute on function public.pc_claim_detail(uuid, text) to authenticated;
