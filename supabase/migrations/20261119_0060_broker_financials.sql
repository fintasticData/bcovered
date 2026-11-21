-- Broker financials: scales, earnings, statements, receipts, payouts (sample/live scoped).
-- Demo mutations refuse live category. Does not alter the CL-S1001 R850→R920 walkthrough seed.

-- ------------------------------------------------------------------ tables
create table if not exists public.commission_scales (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  data_category text not null check (data_category in ('sample','live')),
  name text not null,
  insurer_id uuid references insurers(id),
  product_line text,
  cover_section text,
  is_active boolean not null default true,
  scenario_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, data_category)
);
create index if not exists commission_scales_tenant_idx
  on commission_scales (tenant_id, data_category, is_active);

create table if not exists public.commission_scale_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  data_category text not null check (data_category in ('sample','live')),
  scale_id uuid not null,
  version_no int not null default 1,
  earning_type text not null check (earning_type in ('new_business','renewal','ongoing','endorsement','clawback','service_fee')),
  calc_method text not null check (calc_method in ('percent','fixed','tiered','provider_stated')),
  basis text not null default 'eligible_monthly_premium'
    check (basis in ('eligible_monthly_premium','eligible_annual_premium','fixed','provider_stated')),
  rate numeric(8,6),
  fixed_amount numeric(14,2),
  tier_mode text check (tier_mode is null or tier_mode in ('progressive','flat_on_whole')),
  tiers jsonb not null default '[]',
  effective_from date not null,
  effective_to date,
  match_specificity int not null default 0,
  scenario_id text,
  created_at timestamptz not null default now(),
  unique (id, data_category),
  unique (scale_id, version_no, data_category),
  foreign key (scale_id, data_category) references commission_scales (id, data_category)
);

create table if not exists public.commission_split_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  data_category text not null check (data_category in ('sample','live')),
  scale_version_id uuid not null,
  recipient_role text not null check (recipient_role in ('brokerage','adviser','sub_broker','franchise')),
  recipient_user_id uuid references app_users(id),
  recipient_member_id uuid,
  recipient_name text,
  share_percent numeric(7,4) not null check (share_percent >= 0 and share_percent <= 100),
  section_scope text,
  scenario_id text,
  unique (id, data_category),
  foreign key (scale_version_id, data_category) references commission_scale_versions (id, data_category)
);
create index if not exists commission_split_lines_version_idx
  on commission_split_lines (scale_version_id, data_category);

create table if not exists public.commission_earnings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  data_category text not null check (data_category in ('sample','live')),
  customer_id uuid references customers(id),
  person_id uuid,
  policy_id uuid,
  insurer_id uuid references insurers(id),
  scale_version_id uuid,
  earning_type text not null,
  calc_method text not null,
  basis text not null,
  period date not null,
  section_code text,
  eligible_amount numeric(14,2) not null,
  rate numeric(8,6),
  gross_amount numeric(14,2) not null,
  currency text not null default 'ZAR',
  event_ref text not null,
  adjustment_of uuid,
  hold_reason text,
  statement_matched boolean not null default false,
  cash_received_amount numeric(14,2) not null default 0,
  scenario_id text,
  source_ref text,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  unique (id, data_category),
  unique (tenant_id, data_category, event_ref)
);
create index if not exists commission_earnings_policy_idx
  on commission_earnings (tenant_id, data_category, policy_id, period);
create index if not exists commission_earnings_scenario_idx
  on commission_earnings (tenant_id, data_category, scenario_id)
  where scenario_id is not null;

create table if not exists public.commission_allocations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  data_category text not null check (data_category in ('sample','live')),
  earning_id uuid not null,
  recipient_role text not null check (recipient_role in ('brokerage','adviser','sub_broker','franchise')),
  recipient_user_id uuid references app_users(id),
  recipient_member_id uuid,
  recipient_name text,
  share_percent numeric(7,4) not null,
  amount numeric(14,2) not null,
  payable_amount numeric(14,2) not null default 0,
  paid_amount numeric(14,2) not null default 0,
  scenario_id text,
  source_ref text,
  created_at timestamptz not null default now(),
  unique (id, data_category),
  foreign key (earning_id, data_category) references commission_earnings (id, data_category) on delete cascade
);
create index if not exists commission_allocations_earning_idx
  on commission_allocations (earning_id, data_category);

create table if not exists public.commission_statement_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  data_category text not null check (data_category in ('sample','live')),
  insurer_id uuid references insurers(id),
  period date not null,
  label text not null,
  status text not null default 'open' check (status in ('open','matched','exception','closed')),
  scenario_id text,
  source_ref text,
  created_at timestamptz not null default now(),
  unique (id, data_category)
);

