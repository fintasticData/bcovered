-- InsureFlow AI / B-Covered: row-level security from login claims, with access grants for employer, fund and cell scopes.
-- Replaces the app.tenant_id session setting used by 0001–0008 once the frontend reads Supabase directly.
-- Not yet applied. Apply after 20261108_0008_specialist.sql, to the dedicated insureflow-dev project only.
-- Requires a custom access token hook that adds tenant_id and app_role claims to the JWT.

begin;

create schema if not exists app;

create or replace function app.tenant_id() returns uuid language sql stable as $$
  select nullif(coalesce(auth.jwt() ->> 'tenant_id', current_setting('app.tenant_id', true)), '')::uuid
$$;

create or replace function app.role() returns text language sql stable as $$
  select coalesce(auth.jwt() ->> 'app_role', 'visitor')
$$;

create or replace function app.is_staff() returns boolean language sql stable as $$
  select app.role() in ('broker', 'claims_admin', 'manager', 'admin')
$$;

-- One function decides scoped access, so every scoped table uses the same rule.
create or replace function app.has_scope(scope text, scope_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from access_grants g
    where g.user_id = auth.uid() and g.tenant_id = app.tenant_id()
      and g.scope_type = scope and g.scope_id = has_scope.scope_id and g.revoked_at is null
  )
$$;
revoke all on function app.has_scope(text, uuid) from public;
grant execute on function app.has_scope(text, uuid) to authenticated;

do $$
declare
  t text;
  employer_tables text[] := array['group_schemes','scheme_rule_versions','employments','salary_history','scheme_memberships','fund_participations','fund_memberships','contribution_rule_versions','member_movements','benefit_events','administrator_valuations'];
begin
  foreach t in array employer_tables loop
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format($p$create policy staff_tenant on %I for all to authenticated
      using (tenant_id = app.tenant_id() and app.is_staff())
      with check (tenant_id = app.tenant_id() and app.is_staff())$p$, t);
    execute format($p$create policy employer_read on %I for select to authenticated
      using (tenant_id = app.tenant_id() and app.has_scope('employer', employer_customer_id))$p$, t);
  end loop;
end $$;

drop policy if exists tenant_isolation on cell_arrangements;
create policy staff_tenant on cell_arrangements for all to authenticated
  using (tenant_id = app.tenant_id() and app.is_staff()) with check (tenant_id = app.tenant_id() and app.is_staff());
create policy cell_owner_read on cell_arrangements for select to authenticated
  using (tenant_id = app.tenant_id() and app.has_scope('cell', id));

drop policy if exists tenant_isolation on cell_financial_periods;
create policy staff_tenant on cell_financial_periods for all to authenticated
  using (tenant_id = app.tenant_id() and app.is_staff()) with check (tenant_id = app.tenant_id() and app.is_staff());
create policy cell_owner_read on cell_financial_periods for select to authenticated
  using (tenant_id = app.tenant_id() and app.has_scope('cell', cell_id));

-- Employer HR users see the people employed by a granted employer, and nobody else.
drop policy if exists tenant_isolation on persons;
create policy staff_tenant on persons for all to authenticated
  using (tenant_id = app.tenant_id() and app.is_staff()) with check (tenant_id = app.tenant_id() and app.is_staff());
create policy employer_people_read on persons for select to authenticated
  using (tenant_id = app.tenant_id() and exists (
    select 1 from employments e where e.person_id = persons.id and app.has_scope('employer', e.employer_customer_id)
  ));

-- Financial profiles hold special financial information: advisers and managers only.
drop policy if exists tenant_isolation on financial_profiles;
create policy adviser_only on financial_profiles for all to authenticated
  using (tenant_id = app.tenant_id() and app.role() in ('broker', 'manager', 'admin'))
  with check (tenant_id = app.tenant_id() and app.role() in ('broker', 'manager', 'admin'));

commit;
