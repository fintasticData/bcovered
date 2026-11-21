-- Fix PostgREST 404: salesRpc always sends p_category, so Concierge RPCs must accept it.
-- Applied via MCP as vip_concierge_rpc_p_category + vip_concierge_rpc_p_category_mutations.
-- Bodies live in those applied migrations; this file documents the signature contract.

-- public.concierge_customer_home(p_category text default null)
-- public.concierge_request_get(p_category text, p_request_id uuid)
-- public.concierge_broker_queue(p_category text, p_person_id uuid, p_status text)
-- public.concierge_partner_queue(p_category text)
-- public.concierge_request_create(p_category text, …)
-- public.concierge_request_message(p_category text, …)
-- public.concierge_request_upload_doc(p_category text, …)
-- public.concierge_assign(p_category text, …)
-- public.concierge_request_info(p_category text, …)
-- public.concierge_refer_partner(p_category text, …)
-- public.concierge_record_outcome(p_category text, …)
-- public.concierge_partner_return_quote(p_category text, …)

notify pgrst, 'reload schema';
