// B-Covered MCP server: the business jobs AR, Ava and Russ can run, exposed over MCP (Streamable HTTP).
// Every tool runs a Postgres function as the signed-in broker, in the category named by the x-data-category header, so tenant,
// staff and Sample / Live row-level security apply to every read and write. No service-role key is used here.
import { Hono } from 'hono'
import { McpServer, StreamableHttpTransport } from 'mcp-lite'
import { z } from 'zod'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { franchiseJobs } from './franchise.ts'

const VERSION = '1.1.0'
type Category = 'sample' | 'live'
type Copilot = 'ar' | 'ava' | 'russ'
type Owner = 'shared' | 'ava' | 'russ'

interface Job {
  name: string
  title: string
  owner: Owner
  write: boolean
  lines: string[]
  description: string
  input: z.ZodObject<z.ZodRawShape>
  run: (db: SupabaseClient, category: Category, args: Record<string, unknown>) => Promise<unknown>
}

const uuid = z.string().uuid()
const key = z.string().min(8).max(200).describe('Idempotency key: the same key returns the original receipt instead of writing twice')
const copilot = z.enum(['ar', 'ava', 'russ']).default('ar').describe('Copilot performing the action')
const ALL_LINES = ['short_term_personal', 'short_term_commercial', 'individual_life', 'group_risk']
const PEOPLE = ['short_term_personal', 'individual_life']
const BUSINESS = ['short_term_commercial', 'group_risk']

class JobError extends Error {
  constructor(public code: string, message: string) {
    super(message)
  }
}

async function call(db: SupabaseClient, fn: string, args: Record<string, unknown>) {
  const { data, error } = await db.rpc(fn, args)
  if (error) {
    const known = ['forbidden', 'not_found', 'needs_input', 'category_mismatch', 'not_linked', 'validation']
    if (known.includes(error.message)) throw new JobError(error.message, error.details ?? error.message)
    if (error.code === '23503' && /_cat_fk|category/.test(`${error.message} ${error.details ?? ''}`)) {
      throw new JobError('category_mismatch', 'A linked record belongs to the other category. Sample and Live records cannot be linked.')
    }
    if (error.code === '23503') throw new JobError('not_found', 'A linked record does not exist in this category.')
    if (error.code === '42501') throw new JobError('forbidden', 'You are not permitted to do that.')
    throw new JobError('failed', error.message)
  }
  return data
}

