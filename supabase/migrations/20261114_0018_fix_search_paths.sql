-- InsureFlow AI / B-Covered: pin search_path on the functions the Supabase security advisor flagged (lint 0011).

alter function public.audit_evidence_immutable() set search_path = public;
alter function app.is_staff() set search_path = public;
alter function app.active_category() set search_path = public;
alter function public.copilot_line_of(text) set search_path = public;
alter function public.copilot_policy_path(text, uuid, uuid) set search_path = public;
