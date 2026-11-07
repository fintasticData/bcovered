-- InsureFlow AI Business Risk Twin V2: assessments, findings, operational dependencies, documents, policy evidence,
-- coverage findings, document-proposed updates and change events.
-- Not yet applied: the demo runs on in-browser tables in src/server/db/commercialSchema.ts that mirror this file.
-- Apply after 20261106_0002_commercial_core.sql, to the dedicated InsureFlow Supabase project only.

begin;

alter table approval_requests drop constraint approval_requests_approval_type_check,
  add constraint approval_requests_approval_type_check check (approval_type in ('quote_proposal_release','policy_change','claim_submission','external_communication','sensitive_record_update','bulk_campaign','renewal_recommendation','underwriting_submission','risk_assessment_signoff','risk_investigation_review'));

-- Document-extracted values are a distinct provenance until a broker confirms them.
alter table business_legal_entities drop constraint business_legal_entities_source_check,
  add constraint business_legal_entities_source_check check (source in ('verified','declared','extracted','inferred','missing'));
alter table business_locations drop constraint business_locations_source_check,
  add constraint business_locations_source_check check (source in ('verified','declared','extracted','inferred','missing'));
alter table business_activities drop constraint business_activities_source_check,
  add constraint business_activities_source_check check (source in ('verified','declared','extracted','inferred','missing'));
alter table commercial_assets drop constraint commercial_assets_source_check,
  add constraint commercial_assets_source_check check (source in ('verified','declared','extracted','inferred','missing'));

-- Frozen copy of the business records per Twin version, for change comparison.
alter table business_risk_profiles add column snapshot jsonb;

alter table risk_dependencies drop constraint risk_dependencies_relation_check,
  add constraint risk_dependencies_relation_check check (relation in ('owns','operates_at','located_at','generates_revenue_at','depends_on','exposes','supports','stores','feeds','supplies','serves')),
  add column source text not null default 'declared' check (source in ('verified','declared','extracted','inferred'));

alter table risk_exposures
  add column priority_override text check (priority_override in ('critical','high','medium','low','unassessed')),
  add column override_reason text,
  add column overridden_by uuid references app_users(id),
  add column overridden_at timestamptz;

alter table risk_assessments
  add column assessment_type text not null default 'initial' check (assessment_type in ('initial','annual_renewal','new_location','new_asset','business_change','incident_triggered','targeted_specialist')),
  add column status text not null default 'draft' check (status in ('draft','in_progress','awaiting_review','approved','superseded')),
  add column scope jsonb not null default '[]',
  add column assessor_id uuid references app_users(id),
  add column approval_id uuid references approval_requests(id),
  add column completeness jsonb not null default '[]',
  add column summary text,
  add column next_review_date timestamptz,
  add column updated_at timestamptz not null default now();

create table risk_assessment_findings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  assessment_id uuid not null references risk_assessments(id) on delete cascade,
  business_profile_id uuid not null references business_profiles(id) on delete cascade,
  exposure_id uuid references risk_exposures(id),
  rank int not null, is_priority_area boolean not null default false,
  title text not null,
  category text not null check (category in ('property','interruption','liability','motor','cyber','crime','valuation','dependency','special_risk','people')),
  priority text not null check (priority in ('critical','high','medium','low','unassessed')),
  rationale jsonb not null default '[]', evidence jsonb not null default '[]', outstanding jsonb not null default '[]',
  fact_basis text not null check (fact_basis in ('verified','declared','extracted','inferred','unknown')),
  coverage jsonb not null default '{}',
  status text not null default 'proposed' check (status in ('proposed','accepted','rejected','overridden')),
  broker_note text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (assessment_id, rank)
);

-- Persistent operational dependencies (supports, stores, feeds, supplies, serves). Endpoints are polymorphic.
create table business_dependency_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  business_profile_id uuid not null references business_profiles(id) on delete cascade,
  from_table text not null, from_id uuid not null, to_table text not null, to_id uuid not null,
  relation text not null check (relation in ('supports','stores','feeds','supplies','serves')),
  note text,
  source text not null check (source in ('verified','declared','extracted','inferred')),
  status text not null default 'active' check (status in ('active','rejected')),
  confirmed_by uuid references app_users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (business_profile_id, from_id, to_id, relation)
);

