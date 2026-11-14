// Franchise sales channel jobs (owned by Russ): franchisees and outlets, outlet staff and sellers, franchise enquiries,
// outlet performance by intake period and confirmed sales by outlet. Each job calls the same Postgres function the
// Franchise screen uses, as the signed-in broker in the request's category.
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'

type Category = 'sample' | 'live'
type Call = (db: SupabaseClient, fn: string, args: Record<string, unknown>) => Promise<unknown>

export interface FranchiseJob {
  name: string
  title: string
  owner: 'russ'
  write: boolean
  lines: string[]
  description: string
  input: z.ZodObject<z.ZodRawShape>
  run: (db: SupabaseClient, category: Category, args: Record<string, unknown>) => Promise<unknown>
}

export function franchiseJobs(call: Call, key: z.ZodTypeAny, copilot: z.ZodTypeAny, lines: string[]): FranchiseJob[] {
  const uuid = z.string().uuid()
  const day = z.string().date()
  const opt = <T,>(v: T | undefined) => v ?? null
  const job = (j: Omit<FranchiseJob, 'owner' | 'lines'>): FranchiseJob => ({ ...j, owner: 'russ', lines })
  return [
    job({
      name: 'franchise.setup',
      title: 'Set up a franchisee and outlet',
      write: true,
      description:
        'Create or reopen a franchisee (partner business) and one outlet, save who receives its enquiries and whether the outlet refers to a broker or sells, and optionally invite the outlet manager. Returns the outlet customer code, /r/ link and manager invitation link. If the receiving broker name matches several team members, returns the choices.',
      input: z.object({
        partner_name: z.string().min(2).optional(),
        partner_id: uuid.optional(),
        outlet_name: z.string().min(2).optional(),
        service_area: z.string().optional(),
        receiving_member_id: uuid.optional(),
        receiving_member_name: z.string().optional(),
        sales_mode: z.enum(['refer', 'sell']).optional(),
        manager_name: z.string().optional(),
        manager_email: z.string().email().optional(),
        manager_phone: z.string().optional(),
        idempotency_key: key,
        copilot,
      }),
      run: (db, category, a) =>
        call(db, 'franchise_setup', {
          p_category: category, p_partner_name: opt(a.partner_name), p_idempotency_key: a.idempotency_key, p_outlet_name: opt(a.outlet_name),
          p_service_area: opt(a.service_area), p_receiving_member_id: opt(a.receiving_member_id), p_receiving_member_name: opt(a.receiving_member_name),
          p_sales_mode: opt(a.sales_mode), p_manager_name: opt(a.manager_name), p_manager_email: opt(a.manager_email), p_manager_phone: opt(a.manager_phone),
          p_partner_id: opt(a.partner_id), p_copilot: a.copilot,
        }),
    }),
    job({
      name: 'franchise.outlet.update',
      title: 'Update outlet routing',
      write: true,
      description: 'Change an outlet’s receiving broker, sales mode (refer or sell), name, area or status, or pause the franchisee. Enquiry credit already given never changes.',
      input: z.object({
        outlet_id: uuid,
        name: z.string().optional(),
        service_area: z.string().optional(),
        receiving_member_id: uuid.optional(),
        receiving_member_name: z.string().optional(),
        sales_mode: z.enum(['refer', 'sell']).optional(),
        status: z.enum(['active', 'paused']).optional(),
        partner_status: z.enum(['active', 'paused']).optional(),
        idempotency_key: key,
        copilot,
      }),
      run: (db, category, a) =>
        call(db, 'franchise_update_outlet', {
          p_category: category, p_outlet_id: a.outlet_id, p_idempotency_key: a.idempotency_key, p_name: opt(a.name), p_service_area: opt(a.service_area),
          p_receiving_member_id: opt(a.receiving_member_id), p_receiving_member_name: opt(a.receiving_member_name), p_sales_mode: opt(a.sales_mode),
          p_status: opt(a.status), p_partner_status: opt(a.partner_status), p_copilot: a.copilot,
        }),
    }),
    job({
      name: 'franchise.staff.invite',
      title: 'Invite outlet staff',
      write: true,
      description: 'Add an outlet manager or staff member with a personal referral code that credits the outlet, and issue their private sign-in invitation. Referral access only.',
      input: z.object({
        outlet_id: uuid,
        full_name: z.string().min(2),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        outlet_role: z.enum(['manager', 'staff']).optional(),
        idempotency_key: key,
        copilot,
      }),
      run: (db, category, a) =>
        call(db, 'franchise_invite_staff', {
          p_category: category, p_outlet_id: a.outlet_id, p_full_name: a.full_name, p_idempotency_key: a.idempotency_key, p_email: opt(a.email),
          p_phone: opt(a.phone), p_outlet_role: a.outlet_role ?? 'staff', p_copilot: a.copilot,
        }),
    }),
    job({
      name: 'franchise.seller.link',
      title: 'Authorise a seller at an outlet',
      write: true,
      description: 'Let an existing broker, sub-broker or agent sell at an outlet. In "sell" mode, enquiries under their outlet code are routed to them; the outlet keeps the credit.',
      input: z.object({ outlet_id: uuid, member_id: uuid.optional(), member_name: z.string().optional(), idempotency_key: key, copilot }),
      run: (db, category, a) =>
        call(db, 'franchise_link_seller', {
          p_category: category, p_outlet_id: a.outlet_id, p_idempotency_key: a.idempotency_key, p_member_id: opt(a.member_id), p_member_name: opt(a.member_name),
          p_copilot: a.copilot,
        }),
    }),
    job({
      name: 'franchise.list',
      title: 'Franchisees and outlets',
      write: false,
      description: 'Every franchisee with its outlets: code, link, area, receiving broker, sales mode, staff count, enquiries and sales.',
      input: z.object({}),
      run: (db, category) => call(db, 'franchise_list', { p_category: category }),
    }),
    job({
      name: 'franchise.outlet.get',
      title: 'Outlet detail',
      write: false,
      description: 'One outlet with its staff, sellers, invitation status and enquiry counts by stage.',
      input: z.object({ outlet_id: uuid }),
      run: (db, category, a) => call(db, 'franchise_outlet_detail', { p_category: category, p_outlet_id: a.outlet_id }),
    }),
    job({
      name: 'franchise.enquiries.grid',
      title: 'Franchise enquiries',
      write: false,
      description:
        'Enquiries that came through franchise outlets: outlet, client number or contact phone, handling broker, time received and stage. status=uncontacted lists enquiries nobody has contacted yet.',
      input: z.object({
        status: z.enum(['uncontacted', 'contacted', 'offered', 'sold']).optional(),
        outlet_id: uuid.optional(),
        partner_id: uuid.optional(),
        from: day.optional(),
        to: day.optional(),
        query: z.string().optional(),
        limit: z.number().int().min(1).max(500).optional(),
      }),
      run: (db, category, a) =>
        call(db, 'franchise_enquiry_grid', {
          p_category: category, p_status: opt(a.status), p_outlet_id: opt(a.outlet_id), p_partner_id: opt(a.partner_id), p_from: opt(a.from), p_to: opt(a.to),
          p_query: opt(a.query), p_limit: a.limit ?? 100,
        }),
    }),
    job({
      name: 'franchise.performance',
      title: 'Outlet performance',
      write: false,
      description:
        'For enquiries received in the intake period: per outlet and franchisee, enquiries, enquiries offered, enquiries sold and conversion (sold ÷ received). Each enquiry counts once per stage however many quotes it had.',
      input: z.object({ from: day.optional(), to: day.optional(), partner_id: uuid.optional() }),
      run: (db, category, a) => call(db, 'franchise_performance', { p_category: category, p_from: opt(a.from), p_to: opt(a.to), p_partner_id: opt(a.partner_id) }),
    }),
    job({
      name: 'franchise.sales',
      title: 'Sales by originating outlet',
      write: false,
      description: 'Confirmed sales in the sale-date period by originating outlet, with each sale’s enquiry reference, client number and seller.',
      input: z.object({ from: day.optional(), to: day.optional(), outlet_id: uuid.optional(), partner_id: uuid.optional() }),
      run: (db, category, a) =>
        call(db, 'franchise_sales', { p_category: category, p_from: opt(a.from), p_to: opt(a.to), p_outlet_id: opt(a.outlet_id), p_partner_id: opt(a.partner_id) }),
    }),
    job({
      name: 'franchise.client.attribution',
      title: 'Who referred, handled and sold',
      write: false,
      description: 'For one client: each enquiry with its originating franchisee and outlet, referring staff member, current handler and seller.',
      input: z.object({ person_id: uuid }),
      run: (db, category, a) => call(db, 'franchise_client_attribution', { p_category: category, p_person_id: a.person_id }),
    }),
    job({
      name: 'sales.team.find',
      title: 'Find a team member',
      write: false,
      description: 'Find brokers, sub-brokers and agents by name, first name, referral code or similar spelling.',
      input: z.object({ query: z.string().min(2) }),
      run: (db, category, a) => call(db, 'sales_find_member', { p_category: category, p_query: a.query }),
    }),
  ]
}