const JOBS: Job[] = [
  {
    name: 'records.search',
    title: 'Search clients, accounts and policies',
    owner: 'shared',
    write: false,
    lines: ALL_LINES,
    description: 'Find clients, accounts and policies by exact client, account or policy number, full or partial name, or similar spelling.',
    input: z.object({
      query: z.string().min(2),
      kinds: z.array(z.enum(['client', 'account', 'policy'])).optional(),
      limit: z.number().int().min(1).max(25).optional(),
    }),
    run: (db, category, a) => call(db, 'copilot_search_records', { p_category: category, p_query: a.query, p_kinds: a.kinds ?? null, p_limit: a.limit ?? 8 }),
  },
  {
    name: 'records.overview',
    title: 'Client or account overview',
    owner: 'shared',
    write: false,
    lines: ALL_LINES,
    description: 'Linked accounts, people, policies, schemes, recent notes and open follow-ups for one client or account. scope narrows to people or business lines.',
    input: z.object({ record_type: z.enum(['client', 'account']), id: uuid, scope: z.enum(['all', 'people', 'business']).optional() }),
    run: (db, category, a) => call(db, 'copilot_record_overview', { p_category: category, p_record_type: a.record_type, p_id: a.id, p_scope: a.scope ?? 'all' }),
  },
  {
    name: 'client.create',
    title: 'Create a client',
    owner: 'shared',
    write: true,
    lines: ALL_LINES,
    description: 'Create a client (person) with a new client number, on an existing account or a new personal account. Returns possible duplicates instead of saving unless force is true.',
    input: z.object({
      first_names: z.string().min(1),
      surname: z.string().min(1),
      date_of_birth: z.string().date().optional(),
      account_id: uuid.optional(),
      force: z.boolean().optional(),
      idempotency_key: key,
      copilot,
    }),
    run: (db, category, a) =>
      call(db, 'copilot_create_client', {
        p_category: category, p_first_names: a.first_names, p_surname: a.surname, p_idempotency_key: a.idempotency_key, p_copilot: a.copilot,
        p_date_of_birth: a.date_of_birth ?? null, p_account_id: a.account_id ?? null, p_force: a.force ?? false,
      }),
  },
  {
    name: 'account.create',
    title: 'Create an account',
    owner: 'shared',
    write: true,
    lines: ALL_LINES,
    description: 'Create a personal or business account with a new account number, optionally linking its primary person.',
    input: z.object({ name: z.string().min(2), type: z.enum(['personal', 'commercial']), primary_person_id: uuid.optional(), idempotency_key: key, copilot }),
    run: (db, category, a) =>
      call(db, 'copilot_create_account', {
        p_category: category, p_name: a.name, p_type: a.type, p_idempotency_key: a.idempotency_key, p_copilot: a.copilot, p_primary_person_id: a.primary_person_id ?? null,
      }),
  },
  {
    name: 'interaction.record',
    title: 'Record a note or interaction',
    owner: 'shared',
    write: true,
    lines: ALL_LINES,
    description: 'Save a note, call, meeting, email or callback request against a client, account and, where relevant, a policy. Returns the saved reference.',
    input: z.object({
      body: z.string().min(1),
      kind: z.enum(['note', 'call', 'meeting', 'email', 'callback_request']).optional(),
      person_id: uuid.optional(),
      customer_id: uuid.optional(),
      policy_id: uuid.optional(),
      subject_table: z.string().optional(),
      subject_id: uuid.optional(),
      idempotency_key: key,
      copilot,
    }),
    run: (db, category, a) =>
      call(db, 'copilot_record_interaction', {
        p_category: category, p_body: a.body, p_idempotency_key: a.idempotency_key, p_copilot: a.copilot, p_kind: a.kind ?? 'note',
        p_person_id: a.person_id ?? null, p_customer_id: a.customer_id ?? null, p_policy_id: a.policy_id ?? null,
        p_subject_table: a.subject_table ?? null, p_subject_id: a.subject_id ?? null,
      }),
  },
  {
    name: 'task.create',
    title: 'Create a follow-up',
    owner: 'shared',
    write: true,
    lines: ALL_LINES,
    description: 'Create a broker follow-up (for example a callback) against a client, account or policy. A due date is optional.',
    input: z.object({
      title: z.string().min(2),
      detail: z.string().optional(),
      due_date: z.string().optional(),
      person_id: uuid.optional(),
      customer_id: uuid.optional(),
      policy_id: uuid.optional(),
      idempotency_key: key,
      copilot,
    }),
    run: (db, category, a) =>
      call(db, 'copilot_create_task', {
        p_category: category, p_title: a.title, p_idempotency_key: a.idempotency_key, p_copilot: a.copilot, p_detail: a.detail ?? null,
        p_due_date: a.due_date ?? null, p_person_id: a.person_id ?? null, p_customer_id: a.customer_id ?? null, p_policy_id: a.policy_id ?? null,
      }),
  },
  {
    name: 'history.list',
    title: 'Client history',
    owner: 'shared',
    write: false,
    lines: ALL_LINES,
    description: 'Notes, follow-ups, policies and quote requests for a client or account in date order. Narrow by copilot (ava = people lines, russ = business lines) or record type.',
    input: z.object({
      person_id: uuid.optional(),
      customer_id: uuid.optional(),
      copilot: z.enum(['ava', 'russ']).optional(),
      record_type: z.enum(['interaction', 'task', 'policy', 'quote_request']).optional(),
      limit: z.number().int().min(1).max(200).optional(),
    }),
    run: (db, category, a) =>
      call(db, 'copilot_list_history', {
        p_category: category, p_person_id: a.person_id ?? null, p_customer_id: a.customer_id ?? null, p_copilot: a.copilot ?? null,
        p_record_type: a.record_type ?? null, p_limit: a.limit ?? 50,
      }),
  },
  {
    name: 'ava.policies.list',
    title: 'Personal policies',
    owner: 'ava',
    write: false,
    lines: PEOPLE,
    description: 'Motor, home, contents and individual life policies for a client or personal account, optionally filtered by cover type or status.',
    input: z.object({ person_id: uuid.optional(), customer_id: uuid.optional(), cover_type: z.string().optional(), status: z.string().optional() }),
    run: (db, category, a) =>
      call(db, 'copilot_list_policies', {
        p_category: category, p_person_id: a.person_id ?? null, p_customer_id: a.customer_id ?? null, p_copilot: 'ava', p_cover_type: a.cover_type ?? null, p_status: a.status ?? null,
      }),
  },
  {
    name: 'ava.policy.get',
    title: 'Policy detail',
    owner: 'ava',
    write: false,
    lines: PEOPLE,
    description: 'One policy with its parties and notes.',
    input: z.object({ policy_id: uuid }),
    run: (db, category, a) => call(db, 'copilot_get_policy', { p_category: category, p_policy_id: a.policy_id }),
  },
  {
    name: 'ava.quote_request.create',
    title: 'Create a personal quote request',
    owner: 'ava',
    write: true,
    lines: ['short_term_personal'],
    description: 'Capture a motor, home or contents quote request for a personal account. Creates a lead for the broker; no quote is sent to an insurer.',
    input: z.object({ customer_id: uuid, product_category: z.string().min(2), summary: z.string().optional(), person_id: uuid.optional(), idempotency_key: key }),
    run: (db, category, a) =>
      call(db, 'copilot_create_quote_request', {
        p_category: category, p_customer_id: a.customer_id, p_product_category: a.product_category, p_idempotency_key: a.idempotency_key, p_copilot: 'ava',
        p_summary: a.summary ?? null, p_person_id: a.person_id ?? null,
      }),
  },
  {
    name: 'ava.life_application.create',
    title: 'Create a life application',
    owner: 'ava',
    write: true,
    lines: ['individual_life'],
    description: 'Record an individual life application (status application submitted) for an existing client. Nothing is sent to an insurer.',
    input: z.object({ person_id: uuid, customer_id: uuid.optional(), premium_amount: z.number().positive().optional(), idempotency_key: key }),
    run: (db, category, a) =>
      call(db, 'copilot_create_life_application', {
        p_category: category, p_person_id: a.person_id, p_idempotency_key: a.idempotency_key, p_copilot: 'ava', p_customer_id: a.customer_id ?? null,
        p_premium_amount: a.premium_amount ?? null,
      }),
  },
  {
    name: 'ava.life_application.get',
    title: 'Latest life application',
    owner: 'ava',
    write: false,
    lines: ['individual_life'],
    description: "The client's latest life application or, if none is open, their latest life policy.",
    input: z.object({ person_id: uuid.optional(), customer_id: uuid.optional() }),
    run: (db, category, a) => call(db, 'copilot_get_life_application', { p_category: category, p_person_id: a.person_id ?? null, p_customer_id: a.customer_id ?? null }),
  },
  {
    name: 'russ.business.overview',
    title: 'Business account overview',
    owner: 'russ',
    write: false,
    lines: BUSINESS,
    description: 'Business profile, commercial policies, group schemes, notes and follow-ups for a business account.',
    input: z.object({ customer_id: uuid }),
    run: (db, category, a) => call(db, 'copilot_record_overview', { p_category: category, p_record_type: 'account', p_id: a.customer_id, p_scope: 'business' }),
  },
  {
    name: 'russ.policies.list',
    title: 'Business policies',
    owner: 'russ',
    write: false,
    lines: BUSINESS,
    description: 'Commercial and group risk policies for a business account.',
    input: z.object({ customer_id: uuid, cover_type: z.string().optional(), status: z.string().optional() }),
    run: (db, category, a) =>
      call(db, 'copilot_list_policies', { p_category: category, p_customer_id: a.customer_id, p_copilot: 'russ', p_cover_type: a.cover_type ?? null, p_status: a.status ?? null }),
  },
  {
    name: 'russ.scheme.overview',
    title: 'Group schemes',
    owner: 'russ',
    write: false,
    lines: ['group_risk'],
    description: "An employer's group benefit schemes with active member counts.",
    input: z.object({ customer_id: uuid }),
    run: async (db, category, a) => {
      const ov = (await call(db, 'copilot_record_overview', { p_category: category, p_record_type: 'account', p_id: a.customer_id, p_scope: 'business' })) as {
        account: unknown
        schemes: unknown[]
      }
      return { account: ov.account, schemes: ov.schemes }
    },
  },
  {
    name: 'russ.members.list',
    title: 'Scheme members',
    owner: 'russ',
    write: false,
    lines: ['group_risk'],
    description: 'Members of a group scheme with client numbers, status and cover.',
    input: z.object({ scheme_id: uuid }),
    run: (db, category, a) => call(db, 'copilot_scheme_members', { p_category: category, p_scheme_id: a.scheme_id }),
  },
  ...SALES_JOBS(),
  ...franchiseJobs(call, key, copilot, ALL_LINES),
]

