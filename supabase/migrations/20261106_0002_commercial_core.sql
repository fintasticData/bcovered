-- InsureFlow AI commercial module, Priority 1 (business profile, Risk Twin, exposures, draft submissions, tasks).
-- Not yet applied: the demo runs on in-browser tables in src/server/db/commercialSchema.ts that mirror this file.
-- Apply after 20261106_0001_insureflow_core.sql, to the dedicated InsureFlow Supabase project only.

alter table approval_requests drop constraint approval_requests_approval_type_check,
  add constraint approval_requests_approval_type_check check (approval_type in ('quote_proposal_release','policy_change','claim_submission','external_communication','sensitive_record_update','bulk_campaign','renewal_recommendation','underwriting_submission'));

create table industry_risk_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  key text not null, name text not null, version int not null default 1,
  summary text not null,
  keywords jsonb not null default '[]', activities jsonb not null default '[]', typical_assets jsonb not null default '[]',
  exposure_rules jsonb not null default '[]', potential_classes jsonb not null default '[]',
  underwriting_questions jsonb not null default '[]', documents jsonb not null default '[]',
  survey_requirements jsonb not null default '[]', coverage_considerations jsonb not null default '[]',
  referral_triggers jsonb not null default '[]', discovery_topics jsonb not null default '[]',
  is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (tenant_id, key)
);

create table business_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  customer_id uuid not null references customers(id),
  registered_name text not null, trading_name text, registration_number text, vat_number text,
  industry_key text not null,
  activities_summary text, years_trading int, annual_turnover numeric(16,2), employee_count int,
  operating_regions jsonb not null default '[]',
  primary_contact jsonb, existing_cover jsonb, loss_history jsonb,
  field_sources jsonb not null default '{}', missing_info jsonb not null default '[]',
  status text not null default 'discovery' check (status in ('discovery','in_review','active','archived')),
  assigned_broker_id uuid references app_users(id),
  is_synthetic boolean not null default true,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (tenant_id, customer_id)
);

create table business_legal_entities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  business_profile_id uuid not null references business_profiles(id) on delete cascade,
  legal_name text not null, registration_number text,
  role text not null default 'primary' check (role in ('primary','subsidiary','property_owner','other')),
  source text not null check (source in ('verified','declared','inferred','missing')),
  created_at timestamptz not null default now()
);

create table business_locations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  business_profile_id uuid not null references business_profiles(id) on delete cascade,
  legal_entity_id uuid references business_legal_entities(id),
  name text not null, suburb text, city text, province text,
  occupancy text not null,
  ownership text not null default 'unknown' check (ownership in ('owned','leased','unknown')),
  construction text, fire_protection jsonb not null default '[]', security jsonb not null default '[]',
  backup_power boolean, public_access boolean not null default false, seating_capacity int,
  source text not null check (source in ('verified','declared','inferred','missing')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table business_activities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  business_profile_id uuid not null references business_profiles(id) on delete cascade,
  location_id uuid references business_locations(id),
  kind text not null check (kind in ('operation','revenue_stream','supplier_dependency','customer_dependency')),
  name text not null, description text, share_of_revenue numeric(5,4) check (share_of_revenue between 0 and 1),
  source text not null check (source in ('verified','declared','inferred','missing')),
  created_at timestamptz not null default now()
);

create table commercial_assets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  business_profile_id uuid not null references business_profiles(id) on delete cascade,
  location_id uuid references business_locations(id),
  asset_class text not null check (asset_class in ('buildings','contents','stock','machinery','electronic_equipment','vehicle','mobile_plant','other')),
  description text not null, quantity int not null default 1,
  declared_value numeric(16,2),
  value_basis text not null default 'unknown' check (value_basis in ('replacement','market','book','unknown')),
  valuation_date timestamptz,
  source text not null check (source in ('verified','declared','inferred','missing')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table business_risk_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  business_profile_id uuid not null references business_profiles(id) on delete cascade,
  version int not null,
  status text not null default 'current' check (status in ('current','superseded')),
  template_key text not null, template_version int not null,
  node_count int not null default 0, edge_count int not null default 0,
  summary text, job_id uuid references jobs(id),
  created_at timestamptz not null default now(),
  unique (business_profile_id, version)
);