create table if not exists public.commission_statement_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  data_category text not null check (data_category in ('sample','live')),
  batch_id uuid not null,
  policy_id uuid,
  customer_id uuid,
  section_code text,
  period date not null,
  reported_amount numeric(14,2) not null,
  expected_amount numeric(14,2),
  variance numeric(14,2),
  match_status text not null default 'unmatched'
    check (match_status in ('unmatched','matched','exception','ignored')),
  earning_id uuid,
  exception_note text,
  scenario_id text,
  source_ref text,
  created_at timestamptz not null default now(),
  unique (id, data_category),
  foreign key (batch_id, data_category) references commission_statement_batches (id, data_category) on delete cascade
);
create index if not exists commission_statement_lines_batch_idx
  on commission_statement_lines (batch_id, data_category);

create table if not exists public.commission_receipts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  data_category text not null check (data_category in ('sample','live')),
  insurer_id uuid references insurers(id),
  amount numeric(14,2) not null,
  received_on date not null,
  reference text,
  is_simulated boolean not null default true,
  scenario_id text,
  source_ref text,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  unique (id, data_category)
);

create table if not exists public.commission_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  data_category text not null check (data_category in ('sample','live')),
  receipt_id uuid not null,
  earning_id uuid not null,
  amount numeric(14,2) not null,
  scenario_id text,
  source_ref text,
  unique (id, data_category),
  foreign key (receipt_id, data_category) references commission_receipts (id, data_category) on delete cascade,
  foreign key (earning_id, data_category) references commission_earnings (id, data_category)
);

create table if not exists public.commission_payouts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  data_category text not null check (data_category in ('sample','live')),
  allocation_id uuid not null,
  amount numeric(14,2) not null,
  paid_on date not null,
  reference text,
  is_simulated boolean not null default true,
  scenario_id text,
  source_ref text,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  unique (id, data_category),
  foreign key (allocation_id, data_category) references commission_allocations (id, data_category)
);

create table if not exists public.broker_financials_scenario_state (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  data_category text not null check (data_category in ('sample','live')),
  scenario_id text not null,
  step_index int not null default 0,
  status text not null default 'idle' check (status in ('idle','running','blocked','complete')),
  last_summary text,
  blocked_reason text,
  updated_at timestamptz not null default now(),
  unique (tenant_id, data_category, scenario_id)
);

-- ------------------------------------------------------------------ RLS
do $$
declare t text;
begin
  foreach t in array array[
    'commission_scales','commission_scale_versions','commission_split_lines',
    'commission_earnings','commission_allocations',
    'commission_statement_batches','commission_statement_lines',
    'commission_receipts','commission_receipt_lines','commission_payouts',
    'broker_financials_scenario_state'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I_staff on public.%I', t, t);
    execute format(
      'create policy %I_staff on public.%I for all using (tenant_id = app.tenant_id() and app.is_staff() and data_category = app.active_category()) with check (tenant_id = app.tenant_id() and app.is_staff() and data_category = app.active_category())',
      t, t
    );
  end loop;
end $$;

-- ------------------------------------------------------------------ helpers
create or replace function app.bf_require_demo(p_category text)
returns text language plpgsql as $$
declare cat text := coalesce(p_category, app.active_category(), 'sample');
begin
  if not app.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  if cat <> 'sample' then
    raise exception 'demo_only: broker financials mutations are Demo-only and never run in Production'
      using errcode = 'P0001';
  end if;
  return cat;
end $$;

create or replace function app.bf_calc_amount(
  p_eligible numeric, p_method text, p_rate numeric, p_fixed numeric
) returns numeric language sql immutable as $$
  select case
    when p_method = 'fixed' then coalesce(p_fixed, 0)
    when p_method = 'provider_stated' then coalesce(p_fixed, 0)
    else round(coalesce(p_eligible, 0) * coalesce(p_rate, 0), 2)
  end;
$$;

-- ------------------------------------------------------------------ list / detail RPCs
create or replace function public.bf_list_transactions(
  p_period date default null,
  p_policy_id uuid default null,
  p_customer_id uuid default null,
  p_category text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare cat text := coalesce(p_category, app.active_category(), 'sample');
begin
  if not app.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(row_to_json(x)::jsonb order by x.period desc, x.created_at desc)
    from (
      select e.id, e.period, e.earning_type as txn_type, e.gross_amount as amount,
        e.statement_matched, e.cash_received_amount,
        e.policy_id, e.customer_id, e.person_id, e.section_code, e.event_ref,
        e.hold_reason, e.scenario_id, e.created_at,
        c.full_name as customer_name, p.policy_number,
        (select coalesce(sum(a.payable_amount),0) from commission_allocations a
          where a.earning_id = e.id and a.data_category = e.data_category and a.recipient_role <> 'brokerage') as adviser_payable,
        case
          when e.hold_reason is not null then 'held'
          when e.cash_received_amount >= e.gross_amount and exists (
            select 1 from commission_allocations a
            where a.earning_id = e.id and a.recipient_role <> 'brokerage' and a.payable_amount = 0 and a.paid_amount > 0
          ) then 'paid_out'
          when e.cash_received_amount > 0 then 'cash_received'
          when e.statement_matched then 'statement_matched'
          else 'earned'
        end as status
      from commission_earnings e
      left join customers c on c.id = e.customer_id
      left join policies p on p.id = e.policy_id and p.data_category = e.data_category
      where e.tenant_id = app.tenant_id() and e.data_category = cat
        and (p_period is null or e.period = p_period)
        and (p_policy_id is null or e.policy_id = p_policy_id)
        and (p_customer_id is null or e.customer_id = p_customer_id)
    ) x
  ), '[]'::jsonb);
