-- Policy premium rates, policy/claim ledgers, section_code on affected cover,
-- overlap guard, Russ summarise/follow-up RPCs, extended detail payloads.

-- ------------------------------------------------------------------ tables
create table if not exists public.policy_premium_rates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  data_category text not null check (data_category in ('sample','live')),
  policy_id uuid not null,
  section_code text,
  insured_item_id uuid,
  amount numeric(14,2) not null,
  currency text not null default 'ZAR',
  frequency text not null check (frequency in ('monthly','quarterly','annually','single')),
  effective_from date not null,
  effective_to date,
  source text not null default 'broker',
  reason text,
  status text not null check (status in ('pending','confirmed','superseded')) default 'confirmed',
  included_in_policy boolean not null default false,
  breakdown_available boolean not null default true,
  source_ref text,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  unique (id, data_category),
  foreign key (policy_id, data_category) references policies (id, data_category)
);
create index if not exists policy_premium_rates_policy_idx on policy_premium_rates (tenant_id, data_category, policy_id, effective_from);
create unique index if not exists policy_premium_rates_source_ref_uidx
  on policy_premium_rates (tenant_id, data_category, policy_id, source_ref)
  where source_ref is not null;

create table if not exists public.policy_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  data_category text not null check (data_category in ('sample','live')),
  policy_id uuid not null,
  txn_type text not null check (txn_type in ('due','collection','reversal','refund','commission')),
  amount numeric(14,2) not null,
  currency text not null default 'ZAR',
  txn_date date not null,
  reference text,
  source text not null default 'broker',
  reconciliation_status text not null check (reconciliation_status in ('unreconciled','matched','exception')) default 'unreconciled',
  source_ref text,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  unique (id, data_category),
  foreign key (policy_id, data_category) references policies (id, data_category)
);
create index if not exists policy_transactions_policy_idx on policy_transactions (tenant_id, data_category, policy_id, txn_date);
create unique index if not exists policy_transactions_source_ref_uidx
  on policy_transactions (tenant_id, data_category, policy_id, source_ref)
  where source_ref is not null;

create table if not exists public.claim_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  data_category text not null check (data_category in ('sample','live')),
  claim_id uuid not null,
  txn_type text not null check (txn_type in ('payment','reversal','recovery')),
  payee text,
  amount numeric(14,2) not null,
  currency text not null default 'ZAR',
  status text not null check (status in ('pending','confirmed','reversed')) default 'confirmed',
  txn_date date not null,
  reference text,
  source_ref text,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  unique (id, data_category),
  foreign key (claim_id, data_category) references claims (id, data_category)
);
create index if not exists claim_transactions_claim_idx on claim_transactions (tenant_id, data_category, claim_id, txn_date);
create unique index if not exists claim_transactions_source_ref_uidx
  on claim_transactions (tenant_id, data_category, claim_id, source_ref)
  where source_ref is not null;

alter table public.claim_affected_items
  add column if not exists section_code text,
  add column if not exists policy_version_id uuid;

-- ------------------------------------------------------------------ RLS
alter table policy_premium_rates enable row level security;
alter table policy_transactions enable row level security;
alter table claim_transactions enable row level security;

drop policy if exists policy_premium_rates_staff on policy_premium_rates;
create policy policy_premium_rates_staff on policy_premium_rates for all
  using (tenant_id = app.tenant_id() and app.is_staff() and data_category = app.active_category())
  with check (tenant_id = app.tenant_id() and app.is_staff() and data_category = app.active_category());

drop policy if exists policy_transactions_staff on policy_transactions;
create policy policy_transactions_staff on policy_transactions for all
  using (tenant_id = app.tenant_id() and app.is_staff() and data_category = app.active_category())
  with check (tenant_id = app.tenant_id() and app.is_staff() and data_category = app.active_category());

drop policy if exists claim_transactions_staff on claim_transactions;
create policy claim_transactions_staff on claim_transactions for all
  using (tenant_id = app.tenant_id() and app.is_staff() and data_category = app.active_category())
  with check (tenant_id = app.tenant_id() and app.is_staff() and data_category = app.active_category());

