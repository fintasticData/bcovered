-- Asset map: mobility type, usual base, and typically-used places of use.
-- Places of use are separate from policy coverage territory.

alter table public.commercial_assets
  add column if not exists mobility_type text not null default 'fixed',
  add column if not exists usual_base_place_id uuid references public.business_locations(id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'commercial_assets_mobility_type_check'
  ) then
    alter table public.commercial_assets
      add constraint commercial_assets_mobility_type_check
      check (mobility_type in ('fixed', 'portable', 'vehicle'));
  end if;
end $$;

create table if not exists public.asset_places_of_use (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organisations(id),
  asset_id uuid not null references public.commercial_assets(id) on delete cascade,
  place_id uuid not null references public.business_locations(id) on delete cascade,
  relationship text not null default 'typically_used'
    check (relationship in ('typically_used')),
  created_at timestamptz not null default now(),
  unique (asset_id, place_id, relationship)
);

create index if not exists asset_places_of_use_place_idx
  on public.asset_places_of_use (tenant_id, place_id);

create index if not exists asset_places_of_use_asset_idx
  on public.asset_places_of_use (tenant_id, asset_id);

alter table public.asset_places_of_use enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'asset_places_of_use' and policyname = 'tenant_isolation'
  ) then
    create policy tenant_isolation on public.asset_places_of_use
      using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
      with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
  end if;
end $$;