end $$;

create or replace function public.bf_get_earning(
  p_earning_id uuid, p_category text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare cat text := coalesce(p_category, app.active_category(), 'sample');
declare e commission_earnings%rowtype;
begin
  if not app.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into e from commission_earnings
   where id = p_earning_id and tenant_id = app.tenant_id() and data_category = cat;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  return jsonb_build_object(
    'earning', row_to_json(e)::jsonb,
    'allocations', coalesce((
      select jsonb_agg(row_to_json(a)::jsonb) from commission_allocations a
      where a.earning_id = e.id and a.data_category = cat
    ), '[]'::jsonb),
    'scale_version', (
      select row_to_json(v)::jsonb from commission_scale_versions v where v.id = e.scale_version_id
    ),
    'customer_name', (select full_name from customers where id = e.customer_id),
    'policy_number', (select policy_number from policies where id = e.policy_id and data_category = cat)
  );
end $$;

create or replace function public.bf_list_statements(p_category text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cat text := coalesce(p_category, app.active_category(), 'sample');
begin
  if not app.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'batch', row_to_json(b)::jsonb,
      'insurer_name', (select name from insurers where id = b.insurer_id),
      'lines', coalesce((
        select jsonb_agg(row_to_json(l)::jsonb order by l.created_at)
        from commission_statement_lines l where l.batch_id = b.id and l.data_category = cat
      ), '[]'::jsonb)
    ) order by b.period desc)
    from commission_statement_batches b
    where b.tenant_id = app.tenant_id() and b.data_category = cat
  ), '[]'::jsonb);
end $$;

create or replace function public.bf_list_payouts(p_category text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cat text := coalesce(p_category, app.active_category(), 'sample');
begin
  if not app.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'payout', row_to_json(p)::jsonb,
      'allocation', row_to_json(a)::jsonb,
      'earning_id', a.earning_id,
      'policy_id', e.policy_id,
      'customer_id', e.customer_id,
      'customer_name', (select full_name from customers where id = e.customer_id),
      'policy_number', (select policy_number from policies where id = e.policy_id and data_category = cat)
    ) order by p.paid_on desc, p.created_at desc)
    from commission_payouts p
    join commission_allocations a on a.id = p.allocation_id and a.data_category = p.data_category
    join commission_earnings e on e.id = a.earning_id and e.data_category = p.data_category
    where p.tenant_id = app.tenant_id() and p.data_category = cat
  ), '[]'::jsonb);
end $$;

create or replace function public.bf_list_scales(p_category text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cat text := coalesce(p_category, app.active_category(), 'sample');
begin
  if not app.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'scale', row_to_json(s)::jsonb,
      'insurer_name', (select name from insurers where id = s.insurer_id),
      'versions', coalesce((
        select jsonb_agg(jsonb_build_object(
          'version', row_to_json(v)::jsonb,
          'splits', coalesce((
            select jsonb_agg(row_to_json(sp)::jsonb) from commission_split_lines sp
            where sp.scale_version_id = v.id and sp.data_category = cat
          ), '[]'::jsonb)
        ) order by v.version_no desc)
        from commission_scale_versions v where v.scale_id = s.id and v.data_category = cat
      ), '[]'::jsonb)
    ) order by s.name)
    from commission_scales s
    where s.tenant_id = app.tenant_id() and s.data_category = cat
  ), '[]'::jsonb);
end $$;