-- Customers: rates + non-commission policy txns + claim txns for own person
drop policy if exists policy_premium_rates_customer on policy_premium_rates;
create policy policy_premium_rates_customer on policy_premium_rates for select to authenticated
  using (data_category = app.active_category() and policy_id in (
    select policy_id from policy_cover where person_id in (
      select cp.person_id from customer_persons cp where cp.customer_id = app.my_customer_id()
    )
  ));

drop policy if exists policy_transactions_customer on policy_transactions;
create policy policy_transactions_customer on policy_transactions for select to authenticated
  using (
    data_category = app.active_category()
    and txn_type <> 'commission'
    and policy_id in (
      select policy_id from policy_cover where person_id in (
        select cp.person_id from customer_persons cp where cp.customer_id = app.my_customer_id()
      )
    )
  );

drop policy if exists claim_transactions_customer on claim_transactions;
create policy claim_transactions_customer on claim_transactions for select to authenticated
  using (data_category = app.active_category() and claim_id in (
    select id from claims where person_id in (
      select cp.person_id from customer_persons cp where cp.customer_id = app.my_customer_id()
    )
  ));

-- ------------------------------------------------------------------ overlap helper
create or replace function app.pc_assert_no_version_overlap(p_policy_id uuid, p_effective_at timestamptz)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from policy_versions v
    where v.policy_id = p_policy_id
      and v.effective_at = p_effective_at
      and v.superseded_at is null
  ) then
    raise exception 'overlapping_confirmed_version' using errcode = 'P0001',
      message = 'A confirmed schedule version already starts on this effective date.';
  end if;
  if exists (
    select 1 from policy_versions v
    where v.policy_id = p_policy_id
      and v.superseded_at is null
      and v.effective_at > p_effective_at
  ) then
    raise exception 'overlapping_confirmed_version' using errcode = 'P0001',
      message = 'A later confirmed schedule version already exists; refuse ambiguous overlap.';
  end if;
end $$;
revoke all on function app.pc_assert_no_version_overlap(uuid, timestamptz) from public, anon, authenticated;

-- Patch confirm replacement to call overlap guard
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
  perform app.pc_assert_no_version_overlap(r.policy_id, p_confirmed_effective_at);
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
  update claims set version_review_needed = true,
    version_review_reason = coalesce(version_review_reason||' ','') || 'Policy history changed by backdated confirmation on '||r.reference,
    updated_at = now()
  where policy_id = r.policy_id and incident_at >= p_confirmed_effective_at and status not in ('closed')
    and (policy_version_id is distinct from new_v.id);
  get diagnostics flagged = row_count;
  return jsonb_build_object('outcome','saved','summary','Confirmed replacement; version '||new_v.version_no||' created'||case when flagged>0 then '; '||flagged||' claim(s) flagged' else '' end, 'version_id', new_v.id);
end $$;