create table risk_exposures (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  business_profile_id uuid not null references business_profiles(id) on delete cascade,
  risk_profile_id uuid not null references business_risk_profiles(id) on delete cascade,
  rule_key text not null, title text not null, description text not null,
  category text not null check (category in ('property','interruption','liability','motor','cyber','crime','valuation','dependency','special_risk','people')),
  business_impact text not null, evidence jsonb not null default '[]',
  priority text not null check (priority in ('high','medium','low')),
  priority_inputs jsonb not null default '[]',
  coverage_status text not null default 'unknown' check (coverage_status in ('confirmed_covered','confirmed_excluded','potentially_covered','unknown','awaiting_broker_review')),
  potential_classes jsonb not null default '[]', location_ids jsonb not null default '[]',
  assigned_broker_id uuid references app_users(id),
  outstanding_questions jsonb not null default '[]', review_date timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (risk_profile_id, rule_key)
);

-- Edges of the Risk Twin. Endpoints are polymorphic, so integrity is checked in the service layer.
create table risk_dependencies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  business_profile_id uuid not null references business_profiles(id) on delete cascade,
  risk_profile_id uuid not null references business_risk_profiles(id) on delete cascade,
  from_table text not null, from_id uuid not null, to_table text not null, to_id uuid not null,
  relation text not null check (relation in ('owns','operates_at','located_at','generates_revenue_at','depends_on','exposes')),
  note text,
  created_at timestamptz not null default now()
);

create table risk_assessments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  business_profile_id uuid not null references business_profiles(id) on delete cascade,
  risk_profile_id uuid not null references business_risk_profiles(id) on delete cascade,
  job_id uuid references jobs(id),
  template_key text not null, template_version int not null,
  exposure_count int not null, high_priority_count int not null,
  findings jsonb not null default '[]', gaps jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create table commercial_submissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  business_profile_id uuid not null references business_profiles(id),
  customer_id uuid not null references customers(id),
  lead_id uuid references leads(id),
  risk_profile_id uuid references business_risk_profiles(id),
  job_id uuid references jobs(id),
  status text not null default 'draft' check (status in ('draft','awaiting_approval','approved','ready_for_market','rejected')),
  pack jsonb, completeness int not null default 0 check (completeness between 0 and 100),
  outstanding_items jsonb not null default '[]', validation jsonb,
  is_simulated boolean not null default true check (is_simulated),
  approved_at timestamptz,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table submission_sections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  submission_id uuid not null references commercial_submissions(id) on delete cascade,
  cover_class text not null,
  status text not null default 'proposed' check (status in ('proposed','included','excluded')),
  sum_insured numeric(16,2), limit_of_indemnity numeric(16,2), basis text,
  asset_ids jsonb not null default '[]', exposure_ids jsonb not null default '[]',
  notes text, broker_edited boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (submission_id, cover_class)
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organisations(id),
  customer_id uuid references customers(id),
  subject_table text, subject_id uuid,
  kind text not null check (kind in ('document_request','information_request','broker_review','follow_up')),
  audience text not null check (audience in ('customer','broker')),
  title text not null, detail text,
  status text not null default 'open' check (status in ('open','done','cancelled')),
  assigned_to uuid references app_users(id), due_date timestamptz,
  created_by_agent text, job_id uuid references jobs(id), dedupe_key text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create index business_profiles_tenant_idx on business_profiles (tenant_id, status);
create index business_locations_profile_idx on business_locations (business_profile_id);
create index business_activities_profile_idx on business_activities (business_profile_id);
create index commercial_assets_profile_idx on commercial_assets (business_profile_id, location_id);
create index risk_profiles_current_idx on business_risk_profiles (business_profile_id) where status = 'current';
create index risk_exposures_profile_idx on risk_exposures (risk_profile_id, priority);
create index risk_dependencies_profile_idx on risk_dependencies (risk_profile_id);
create index submissions_profile_idx on commercial_submissions (business_profile_id, status);
create index tasks_open_idx on tasks (tenant_id, audience, status) where status = 'open';
create unique index tasks_dedupe_idx on tasks (tenant_id, dedupe_key) where dedupe_key is not null and status = 'open';

do $$
declare t text;
begin
  foreach t in array array['industry_risk_templates','business_profiles','business_legal_entities','business_locations','business_activities','commercial_assets','business_risk_profiles','risk_exposures','risk_dependencies','risk_assessments','commercial_submissions','submission_sections','tasks'] loop
    execute format('alter table %I enable row level security', t);
    execute format($p$create policy tenant_isolation on %I
      using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
      with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)$p$, t);
  end loop;
end $$;
