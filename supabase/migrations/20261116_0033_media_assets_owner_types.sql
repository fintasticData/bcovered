-- Harden media_assets.owner_table values used by brokerage branding and book item uploads.
alter table public.media_assets
  drop constraint if exists media_assets_owner_table_check;

alter table public.media_assets
  add constraint media_assets_owner_table_check
  check (
    owner_table is null
    or owner_table in (
      'organisations',
      'sales_offers',
      'sales_sales',
      'persons',
      'commercial_assets'
    )
  );

comment on column public.media_assets.owner_table is
  'Optional owner entity: organisations | sales_offers | sales_sales | persons | commercial_assets';
