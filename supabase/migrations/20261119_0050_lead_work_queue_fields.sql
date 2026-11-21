-- Work-queue fields on opportunities for Leads grid and qualification panel.

alter table leads
  add column if not exists next_action text,
  add column if not exists next_action_due_at timestamptz,
  add column if not exists last_activity_at timestamptz,
  add column if not exists qualification_confirmed jsonb default '{}'::jsonb,
  add column if not exists activity jsonb default '[]'::jsonb;

comment on column leads.next_action is 'Concrete next broker action shown in the Leads work queue.';
comment on column leads.next_action_due_at is 'Due date for next_action.';
comment on column leads.last_activity_at is 'When the last contact, note or qualification save happened.';
comment on column leads.qualification_confirmed is 'Map of field keys to provenance: research | broker | customer.';
comment on column leads.activity is 'Timeline entries: contact, note, follow_up with outcome, who and when.';