-- ------------------------------------------------------------------ money RPCs
create or replace function public.pc_record_premium_rate(
  p_policy_id uuid, p_amount numeric, p_frequency text, p_effective_from date,
  p_reason text default null, p_source text default 'broker', p_section_code text default null,
  p_insured_item_id uuid default null, p_included_in_policy boolean default false,
  p_breakdown_available boolean default true, p_source_ref text default null,
  p_idempotency_key text default null, p_category text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare cat text := coalesce(p_category, app.active_category());
declare pc policy_cover%rowtype;
declare existing uuid;
declare rid uuid;
declare src text := coalesce(p_source_ref, p_idempotency_key);
begin
  perform app.pc_require_staff();
  select * into pc from policy_cover where policy_id = p_policy_id and data_category = cat and tenant_id = app.tenant_id();
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if app.book_restricted() and not app.can_see_person(pc.person_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if src is not null then
    select id into existing from policy_premium_rates where policy_id = p_policy_id and data_category = cat and source_ref = src;
    if existing is not null then
      return jsonb_build_object('outcome','saved','rate_id', existing, 'summary','Premium rate already recorded','replayed', true);
    end if;
  end if;
  update policy_premium_rates set status = 'superseded', effective_to = p_effective_from - 1
   where policy_id = p_policy_id and data_category = cat and status = 'confirmed'
     and (effective_to is null or effective_to >= p_effective_from);
  insert into policy_premium_rates (
    tenant_id, data_category, policy_id, section_code, insured_item_id, amount, frequency,
    effective_from, source, reason, status, included_in_policy, breakdown_available, source_ref, created_by
  ) values (
    app.tenant_id(), cat, p_policy_id, p_section_code, p_insured_item_id, p_amount, p_frequency,
    p_effective_from, p_source, p_reason, 'confirmed', p_included_in_policy, p_breakdown_available, src, auth.uid()
  ) returning id into rid;
  update policies set premium_amount = p_amount, premium_frequency = p_frequency, updated_at = now() where id = p_policy_id;
  return jsonb_build_object('outcome','saved','rate_id', rid, 'summary','Premium rate recorded');
end $$;

create or replace function public.pc_record_policy_transaction(
  p_policy_id uuid, p_txn_type text, p_amount numeric, p_txn_date date,
  p_reference text default null, p_source text default 'broker',
  p_reconciliation_status text default 'unreconciled',
  p_source_ref text default null, p_idempotency_key text default null, p_category text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare cat text := coalesce(p_category, app.active_category());
declare pc policy_cover%rowtype;
declare existing uuid;
declare tid uuid;
declare src text := coalesce(p_source_ref, p_idempotency_key);
begin
  perform app.pc_require_staff();
  select * into pc from policy_cover where policy_id = p_policy_id and data_category = cat and tenant_id = app.tenant_id();
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if app.book_restricted() and not app.can_see_person(pc.person_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if src is not null then
    select id into existing from policy_transactions where policy_id = p_policy_id and data_category = cat and source_ref = src;
    if existing is not null then
      return jsonb_build_object('outcome','saved','transaction_id', existing, 'summary','Policy transaction already recorded','replayed', true);
    end if;
  end if;
  insert into policy_transactions (
    tenant_id, data_category, policy_id, txn_type, amount, txn_date, reference, source, reconciliation_status, source_ref, created_by
  ) values (
    app.tenant_id(), cat, p_policy_id, p_txn_type, p_amount, p_txn_date, p_reference, p_source, p_reconciliation_status, src, auth.uid()
  ) returning id into tid;
  return jsonb_build_object('outcome','saved','transaction_id', tid, 'summary','Policy transaction recorded');
end $$;

create or replace function public.pc_record_claim_transaction(
  p_claim_id uuid, p_txn_type text, p_amount numeric, p_txn_date date,
  p_payee text default null, p_reference text default null, p_status text default 'confirmed',
  p_source_ref text default null, p_idempotency_key text default null, p_category text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare cat text := coalesce(p_category, app.active_category());
declare c claims%rowtype;
declare existing uuid;
declare tid uuid;
declare src text := coalesce(p_source_ref, p_idempotency_key);
declare approved numeric;
declare paid numeric;
declare outstanding numeric;
begin
  perform app.pc_require_staff();
  select * into c from claims where id = p_claim_id and data_category = cat and tenant_id = app.tenant_id();
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if app.book_restricted() and not app.can_see_person(c.person_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if src is not null then
    select id into existing from claim_transactions where claim_id = p_claim_id and data_category = cat and source_ref = src;
    if existing is not null then
      approved := coalesce(c.settlement_amount, 0);
      select coalesce(sum(case when txn_type = 'payment' and status = 'confirmed' then amount
                               when txn_type = 'reversal' and status = 'confirmed' then -amount else 0 end), 0)
        into paid from claim_transactions where claim_id = p_claim_id and data_category = cat;
      outstanding := greatest(approved - paid, 0);
      return jsonb_build_object(
        'outcome','saved','transaction_id', existing, 'summary','Claim transaction already recorded','replayed', true,
        'approved_settlement', approved, 'confirmed_payments', paid, 'outstanding', outstanding
      );
    end if;
  end if;
  insert into claim_transactions (
    tenant_id, data_category, claim_id, txn_type, payee, amount, status, txn_date, reference, source_ref, created_by
  ) values (
    app.tenant_id(), cat, p_claim_id, p_txn_type, p_payee, p_amount, p_status, p_txn_date, p_reference, src, auth.uid()
  ) returning id into tid;
  insert into claim_events (tenant_id, data_category, claim_id, event_type, actor_user_id, note, visibility, idempotency_key, payload)
  values (app.tenant_id(), cat, p_claim_id, 'settlement_txn', auth.uid(),
    initcap(p_txn_type)||' R'||p_amount::text, 'internal', p_idempotency_key,
    jsonb_build_object('transaction_id', tid, 'txn_type', p_txn_type, 'amount', p_amount));
  approved := coalesce(c.settlement_amount, 0);
  select coalesce(sum(case when txn_type = 'payment' and status = 'confirmed' then amount
                           when txn_type = 'reversal' and status = 'confirmed' then -amount else 0 end), 0)
    into paid from claim_transactions where claim_id = p_claim_id and data_category = cat;
  outstanding := greatest(approved - paid, 0);
  return jsonb_build_object(
    'outcome','saved','transaction_id', tid, 'summary','Claim '||p_txn_type||' recorded',
    'approved_settlement', approved, 'confirmed_payments', paid, 'outstanding', outstanding
  );
end $$;

create or replace function public.pc_claim_settlement_summary(p_claim_id uuid, p_category text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cat text := coalesce(p_category, app.active_category());
declare c claims%rowtype;
declare paid numeric;
declare recoveries numeric;
begin
  perform app.pc_require_staff();
  select * into c from claims where id = p_claim_id and data_category = cat and tenant_id = app.tenant_id();
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if app.book_restricted() and not app.can_see_person(c.person_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  select coalesce(sum(case when txn_type = 'payment' and status = 'confirmed' then amount
                           when txn_type = 'reversal' and status = 'confirmed' then -amount else 0 end), 0),
         coalesce(sum(case when txn_type = 'recovery' and status = 'confirmed' then amount else 0 end), 0)
    into paid, recoveries
  from claim_transactions where claim_id = p_claim_id and data_category = cat;
  return jsonb_build_object(
    'approved_settlement', coalesce(c.settlement_amount, 0),
    'confirmed_payments', paid,
    'outstanding', greatest(coalesce(c.settlement_amount, 0) - paid, 0),
    'recoveries', recoveries,
    'transactions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'txn_type', t.txn_type, 'payee', t.payee, 'amount', t.amount,
        'status', t.status, 'txn_date', t.txn_date, 'reference', t.reference, 'source_ref', t.source_ref
      ) order by t.txn_date, t.created_at)
      from claim_transactions t where t.claim_id = p_claim_id
    ), '[]'::jsonb)
  );
end $$;

-- ------------------------------------------------------------------ Russ bulk
create or replace function public.pc_russ_summarise_cover(
  p_claim_id uuid, p_loss_at timestamptz default null, p_idempotency_key text default null, p_category text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare cat text := coalesce(p_category, app.active_category());
declare c claims%rowtype;
declare loss timestamptz;
declare resolved jsonb;
declare vid uuid;
declare items text;
begin
  perform app.pc_require_staff();
  select * into c from claims where id = p_claim_id and data_category = cat and tenant_id = app.tenant_id();
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if app.book_restricted() and not app.can_see_person(c.person_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if c.policy_id is null then
    return jsonb_build_object('outcome','skipped','summary','No policy linked — schedule summary unavailable',
      'schedule_path', '/broker/claims/'||c.id);
  end if;
  loss := coalesce(p_loss_at, c.incident_at);
  resolved := public.pc_resolve_policy_version(c.policy_id, loss, c.incident_time_unknown);
  vid := (resolved->>'version_id')::uuid;
  if vid is null then
    return jsonb_build_object(
      'outcome','skipped','summary', coalesce(resolved->>'reason','Schedule required for loss date'),
      'schedule_path', '/broker/policies/'||c.policy_id
    );
  end if;
  select string_agg(ii.display_label || ' (' || ii.item_type || ')', ', ')
    into items
  from policy_version_items pvi
  join insured_items ii on ii.id = pvi.insured_item_id
  where pvi.policy_version_id = vid;
  return jsonb_build_object(
    'outcome','ok',
    'summary', 'Cover on '||to_char(loss, 'YYYY-MM-DD')||': '||coalesce(items, 'no items')||
      case when coalesce((resolved->>'review_needed')::boolean, false) then ' · review needed' else '' end,
    'schedule_path', '/broker/policies/'||c.policy_id,
    'policy_version_id', vid
  );
end $$;

create or replace function public.pc_russ_create_followups(
  p_claim_id uuid, p_idempotency_key text default null, p_category text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare cat text := coalesce(p_category, app.active_category());
declare c claims%rowtype;
declare key text := coalesce(p_idempotency_key, 'russ-followup:'||p_claim_id::text);
begin
  perform app.pc_require_staff();
  select * into c from claims where id = p_claim_id and data_category = cat and tenant_id = app.tenant_id();
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if app.book_restricted() and not app.can_see_person(c.person_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if exists (select 1 from claim_events where claim_id = c.id and idempotency_key = key and event_type = 'russ_followup') then
    return jsonb_build_object('outcome','skipped','summary','Follow-up already created for this claim','replayed', true);
  end if;
  insert into claim_events (tenant_id, data_category, claim_id, event_type, actor_user_id, note, visibility, idempotency_key, payload)
  values (app.tenant_id(), cat, c.id, 'russ_followup', auth.uid(),
    'Russ created follow-up task', 'internal', key,
    jsonb_build_object('due_at', (now() + interval '2 days')));
  insert into case_shared_notes (tenant_id, data_category, claim_id, body, shared_with_customer, created_by)
  values (app.tenant_id(), cat, c.id, 'Follow-up: progress claim '||c.reference||' — next action due in 2 days.', false, auth.uid());
  update claims set next_action = 'Follow up claim',
    due_at = coalesce(due_at, now() + interval '2 days'), updated_at = now()
  where id = c.id;
  return jsonb_build_object(
    'outcome','ok',
    'summary', 'Follow-up recorded on '||c.reference||' and client timeline'
  );
end $$;

-- Stamp section_code on create claim affected rows
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
    insert into claim_affected_items (tenant_id, data_category, claim_id, insured_item_id, display_label, item_type, snapshot, section_code, policy_version_id)
    select app.tenant_id(), cat, c.id, ii.id, ii.display_label, ii.item_type, ii.details, ii.item_type, vid
    from insured_items ii where ii.id = item_id;
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

-- Extended detail payloads
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
      select jsonb_agg(jsonb_build_object('id', v.id, 'version_no', v.version_no, 'effective_at', v.effective_at, 'superseded_at', v.superseded_at) order by v.version_no)
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

create or replace function public.pc_claim_detail(p_claim_id uuid, p_category text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cat text := coalesce(p_category, app.active_category());
declare c claims%rowtype;
declare paid numeric;
declare recoveries numeric;
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

grant execute on function public.pc_record_premium_rate(uuid,numeric,text,date,text,text,text,uuid,boolean,boolean,text,text,text) to authenticated;
grant execute on function public.pc_record_policy_transaction(uuid,text,numeric,date,text,text,text,text,text,text) to authenticated;
grant execute on function public.pc_record_claim_transaction(uuid,text,numeric,date,text,text,text,text,text,text) to authenticated;
grant execute on function public.pc_claim_settlement_summary(uuid,text) to authenticated;
grant execute on function public.pc_russ_summarise_cover(uuid,timestamptz,text,text) to authenticated;
grant execute on function public.pc_russ_create_followups(uuid,text,text) to authenticated;