-- ------------------------------------------------------------------ resolve + preview + post
create or replace function public.bf_resolve_scale(
  p_insurer_id uuid, p_product_line text, p_section text, p_on date,
  p_category text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare cat text := coalesce(p_category, app.active_category(), 'sample');
declare matches jsonb;
declare n int;
begin
  if not app.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'scale_id', s.id, 'scale_name', s.name, 'version_id', v.id, 'version_no', v.version_no,
    'earning_type', v.earning_type, 'calc_method', v.calc_method, 'basis', v.basis,
    'rate', v.rate, 'fixed_amount', v.fixed_amount, 'match_specificity', v.match_specificity,
    'why', format('Matches %s / %s / %s effective %s',
      coalesce((select name from insurers where id = s.insurer_id), 'any insurer'),
      coalesce(s.product_line, 'any product'),
      coalesce(s.cover_section, 'any section'), v.effective_from)
  ) order by v.match_specificity desc, v.effective_from desc), '[]'::jsonb)
  into matches
  from commission_scales s
  join commission_scale_versions v on v.scale_id = s.id and v.data_category = s.data_category
  where s.tenant_id = app.tenant_id() and s.data_category = cat and s.is_active
    and (s.insurer_id is null or s.insurer_id = p_insurer_id)
    and (s.product_line is null or s.product_line = p_product_line)
    and (s.cover_section is null or s.cover_section = p_section)
    and v.effective_from <= p_on
    and (v.effective_to is null or v.effective_to >= p_on);

  n := jsonb_array_length(matches);
  if n = 0 then
    return jsonb_build_object('outcome','hold','reason','No matching commission scale','matches', matches);
  end if;
  if n > 1 and (matches->0->>'match_specificity') = (matches->1->>'match_specificity') then
    return jsonb_build_object('outcome','hold','reason','Two equally specific scales match','matches', matches);
  end if;
  return jsonb_build_object('outcome','ok','selected', matches->0, 'matches', matches);
end $$;

