-- Values & payments: purchase fields + effective-dated valuations (commercial + personal).
-- As-at helpers for asset values. Premiums/payments: policy_premium_rates / policy_transactions.
-- Commission: commission_* tables.

alter table public.commercial_assets
  add column if not exists purchase_price numeric(16,2),
  add column if not exists purchase_date date,
  add column if not exists insured_value numeric(16,2);

create table if not exists public.commercial_asset_valuations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organisations(id),
  asset_id uuid not null references public.commercial_assets(id) on delete cascade,
  amount numeric(16,2) not null,
  value_basis text not null
    check (value_basis in ('replacement','market','book','purchase','insured','unknown')),
  effective_from date not null,
  effective_to date,
  source text not null default 'declared',
  note text,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);

create index if not exists commercial_asset_valuations_asset_asat_idx
  on public.commercial_asset_valuations (tenant_id, asset_id, effective_from);

create table if not exists public.insured_item_valuations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organisations(id),
  item_id uuid not null references public.insured_items(id) on delete cascade,
  data_category text not null default 'live',
  amount numeric(16,2) not null,
  value_basis text not null
    check (value_basis in ('replacement','market','book','purchase','insured','unknown')),
  effective_from date not null,
  effective_to date,
  source text not null default 'declared',
  note text,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);

create index if not exists insured_item_valuations_item_asat_idx
  on public.insured_item_valuations (tenant_id, data_category, item_id, effective_from);

alter table public.commercial_asset_valuations enable row level security;
alter table public.insured_item_valuations enable row level security;

drop policy if exists commercial_asset_valuations_staff on public.commercial_asset_valuations;
create policy commercial_asset_valuations_staff on public.commercial_asset_valuations for all
  using (tenant_id = app.tenant_id() and app.is_staff())
  with check (tenant_id = app.tenant_id() and app.is_staff());

drop policy if exists commercial_asset_valuations_customer on public.commercial_asset_valuations;
create policy commercial_asset_valuations_customer on public.commercial_asset_valuations for select to authenticated
  using (
    exists (
      select 1
      from public.commercial_assets a
      join public.business_profiles bp on bp.id = a.business_profile_id
      where a.id = commercial_asset_valuations.asset_id
        and bp.customer_id = app.my_customer_id()
    )
  );

drop policy if exists insured_item_valuations_staff on public.insured_item_valuations;
create policy insured_item_valuations_staff on public.insured_item_valuations for all
  using (
    tenant_id = app.tenant_id()
    and app.is_staff()
    and data_category = app.active_category()
  )
  with check (
    tenant_id = app.tenant_id()
    and app.is_staff()
    and data_category = app.active_category()
  );

drop policy if exists insured_item_valuations_customer on public.insured_item_valuations;
create policy insured_item_valuations_customer on public.insured_item_valuations for select to authenticated
  using (
    data_category = app.active_category()
    and exists (
      select 1
      from public.insured_items i
      where i.id = insured_item_valuations.item_id
        and i.person_id in (
          select cp.person_id from public.customer_persons cp where cp.customer_id = app.my_customer_id()
        )
    )
  );

insert into public.commercial_asset_valuations (tenant_id, asset_id, amount, value_basis, effective_from, source, note)
select a.tenant_id, a.id, a.declared_value, coalesce(nullif(a.value_basis, ''), 'unknown'),
       coalesce(a.valuation_date::date, current_date), coalesce(a.source, 'declared'),
       'bootstrap_declared'
from public.commercial_assets a
where a.declared_value is not null
  and not exists (
    select 1 from public.commercial_asset_valuations v
    where v.asset_id = a.id and v.note = 'bootstrap_declared'
  );

insert into public.commercial_asset_valuations (tenant_id, asset_id, amount, value_basis, effective_from, source, note)
select a.tenant_id, a.id, a.purchase_price, 'purchase',
       coalesce(a.purchase_date, current_date), 'declared', 'bootstrap_purchase'
from public.commercial_assets a
where a.purchase_price is not null
  and not exists (
    select 1 from public.commercial_asset_valuations v
    where v.asset_id = a.id and v.note = 'bootstrap_purchase'
  );

create or replace function public.commercial_asset_value_as_at(
  p_asset_id uuid,
  p_as_at date,
  p_basis text default null
)
returns numeric
language sql
stable
security invoker
set search_path = public
as $$
  select v.amount
  from public.commercial_asset_valuations v
  where v.asset_id = p_asset_id
    and v.effective_from <= p_as_at
    and (v.effective_to is null or v.effective_to >= p_as_at)
    and (p_basis is null or v.value_basis = p_basis)
  order by v.effective_from desc, v.created_at desc
  limit 1;
$$;

create or replace function public.insured_item_value_as_at(
  p_item_id uuid,
  p_as_at date,
  p_basis text default null,
  p_category text default 'live'
)
returns numeric
language sql
stable
security invoker
set search_path = public
as $$
  select v.amount
  from public.insured_item_valuations v
  where v.item_id = p_item_id
    and v.data_category = coalesce(nullif(p_category, ''), 'live')
    and v.effective_from <= p_as_at
    and (v.effective_to is null or v.effective_to >= p_as_at)
    and (p_basis is null or v.value_basis = p_basis)
  order by v.effective_from desc, v.created_at desc
  limit 1;
$$;

grant execute on function public.commercial_asset_value_as_at(uuid, date, text) to authenticated;
grant execute on function public.insured_item_value_as_at(uuid, date, text, text) to authenticated;
