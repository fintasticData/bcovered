-- Asset map Site layout: optional floor plan per business location.

alter table public.business_locations
  add column if not exists floor_plan_url text;
