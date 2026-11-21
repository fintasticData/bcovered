-- Allow media_assets to be owned by a policy cover (broker policy documents / photos).
alter table public.media_assets drop constraint if exists media_assets_owner_table_check;
alter table public.media_assets add constraint media_assets_owner_table_check
  check (owner_table is null or owner_table in (
    'organisations','sales_offers','sales_sales','persons','commercial_assets',
    'policy_service_requests','claims','policy_versions','insured_items',
    'claim_evidence_requirements','concierge_requests','service_jobs',
    'policy_covers'
  ));

comment on column public.media_assets.owner_table is
  'Optional owner entity including policy_covers for policy documents and photos';
