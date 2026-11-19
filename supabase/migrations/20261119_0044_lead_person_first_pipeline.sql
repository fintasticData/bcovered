-- Person-first leads: optional cover, six-stage pipeline, closed reason, policy link for Live.

alter table leads
  alter column product_category drop not null;

alter table leads
  add column if not exists closed_reason text,
  add column if not exists closed_at_stage text,
  add column if not exists closed_at timestamptz,
  add column if not exists policy_id uuid references policies (id);

comment on column leads.product_category is
  'Cover for this opportunity; null when the broker captured a person or business before cover is known.';
comment on column leads.closed_reason is
  'Why the opportunity was closed (declined, no response, etc.).';
comment on column leads.closed_at_stage is
  'Pipeline stage where the opportunity stopped when closed.';
comment on column leads.closed_at is
  'When the opportunity was closed.';
comment on column leads.policy_id is
  'Linked in-force policy that marks this opportunity Live.';

-- Drop legacy check before remapping statuses (old values are not in the new set).
alter table leads drop constraint if exists leads_status_check;

update leads set status = 'lead' where status in ('new', 'qualifying', 'qualified');
update leads set status = 'quoting' where status = 'proposal_pending';
update leads set
  status = 'closed',
  closed_reason = coalesce(closed_reason, 'Declined'),
  closed_at_stage = coalesce(closed_at_stage, 'lead'),
  closed_at = coalesce(closed_at, now())
where status = 'lost';
update leads set status = 'accepted' where status = 'won';
-- proposal_released and quoting stay as-is.

alter table leads alter column status set default 'lead';

alter table leads
  add constraint leads_status_check
  check (status = any (array[
    'lead'::text,
    'contacted'::text,
    'quoting'::text,
    'proposal_released'::text,
    'accepted'::text,
    'live'::text,
    'closed'::text
  ]));

alter table leads drop constraint if exists leads_closed_at_stage_check;
alter table leads
  add constraint leads_closed_at_stage_check
  check (
    closed_at_stage is null
    or closed_at_stage = any (array[
      'lead'::text,
      'contacted'::text,
      'quoting'::text,
      'proposal_released'::text,
      'accepted'::text,
      'live'::text
    ])
  );
