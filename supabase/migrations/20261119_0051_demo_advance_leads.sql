-- Demo advance is implemented in the app server (demoAdvanceLeads) against the
-- in-browser / demo repo so it reuses lead.qualification, quote.create_request
-- and local policy inserts without live insurer or email sends.
-- This migration documents the contract for a future Supabase RPC if needed.

comment on table leads is
  'Opportunities. Demo Advance demo leads (sample category only) advances status with sample activity via the app API; Live rows are refused.';