// The broker sales book: the same database functions the My workspace buttons call.
function SALES_JOBS(): Job[] {
  const job = (j: Omit<Job, 'owner' | 'lines'>): Job => ({ ...j, owner: 'shared', lines: ALL_LINES })
  const opt = <T,>(v: T | undefined) => v ?? null
  return [
    job({
      name: 'sales.workspace.setup',
      title: 'Set up or reopen my brokerage workspace',
      write: true,
      description: 'Create the signed-in broker’s brokerage workspace, or reopen the one they already have, and return their customer referral code. Repeating it never creates a second workspace.',
      input: z.object({ brokerage_name: z.string().min(2).optional(), full_name: z.string().optional(), phone: z.string().optional(), service_area: z.string().optional() }),
      run: (db, _category, a) =>
        call(db, 'sales_setup_workspace', { p_brokerage_name: opt(a.brokerage_name), p_full_name: opt(a.full_name), p_phone: opt(a.phone), p_service_area: opt(a.service_area) }),
    }),
    job({
      name: 'sales.profile',
      title: 'My sales profile',
      write: false,
      description: 'The signed-in user’s brokerage, sales role, referral code and whether Live is open.',
      input: z.object({}),
      run: (db) => call(db, 'sales_my_profile', {}),
    }),
    job({
      name: 'sales.team.invite',
      title: 'Invite a sub-broker or agent',
      write: true,
      description: 'Find or invite a team member under the current brokerage with their role and service area. Returns their customer referral code and invitation status; a repeat request returns the existing member.',
      input: z.object({
        full_name: z.string().min(2).optional(),
        role: z.enum(['sub_broker', 'agent']),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        service_area: z.string().optional(),
        idempotency_key: key,
        copilot,
      }),
      run: (db, category, a) =>
        call(db, 'sales_invite_member', {
          p_category: category, p_full_name: opt(a.full_name), p_role: a.role, p_idempotency_key: a.idempotency_key, p_email: opt(a.email),
          p_phone: opt(a.phone), p_service_area: opt(a.service_area), p_copilot: a.copilot,
        }),
    }),
    job({
      name: 'sales.team.list',
      title: 'Team and referral codes',
      write: false,
      description: 'Brokers, sub-brokers and agents in the brokerage with roles, service areas, invitation status, referral codes and client counts.',
      input: z.object({}),
      run: (db, category) => call(db, 'sales_list_team', { p_category: category }),
    }),
    job({
      name: 'sales.team.invite_link',
      title: 'Private team invitation link',
      write: true,
      description: 'Issue a fresh private invitation link for a team member who has not joined yet (the previous link stops working).',
      input: z.object({ member_id: uuid }),
      run: (db, category, a) => call(db, 'sales_invite_link', { p_category: category, p_member_id: a.member_id }),
    }),
    job({
      name: 'sales.enquiry.capture',
      title: 'Load a prospect or enquiry',
      write: true,
      description: 'Record an enquiry against a referral code (or the caller), check the brokerage for an existing contact and link or create the prospect. Returns possible duplicates unless force_new or link_person_id is given.',
      input: z.object({
        first_names: z.string().min(1),
        surname: z.string().min(1),
        phone: z.string().optional(),
        email: z.string().optional(),
        interest: z.string().optional(),
        note: z.string().optional(),
        referral_code: z.string().optional(),
        assign_member_id: uuid.optional(),
        link_person_id: uuid.optional(),
        force_new: z.boolean().optional(),
        idempotency_key: key,
        copilot,
      }),
      run: (db, category, a) =>
        call(db, 'sales_capture_enquiry', {
          p_category: category, p_first_names: a.first_names, p_surname: a.surname, p_idempotency_key: a.idempotency_key, p_phone: opt(a.phone),
          p_email: opt(a.email), p_interest: opt(a.interest), p_note: opt(a.note), p_referral_code: opt(a.referral_code), p_source: 'copilot',
          p_assign_member_id: opt(a.assign_member_id), p_link_person_id: opt(a.link_person_id), p_force_new: a.force_new ?? false, p_copilot: a.copilot,
        }),
    }),
    job({
      name: 'sales.book.grid',
      title: 'Client grid',
      write: false,
      description: 'Clients and prospects with client number, assigned person, referrer, stage, last communication and next follow-up. Filter by mine/team, a team member (assigned or referred), stage or search text.',
      input: z.object({
        scope: z.enum(['mine', 'team']).optional(),
        member_id: uuid.optional(),
        stage: z.enum(['new_enquiry', 'offer_sent', 'accepted', 'sold', 'client']).optional(),
        query: z.string().optional(),
        limit: z.number().int().min(1).max(500).optional(),
      }),
      run: (db, category, a) =>
        call(db, 'sales_book_grid', { p_category: category, p_scope: a.scope ?? 'team', p_member_id: opt(a.member_id), p_stage: opt(a.stage), p_query: opt(a.query), p_limit: a.limit ?? 100 }),
    }),
    job({
      name: 'sales.client.record',
      title: 'Client sales record',
      write: false,
      description: 'One client’s details, assignment, original referral, enquiries, offers, sales, communications timeline and open follow-ups.',
      input: z.object({ person_id: uuid }),
      run: (db, category, a) => call(db, 'sales_client_record', { p_category: category, p_person_id: a.person_id }),
    }),
    job({
      name: 'sales.client.reassign',
      title: 'Reassign a client',
      write: true,
      description: 'Broker only: move a client to another team member. The original referrer is kept.',
      input: z.object({ person_id: uuid, member_id: uuid, reason: z.string().optional(), idempotency_key: key, copilot }),
      run: (db, category, a) =>
        call(db, 'sales_reassign_client', { p_category: category, p_person_id: a.person_id, p_member_id: a.member_id, p_idempotency_key: a.idempotency_key, p_reason: opt(a.reason), p_copilot: a.copilot }),
    }),
    job({
      name: 'sales.offer.create',
      title: 'Create an offer',
      write: true,
      description: 'Create an offer for a client from a saved quote option, or from insurer, product, premium and frequency. If several quotes qualify and none is chosen, returns the choices.',
      input: z.object({
        person_id: uuid,
        quote_option_id: uuid.optional(),
        insurer_name: z.string().optional(),
        product: z.string().optional(),
        premium_amount: z.number().positive().optional(),
        premium_frequency: z.enum(['monthly', 'quarterly', 'annually', 'single']).optional(),
        notes: z.string().optional(),
        idempotency_key: key,
        copilot,
      }),
      run: (db, category, a) =>
        call(db, 'sales_create_offer', {
          p_category: category, p_person_id: a.person_id, p_idempotency_key: a.idempotency_key, p_quote_option_id: opt(a.quote_option_id),
          p_insurer_name: opt(a.insurer_name), p_product: opt(a.product), p_premium_amount: opt(a.premium_amount),
          p_premium_frequency: a.premium_frequency ?? 'monthly', p_notes: opt(a.notes), p_copilot: a.copilot,
        }),
    }),
    job({
      name: 'sales.offer.message',
      title: 'Customer offer message',
      write: false,
      description: 'The customer-facing summary of an offer, ready to copy or send by WhatsApp or email.',
      input: z.object({ offer_id: uuid }),
      run: (db, category, a) => call(db, 'sales_offer_message', { p_category: category, p_offer_id: a.offer_id }),
    }),
    job({
      name: 'sales.offer.sent',
      title: 'Log an offer as sent',
      write: true,
      description: 'Record that the broker sent the offer (WhatsApp, email, call, in person) and log the communication against the client and offer.',
      input: z.object({ offer_id: uuid, channel: z.enum(['whatsapp', 'email', 'call', 'in_person', 'other']), note: z.string().optional(), idempotency_key: key, copilot }),
      run: (db, category, a) =>
        call(db, 'sales_mark_offer_sent', { p_category: category, p_offer_id: a.offer_id, p_idempotency_key: a.idempotency_key, p_channel: a.channel, p_note: opt(a.note), p_copilot: a.copilot }),
    }),
    job({
      name: 'sales.offer.accept',
      title: 'Record acceptance',
      write: true,
      description: 'Mark an offer accepted with the date and create a follow-up to confirm cover with the insurer.',
      input: z.object({ offer_id: uuid, accepted_on: z.string().date().optional(), note: z.string().optional(), idempotency_key: key, copilot }),
      run: (db, category, a) =>
        call(db, 'sales_record_acceptance', { p_category: category, p_offer_id: a.offer_id, p_idempotency_key: a.idempotency_key, p_accepted_on: opt(a.accepted_on), p_note: opt(a.note), p_copilot: a.copilot }),
    }),
    job({
      name: 'sales.sale.record',
      title: 'Record a sale',
      write: true,
      description: 'Once the insurer has confirmed cover: record the policy or confirmation reference and start date, mark the offer sold and convert the prospect to a client. Recorded once per offer.',
      input: z.object({ offer_id: uuid, insurer_reference: z.string().min(2).optional(), cover_start_date: z.string().date().optional(), idempotency_key: key, copilot }),
      run: (db, category, a) =>
        call(db, 'sales_record_sale', {
          p_category: category, p_offer_id: a.offer_id, p_idempotency_key: a.idempotency_key, p_insurer_reference: opt(a.insurer_reference),
          p_cover_start_date: opt(a.cover_start_date), p_copilot: a.copilot,
        }),
    }),
    job({
      name: 'sales.comms.log',
      title: 'Log a communication',
      write: true,
      description: 'Log a call, WhatsApp, email, meeting or note with direction and a short summary on the client, optionally linked to an offer.',
      input: z.object({
        person_id: uuid,
        kind: z.enum(['call', 'whatsapp', 'email', 'meeting', 'note']),
        body: z.string().min(1),
        direction: z.enum(['outbound', 'inbound', 'internal']).optional(),
        offer_id: uuid.optional(),
        occurred_at: z.string().optional(),
        idempotency_key: key,
        copilot,
      }),
      run: (db, category, a) =>
        call(db, 'sales_log_communication', {
          p_category: category, p_person_id: a.person_id, p_kind: a.kind, p_body: a.body, p_idempotency_key: a.idempotency_key,
          p_direction: a.direction ?? 'outbound', p_offer_id: opt(a.offer_id), p_occurred_at: opt(a.occurred_at), p_copilot: a.copilot,
        }),
    }),
    job({
      name: 'sales.followup.create',
      title: 'Create a dated follow-up',
      write: true,
      description: 'A follow-up assigned to the signed-in user for a client, optionally linked to an offer.',
      input: z.object({ person_id: uuid, title: z.string().min(2), due_date: z.string().optional(), offer_id: uuid.optional(), detail: z.string().optional(), idempotency_key: key, copilot }),
      run: (db, category, a) =>
        call(db, 'sales_create_follow_up', {
          p_category: category, p_person_id: a.person_id, p_title: a.title, p_idempotency_key: a.idempotency_key, p_due_date: opt(a.due_date),
          p_offer_id: opt(a.offer_id), p_detail: opt(a.detail), p_copilot: a.copilot,
        }),
    }),
    job({
      name: 'sales.referral.funnel',
      title: 'Referral funnel',
      write: false,
      description: 'For each team member: enquiries from their referral code, prospects, clients with offers, offers sent, accepted and sold. Live totals only count Live sales.',
      input: z.object({}),
      run: (db, category) => call(db, 'sales_referral_funnel', { p_category: category }),
    }),
  ]
}

