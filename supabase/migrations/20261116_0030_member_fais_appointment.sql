-- Per-member FAIS appointment on organisation memberships (capacity, status, DOFA, authorised categories).
-- Platform access role stays separate; these columns describe regulatory appointment under the brokerage FSP.

ALTER TABLE public.organisation_memberships
  ADD COLUMN IF NOT EXISTS fais_capacity text
    CHECK (fais_capacity IS NULL OR fais_capacity IN (
      'key_individual', 'representative', 'juristic_representative', 'non_advice'
    )),
  ADD COLUMN IF NOT EXISTS fais_status text
    CHECK (fais_status IS NULL OR fais_status IN ('active', 'suspended', 'terminated')),
  ADD COLUMN IF NOT EXISTS dofa_date date,
  ADD COLUMN IF NOT EXISTS authorised_licence_categories text[] DEFAULT '{}';

COMMENT ON COLUMN public.organisation_memberships.fais_capacity IS
  'FAIS capacity under this FSP: key individual, representative, juristic representative, or non-advice staff.';
COMMENT ON COLUMN public.organisation_memberships.fais_status IS
  'Appointment status for FAIS capacity; advice requires active.';
COMMENT ON COLUMN public.organisation_memberships.dofa_date IS
  'Date of first appointment (DOFA) under this brokerage, when known.';
COMMENT ON COLUMN public.organisation_memberships.authorised_licence_categories IS
  'Licence categories this member may advise on; empty means not authorised for advice products.';

-- Demo representatives: active appointment covering common short-term (and life where seeded as reps).
UPDATE public.organisation_memberships m
SET
  fais_capacity = CASE
    WHEN m.role IN ('representative', 'agent', 'sub_broker') THEN 'representative'
    WHEN m.role = 'brokerage_owner' THEN 'key_individual'
    ELSE 'non_advice'
  END,
  fais_status = 'active',
  dofa_date = COALESCE(m.dofa_date, (m.created_at AT TIME ZONE 'UTC')::date),
  authorised_licence_categories = CASE
    WHEN m.role IN ('representative', 'agent', 'sub_broker', 'brokerage_owner')
      THEN COALESCE(NULLIF(m.authorised_licence_categories, '{}'), ARRAY['st_personal', 'st_commercial', 'lt_b1']::text[])
    ELSE COALESCE(m.authorised_licence_categories, '{}')
  END
WHERE m.fais_capacity IS NULL;