create or replace function public.bf_preview_commission(
  p_eligible_amount numeric,
  p_insurer_id uuid,
  p_product_line text,
  p_section text,
  p_on date default current_date,
  p_category text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare cat text := coalesce(p_category, app.active_category(), 'sample');
declare resolved jsonb;
declare vid uuid;
declare rate numeric;
declare method text;
declare gross numeric;
declare splits jsonb;
begin
  if not app.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  resolved := public.bf_resolve_scale(p_insurer_id, p_product_line, p_section, p_on, cat);
  if resolved->>'outcome' <> 'ok' then return resolved || jsonb_build_object('eligible_amount', p_eligible_amount); end if;
  vid := (resolved->'selected'->>'version_id')::uuid;
  rate := (resolved->'selected'->>'rate')::numeric;
  method := resolved->'selected'->>'calc_method';
  gross := app.bf_calc_amount(p_eligible_amount, method, rate, (resolved->'selected'->>'fixed_amount')::numeric);
  select coalesce(jsonb_agg(jsonb_build_object(
    'recipient_role', sp.recipient_role,
    'recipient_name', sp.recipient_name,
    'share_percent', sp.share_percent,
    'amount', round(gross * sp.share_percent / 100.0, 2),
    'section_scope', sp.section_scope
  )), '[]'::jsonb)
  into splits
  from commission_split_lines sp
  where sp.scale_version_id = vid and sp.data_category = cat
    and (sp.section_scope is null or sp.section_scope = p_section);
  return jsonb_build_object(
    'outcome','ok',
    'eligible_amount', p_eligible_amount,
    'rate', rate,
    'gross_amount', gross,
    'selected', resolved->'selected',
    'splits', splits
  );
end $$;

create or replace function public.bf_post_earning(
  p_policy_id uuid,
  p_eligible_amount numeric,
  p_period date,
  p_section text default null,
  p_earning_type text default 'ongoing',
  p_event_ref text default null,
  p_scenario_id text default null,
  p_category text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare cat text;
declare pol policies%rowtype;
declare pc policy_cover%rowtype;
declare resolved jsonb;
declare vid uuid;
declare rate numeric;
declare method text;
declare basis text;
declare gross numeric;
declare eid uuid;
declare existing uuid;
declare prior numeric;
declare delta numeric;
declare event text;
declare sp record;
declare alloc_amt numeric;
declare payable numeric;
begin
  cat := app.bf_require_demo(p_category);
  select * into pol from policies where id = p_policy_id and tenant_id = app.tenant_id() and data_category = cat;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into pc from policy_cover where policy_id = pol.id and data_category = cat limit 1;
  event := coalesce(p_event_ref, format('earn:%s:%s:%s', pol.id, p_period, coalesce(p_section,'all')));
  select id into existing from commission_earnings
   where tenant_id = app.tenant_id() and data_category = cat and event_ref = event;
  if existing is not null then
    return jsonb_build_object('outcome','saved','earning_id', existing, 'summary','Earning already posted','replayed', true);
  end if;

  select coalesce(sum(gross_amount),0) into prior from commission_earnings
   where tenant_id = app.tenant_id() and data_category = cat and policy_id = pol.id
     and period = p_period and coalesce(section_code,'') = coalesce(p_section,'');

  resolved := public.bf_resolve_scale(pol.provider_id, pol.line, p_section, p_period, cat);
  if resolved->>'outcome' <> 'ok' then
    insert into commission_earnings (
      tenant_id, data_category, customer_id, person_id, policy_id, insurer_id,
      earning_type, calc_method, basis, period, section_code, eligible_amount, rate, gross_amount,
      event_ref, hold_reason, scenario_id, source_ref, created_by
    ) values (
      app.tenant_id(), cat, pol.customer_id, pc.person_id, pol.id, pol.provider_id,
      p_earning_type, 'percent', 'eligible_monthly_premium', p_period, p_section, p_eligible_amount, null, 0,
      event, resolved->>'reason', p_scenario_id, event, auth.uid()
    ) returning id into eid;
    return jsonb_build_object('outcome','held','earning_id', eid, 'reason', resolved->>'reason', 'summary','Commission held for review');
  end if;

  vid := (resolved->'selected'->>'version_id')::uuid;
  rate := (resolved->'selected'->>'rate')::numeric;
  method := resolved->'selected'->>'calc_method';
  basis := resolved->'selected'->>'basis';
  gross := app.bf_calc_amount(p_eligible_amount, method, rate, (resolved->'selected'->>'fixed_amount')::numeric);
  delta := gross - prior;
  if delta = 0 and prior > 0 then
    return jsonb_build_object('outcome','saved','summary','No adjustment required; period already at target', 'gross_amount', gross, 'prior', prior);
  end if;
  if prior > 0 then
    gross := delta;
    event := event || ':adj';
    select id into existing from commission_earnings
     where tenant_id = app.tenant_id() and data_category = cat and event_ref = event;
    if existing is not null then
      return jsonb_build_object('outcome','saved','earning_id', existing, 'summary','Adjustment already posted','replayed', true);
    end if;
  end if;

  insert into commission_earnings (
    tenant_id, data_category, customer_id, person_id, policy_id, insurer_id, scale_version_id,
    earning_type, calc_method, basis, period, section_code, eligible_amount, rate, gross_amount,
    event_ref, adjustment_of, scenario_id, source_ref, created_by
  ) values (
    app.tenant_id(), cat, pol.customer_id, pc.person_id, pol.id, pol.provider_id, vid,
    coalesce(nullif(p_earning_type,''), resolved->'selected'->>'earning_type'), method, basis,
    p_period, p_section, p_eligible_amount, rate, gross,
    event, null, p_scenario_id, event, auth.uid()
  ) returning id into eid;

  for sp in
    select * from commission_split_lines
    where scale_version_id = vid and data_category = cat
      and (section_scope is null or section_scope = p_section)
  loop
    alloc_amt := round(gross * sp.share_percent / 100.0, 2);
    payable := case when sp.recipient_role = 'brokerage' then 0 else alloc_amt end;
    insert into commission_allocations (
      tenant_id, data_category, earning_id, recipient_role, recipient_user_id, recipient_member_id,
      recipient_name, share_percent, amount, payable_amount, paid_amount, scenario_id, source_ref
    ) values (
      app.tenant_id(), cat, eid, sp.recipient_role, sp.recipient_user_id, sp.recipient_member_id,
      sp.recipient_name, sp.share_percent, alloc_amt, payable, 0, p_scenario_id,
      event || ':' || sp.recipient_role
    );
  end loop;

  return jsonb_build_object(
    'outcome','saved','earning_id', eid, 'gross_amount', gross, 'prior', prior,
    'selected', resolved->'selected',
    'summary', format('Posted commission R%s for period %s', gross, p_period)
  );
end $$;

create or replace function public.bf_match_statement_line(
  p_line_id uuid, p_earning_id uuid default null, p_category text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare cat text;
declare line commission_statement_lines%rowtype;
declare earning commission_earnings%rowtype;
declare expected numeric;
declare variance numeric;
declare eid uuid;
begin
  cat := app.bf_require_demo(p_category);
  select * into line from commission_statement_lines
   where id = p_line_id and tenant_id = app.tenant_id() and data_category = cat;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;

  if p_earning_id is not null then
    eid := p_earning_id;
  else
    select id into eid from commission_earnings
     where tenant_id = app.tenant_id() and data_category = cat
       and policy_id is not distinct from line.policy_id
       and period = line.period
       and coalesce(section_code,'') = coalesce(line.section_code,'')
       and hold_reason is null
     order by created_at desc limit 1;
  end if;
  if eid is null then
    update commission_statement_lines set match_status = 'exception',
      exception_note = 'No earning found for policy/period', variance = coalesce(expected_amount,0) - reported_amount
    where id = line.id;
    return jsonb_build_object('outcome','exception','summary','No earning to match','variance', coalesce(line.expected_amount,0) - line.reported_amount);
  end if;

  select * into earning from commission_earnings where id = eid and data_category = cat;
  select coalesce(sum(gross_amount),0) into expected from commission_earnings
   where tenant_id = app.tenant_id() and data_category = cat
     and policy_id is not distinct from line.policy_id
     and period = line.period
     and coalesce(section_code,'') = coalesce(line.section_code,'')
     and hold_reason is null;
  variance := expected - line.reported_amount;

  if variance = 0 then
    update commission_statement_lines set
      match_status = 'matched', earning_id = eid, expected_amount = expected, variance = 0, exception_note = null
    where id = line.id;
    update commission_earnings set statement_matched = true where id = eid;
    update commission_statement_batches b set status = 'matched'
     where id = line.batch_id
       and not exists (
         select 1 from commission_statement_lines l
         where l.batch_id = b.id and l.match_status in ('unmatched','exception')
       );
    return jsonb_build_object('outcome','matched','expected', expected, 'reported', line.reported_amount, 'variance', 0,
      'summary', format('Matched R%s — cash received remains R%s', expected, earning.cash_received_amount));
  end if;

  update commission_statement_lines set
    match_status = 'exception', earning_id = eid, expected_amount = expected, variance = variance,
    exception_note = format('Shortfall/variance R%s', variance)
  where id = line.id;
  update commission_statement_batches set status = 'exception' where id = line.batch_id;
  return jsonb_build_object('outcome','exception','expected', expected, 'reported', line.reported_amount, 'variance', variance,
    'summary', format('Variance R%s left open until resolved', variance));
end $$;

create or replace function public.bf_record_receipt(
  p_earning_id uuid, p_amount numeric, p_received_on date default current_date,
  p_reference text default null, p_event_ref text default null,
  p_scenario_id text default null, p_category text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare cat text;
declare e commission_earnings%rowtype;
declare rid uuid;
declare src text;
declare outstanding numeric;
begin
  cat := app.bf_require_demo(p_category);
  select * into e from commission_earnings
   where id = p_earning_id and tenant_id = app.tenant_id() and data_category = cat;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  src := coalesce(p_event_ref, format('receipt:%s:%s', e.id, p_amount));
  if exists (select 1 from commission_receipts where tenant_id = app.tenant_id() and data_category = cat and source_ref = src) then
    select id into rid from commission_receipts where tenant_id = app.tenant_id() and data_category = cat and source_ref = src;
    return jsonb_build_object('outcome','saved','receipt_id', rid, 'summary','Receipt already recorded','replayed', true);
  end if;
  insert into commission_receipts (
    tenant_id, data_category, insurer_id, amount, received_on, reference, is_simulated, scenario_id, source_ref, created_by
  ) values (
    app.tenant_id(), cat, e.insurer_id, p_amount, p_received_on, p_reference, true, p_scenario_id, src, auth.uid()
  ) returning id into rid;
  insert into commission_receipt_lines (tenant_id, data_category, receipt_id, earning_id, amount, scenario_id, source_ref)
  values (app.tenant_id(), cat, rid, e.id, p_amount, p_scenario_id, src || ':line');
  update commission_earnings set cash_received_amount = cash_received_amount + p_amount where id = e.id;
  outstanding := e.gross_amount - (e.cash_received_amount + p_amount);
  -- adviser payable stays until payout; cash receipt does not auto-pay allocations
  return jsonb_build_object(
    'outcome','saved','receipt_id', rid,
    'cash_received', e.cash_received_amount + p_amount,
    'outstanding', greatest(outstanding, 0),
    'adviser_payable', (select coalesce(sum(payable_amount),0) from commission_allocations
      where earning_id = e.id and recipient_role <> 'brokerage'),
    'summary', format('Simulated receipt R%s applied', p_amount)
  );
end $$;

create or replace function public.bf_record_payout(
  p_allocation_id uuid, p_amount numeric, p_paid_on date default current_date,
  p_reference text default null, p_event_ref text default null,
  p_scenario_id text default null, p_category text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare cat text;
declare a commission_allocations%rowtype;
declare e commission_earnings%rowtype;
declare pid uuid;
declare src text;
begin
  cat := app.bf_require_demo(p_category);
  select * into a from commission_allocations
   where id = p_allocation_id and tenant_id = app.tenant_id() and data_category = cat;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if a.recipient_role = 'brokerage' then
    raise exception 'Brokerage retain share is not paid out as an allocation' using errcode = 'P0001';
  end if;
  select * into e from commission_earnings where id = a.earning_id and data_category = cat;
  src := coalesce(p_event_ref, format('payout:%s:%s', a.id, p_amount));
  if exists (select 1 from commission_payouts where tenant_id = app.tenant_id() and data_category = cat and source_ref = src) then
    select id into pid from commission_payouts where tenant_id = app.tenant_id() and data_category = cat and source_ref = src;
    return jsonb_build_object('outcome','saved','payout_id', pid, 'summary','Payout already recorded','replayed', true);
  end if;
  insert into commission_payouts (
    tenant_id, data_category, allocation_id, amount, paid_on, reference, is_simulated, scenario_id, source_ref, created_by
  ) values (
    app.tenant_id(), cat, a.id, p_amount, p_paid_on, p_reference, true, p_scenario_id, src, auth.uid()
  ) returning id into pid;
  update commission_allocations set
    paid_amount = paid_amount + p_amount,
    payable_amount = greatest(payable_amount - p_amount, 0)
  where id = a.id;
  return jsonb_build_object(
    'outcome','saved','payout_id', pid,
    'paid', a.paid_amount + p_amount,
    'payable', greatest(a.payable_amount - p_amount, 0),
    'brokerage_retained', (select coalesce(sum(amount),0) from commission_allocations
      where earning_id = e.id and recipient_role = 'brokerage'),
    'earning_id', e.id, 'policy_id', e.policy_id, 'customer_id', e.customer_id,
    'summary', format('Simulated payout R%s to %s', p_amount, coalesce(a.recipient_name, a.recipient_role))
  );
end $$;

create or replace function public.bf_preview_scale_amount(
  p_scale_version_id uuid, p_sample_amount numeric, p_category text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare cat text := coalesce(p_category, app.active_category(), 'sample');
declare v commission_scale_versions%rowtype;
declare gross numeric;
begin
  if not app.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v from commission_scale_versions
   where id = p_scale_version_id and tenant_id = app.tenant_id() and data_category = cat;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  gross := app.bf_calc_amount(p_sample_amount, v.calc_method, v.rate, v.fixed_amount);
  return jsonb_build_object(
    'eligible_amount', p_sample_amount,
    'gross_amount', gross,
    'rate', v.rate,
    'splits', coalesce((
      select jsonb_agg(jsonb_build_object(
        'recipient_role', sp.recipient_role,
        'share_percent', sp.share_percent,
        'amount', round(gross * sp.share_percent / 100.0, 2),
        'section_scope', sp.section_scope
      )) from commission_split_lines sp where sp.scale_version_id = v.id and sp.data_category = cat
    ), '[]'::jsonb)
  );
end $$;

create or replace function public.bf_executive_short_term(p_category text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cat text := coalesce(p_category, app.active_category(), 'sample');
begin
  if not app.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'short_term_premium_monthly', coalesce((
      select sum(premium_amount) from policies
      where tenant_id = app.tenant_id() and data_category = cat
        and line in ('short_term_personal','short_term_commercial')
        and status = 'in_force'
    ), 0),
    'period', to_char(date_trunc('month', current_date), 'YYYY-MM'),
    'basis', 'sum of in-force short-term policy monthly premiums',
    'commission_earned', coalesce((
      select sum(gross_amount) from commission_earnings
      where tenant_id = app.tenant_id() and data_category = cat and hold_reason is null
    ), 0),
    'cash_received', coalesce((
      select sum(cash_received_amount) from commission_earnings
      where tenant_id = app.tenant_id() and data_category = cat
    ), 0),
    'outstanding', coalesce((
      select sum(greatest(gross_amount - cash_received_amount, 0)) from commission_earnings
      where tenant_id = app.tenant_id() and data_category = cat and hold_reason is null
    ), 0),
    'allocations_payable', coalesce((
      select sum(payable_amount) from commission_allocations
      where tenant_id = app.tenant_id() and data_category = cat and recipient_role <> 'brokerage'
    ), 0)
  );
end $$;

create or replace function public.bf_reset_scenario(
  p_scenario_id text, p_category text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare cat text;
declare t uuid := app.tenant_id();
begin
  cat := app.bf_require_demo(p_category);
  delete from commission_payouts where tenant_id = t and data_category = cat and scenario_id = p_scenario_id;
  delete from commission_receipt_lines where tenant_id = t and data_category = cat and scenario_id = p_scenario_id;
  delete from commission_receipts where tenant_id = t and data_category = cat and scenario_id = p_scenario_id;
  update commission_statement_lines set match_status = 'unmatched', earning_id = null, variance = null, exception_note = null
   where tenant_id = t and data_category = cat and scenario_id = p_scenario_id;
  update commission_statement_batches set status = 'open'
   where tenant_id = t and data_category = cat and scenario_id = p_scenario_id;
  delete from commission_allocations where tenant_id = t and data_category = cat and scenario_id = p_scenario_id;
  delete from commission_earnings where tenant_id = t and data_category = cat and scenario_id = p_scenario_id;
  -- restore coastal seeded earning/allocations via re-seed helper when scenario is coastal
  if p_scenario_id = 'broker-financials-coastal' then
    perform public.bf_seed_coastal_runtime(cat);
  end if;
  if p_scenario_id = 'broker-financials-highveld' then
    -- restore baseline premium R1000 on highveld demo policy if present
    update policies set premium_amount = 1000, premium_frequency = 'monthly'
     where tenant_id = t and data_category = cat and policy_number = 'HDB-MV-1001';
    update policy_premium_rates set status = 'confirmed', amount = 1000, effective_to = null
     where tenant_id = t and data_category = cat and source_ref = 'bf:hv:prem:1000';
    update policy_premium_rates set status = 'superseded'
     where tenant_id = t and data_category = cat and source_ref = 'bf:hv:prem:1400';
    delete from policy_premium_rates
     where tenant_id = t and data_category = cat and source_ref = 'bf:hv:prem:1400';
  end if;
  insert into broker_financials_scenario_state (tenant_id, data_category, scenario_id, step_index, status, last_summary, blocked_reason, updated_at)
  values (t, cat, p_scenario_id, 0, 'idle', 'Scenario reset', null, now())
  on conflict (tenant_id, data_category, scenario_id) do update
    set step_index = 0, status = 'idle', last_summary = 'Scenario reset', blocked_reason = null, updated_at = now();
  return jsonb_build_object('outcome','reset','scenario_id', p_scenario_id, 'summary','Scenario restored for this demo brokerage');
end $$;

create or replace function public.bf_seed_coastal_runtime(p_category text default 'sample')
returns void language plpgsql security definer set search_path = public as $$
begin
  -- filled in seed migration after coastal earnings exist; no-op stub if missing
  return;
end $$;

create or replace function public.bf_demo_context(p_category text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cat text := coalesce(p_category, app.active_category(), 'sample');
declare org organisations%rowtype;
begin
  if not app.is_staff() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into org from organisations where id = app.tenant_id();
  return jsonb_build_object(
    'organisation_id', org.id,
    'organisation_name', org.name,
    'is_demo_brokerage', org.slug in ('highveld-demo-brokers','coastal-demo-brokers'),
    'slug', org.slug,
    'data_category', cat,
    'highveld_policy_id', (select id from policies where tenant_id = org.id and data_category = cat and policy_number = 'HDB-MV-1001' limit 1),
    'highveld_person_id', (select person_id from policy_cover pc join policies p on p.id = pc.policy_id and p.data_category = pc.data_category
      where p.tenant_id = org.id and p.data_category = cat and p.policy_number = 'HDB-MV-1001' limit 1),
    'highveld_customer_id', (select customer_id from policies where tenant_id = org.id and data_category = cat and policy_number = 'HDB-MV-1001' limit 1),
    'highveld_item_id', (select ii.id from insured_items ii
      join policy_cover pc on pc.person_id = ii.person_id and pc.data_category = ii.data_category
      join policies p on p.id = pc.policy_id and p.data_category = pc.data_category
      where p.tenant_id = org.id and p.data_category = cat and p.policy_number = 'HDB-MV-1001'
        and ii.item_type = 'vehicle' and ii.status = 'covered' limit 1),
    'coastal_policy_id', (select id from policies where tenant_id = org.id and data_category = cat and policy_number = 'CDB-CP-2001' limit 1),
    'scenario_state', (
      select row_to_json(s)::jsonb from broker_financials_scenario_state s
      where s.tenant_id = org.id and s.data_category = cat
      order by s.updated_at desc limit 1
    )
  );
end $$;

grant execute on function public.bf_list_transactions(date, uuid, uuid, text) to authenticated;
grant execute on function public.bf_get_earning(uuid, text) to authenticated;
grant execute on function public.bf_list_statements(text) to authenticated;
grant execute on function public.bf_list_payouts(text) to authenticated;
grant execute on function public.bf_list_scales(text) to authenticated;
grant execute on function public.bf_resolve_scale(uuid, text, text, date, text) to authenticated;
grant execute on function public.bf_preview_commission(numeric, uuid, text, text, date, text) to authenticated;
grant execute on function public.bf_post_earning(uuid, numeric, date, text, text, text, text, text) to authenticated;
grant execute on function public.bf_match_statement_line(uuid, uuid, text) to authenticated;
grant execute on function public.bf_record_receipt(uuid, numeric, date, text, text, text, text) to authenticated;
grant execute on function public.bf_record_payout(uuid, numeric, date, text, text, text, text) to authenticated;
grant execute on function public.bf_preview_scale_amount(uuid, numeric, text) to authenticated;
grant execute on function public.bf_executive_short_term(text) to authenticated;
grant execute on function public.bf_reset_scenario(text, text) to authenticated;
grant execute on function public.bf_demo_context(text) to authenticated;
