-- Commercial cover interests captured when opening a business prospect.
-- Keys match cover class keys in src/server/domain/commercial/coverClasses.ts.

alter table business_profiles
  add column if not exists cover_interests jsonb not null default '[]'::jsonb;

comment on column business_profiles.cover_interests is
  'Array of { key, related[] } for commercial cover classes the broker flagged at enquiry.';