function serverFor(db: SupabaseClient, category: Category) {
  const mcp = new McpServer({ name: 'bcovered-mcp', version: VERSION, schemaAdapter: (schema) => z.toJSONSchema(schema as z.ZodType) })
  for (const job of JOBS) {
    mcp.tool(job.name, {
      title: job.title,
      description: job.description,
      inputSchema: job.input,
      _meta: { copilot: job.owner, write: job.write, lines: job.lines, category },
      handler: async (args: Record<string, unknown>) => {
        try {
          const data = await job.run(db, category, args)
          return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: { ok: true, data, category } }
        } catch (e) {
          const code = e instanceof JobError ? e.code : 'failed'
          const message = e instanceof Error ? e.message : String(e)
          return { isError: true, content: [{ type: 'text', text: `${code}: ${message}` }], structuredContent: { ok: false, error: { code, message }, category } }
        }
      },
    })
  }
  return mcp
}

function dbFor(req: Request, category: Category) {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '', 'x-data-category': category } },
  })
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, accept, x-data-category, mcp-session-id, mcp-protocol-version',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Expose-Headers': 'mcp-session-id',
}

const app = new Hono().basePath('/bcovered-mcp')
app.options('*', () => new Response(null, { headers: CORS }))
app.get('/', (c) => c.json({ name: 'bcovered-mcp', version: VERSION, endpoints: { mcp: '/bcovered-mcp/mcp', health: '/bcovered-mcp/health' } }, 200, CORS))
app.get('/health', (c) =>
  c.json({ ok: true, version: VERSION, tools: JOBS.map((j) => ({ name: j.name, copilot: j.owner, write: j.write })) }, 200, CORS),
)
app.all('/mcp', async (c) => {
  const header = c.req.header('x-data-category')
  if (header !== 'sample' && header !== 'live') {
    return c.json({ error: 'Send x-data-category: sample or live. Every job is scoped to one category.' }, 400, CORS)
  }
  if (!c.req.header('Authorization')) return c.json({ error: 'Sign in first: send the broker access token as a Bearer token.' }, 401, CORS)
  const handler = new StreamableHttpTransport().bind(serverFor(dbFor(c.req.raw, header), header))
  const res = await handler(c.req.raw)
  const headers = new Headers(res.headers)
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v)
  return new Response(res.body, { status: res.status, headers })
})

Deno.serve(app.fetch)
