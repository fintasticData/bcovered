-- Allow service jobs created from a customer (person) without an existing
-- concierge request or claim. Matches service_job_create(... p_person_id).

alter table public.service_jobs drop constraint if exists service_jobs_check;

alter table public.service_jobs
  add constraint service_jobs_check
  check (
    concierge_request_id is not null
    or claim_id is not null
    or person_id is not null
  );

comment on constraint service_jobs_check on public.service_jobs is
  'Job must link to a concierge request, a claim, or at least a person (directory create).';