create table business_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  business_profile_id uuid not null references business_profiles(id) on delete cascade,
  file_name text not null, page_count int, file_size bigint,
  doc_type text not null check (doc_type in ('policy_schedule','policy_wording','asset_register','financial_summary','business_description','risk_survey','vehicle_schedule','lease','contract','other')),
  status text not null default 'uploaded' check (status in ('uploaded','extracted','reviewed','rejected')),
  is_simulated boolean not null default true, fixture_key text, extraction_note text,
  uploaded_by uuid references app_users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table insurance_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  business_profile_id uuid not null references business_profiles(id) on delete cascade,
  insurer text not null, policy_number text, inception_date timestamptz, renewal_date timestamptz,
  source text not null check (source in ('verified','declared','extracted','inferred')),
  document_id uuid references business_documents(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table policy_sections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  business_profile_id uuid not null references business_profiles(id) on delete cascade,
  policy_id uuid not null references insurance_policies(id) on delete cascade,
  cover_class text not null, section_name text not null,
  sum_insured numeric(16,2), limit_of_indemnity numeric(16,2), excess text, basis text,
  conditions jsonb not null default '[]', exclusions jsonb not null default '[]', warranties jsonb not null default '[]',
  source text not null check (source in ('verified','declared','extracted','inferred')),
  document_id uuid references business_documents(id), page_ref text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table coverage_findings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  business_profile_id uuid not null references business_profiles(id) on delete cascade,
  exposure_id uuid not null references risk_exposures(id) on delete cascade,
  policy_section_id uuid references policy_sections(id),
  status text not null check (status in ('confirmed_covered','potentially_covered','confirmed_excluded','unknown','awaiting_broker_review')),
  insurer text, section_name text, clause_ref text, page_ref text,
  document_id uuid references business_documents(id),
  rationale text not null, proposed_by_agent text,
  reviewed_by uuid references app_users(id), reviewed_at timestamptz, review_note text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  -- Only a person can confirm cover or an exclusion.
  check (status not in ('confirmed_covered','confirmed_excluded') or reviewed_by is not null)
);

create table twin_update_proposals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  business_profile_id uuid not null references business_profiles(id) on delete cascade,
  document_id uuid not null references business_documents(id) on delete cascade,
  kind text not null check (kind in ('add_asset','update_asset','add_policy','add_policy_section')),
  target_id uuid, label text not null,
  current jsonb, suggested jsonb not null, page_ref text, conflict text,
  status text not null default 'pending' check (status in ('pending','applied','rejected')),
  decided_by uuid references app_users(id), decided_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table risk_twin_change_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  business_profile_id uuid not null references business_profiles(id) on delete cascade,
  from_risk_profile_id uuid references business_risk_profiles(id),
  to_risk_profile_id uuid references business_risk_profiles(id),
  entity_table text not null, entity_id uuid,
  change_type text not null check (change_type in ('added','removed','changed')),
  field text, label text not null, before jsonb, after jsonb, finding text not null,
  task_id uuid references tasks(id),
  created_at timestamptz not null default now()
);

create index assessment_findings_idx on risk_assessment_findings (assessment_id, rank);
create index dependency_links_profile_idx on business_dependency_links (business_profile_id) where status = 'active';
create index documents_profile_idx on business_documents (business_profile_id);
create index policies_profile_idx on insurance_policies (business_profile_id);
create index policy_sections_policy_idx on policy_sections (policy_id, cover_class);
create index coverage_findings_exposure_idx on coverage_findings (exposure_id);
create index proposals_pending_idx on twin_update_proposals (business_profile_id) where status = 'pending';
create index twin_changes_profile_idx on risk_twin_change_events (business_profile_id, created_at);

do $$
declare t text;
begin
  foreach t in array array['risk_assessment_findings','business_dependency_links','business_documents','insurance_policies','policy_sections','coverage_findings','twin_update_proposals','risk_twin_change_events'] loop
    execute format('alter table %I enable row level security', t);
    execute format($p$create policy tenant_isolation on %I
      using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
      with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)$p$, t);
  end loop;
end $$;

commit;
