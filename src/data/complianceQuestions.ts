// Open regulatory questions that must be answered by the compliance officer or key individual before production use.
// The platform records these as configuration and guardrails; it does not answer them.

export interface ComplianceQuestion {
  id: string
  topic: string
  question: string
  why: string
  blocks: string[]
  owner: string
  status: 'open' | 'answered'
  answer: string | null
}

export const COMPLIANCE_QUESTIONS: ComplianceQuestion[] = [
  {
    id: 'fais-categories',
    topic: 'FAIS licence',
    question: 'Which Category I subproducts does the B-Covered FSP licence cover, and which representatives hold each?',
    why: 'Adviser authorisations gate life advice, Record of Advice sign-off and application approval.',
    blocks: ['Life advice in production', 'adviser_authorisations seed values'],
    owner: 'Key individual',
    status: 'open',
    answer: null,
  },
  {
    id: 'roa-template',
    topic: 'Record of Advice',
    question: 'What content and wording must the Record of Advice template contain, including replacement and commission disclosures?',
    why: 'Russ drafts Records of Advice from the configured sections; the template must match the FSP’s compliance requirements.',
    blocks: ['Record of Advice delivery to clients'],
    owner: 'Compliance officer',
    status: 'open',
    answer: null,
  },
  {
    id: 'section-14-role',
    topic: 'Section 14 transfers',
    question: 'What is B-Covered’s role in Section 14 transfers, and which milestones does it record versus observe?',
    why: 'The transfer workspace records stages and evidence; it must not imply that B-Covered performs the transfer.',
    blocks: ['Transfers & conversions in production'],
    owner: 'Compliance officer',
    status: 'open',
    answer: null,
  },
  {
    id: 'popia-status',
    topic: 'POPIA',
    question: 'Is B-Covered an operator or a responsible party for member data received from administrators, payroll providers and employers? What are the retention periods?',
    why: 'Determines operator agreements, access grants, retention and deletion rules for imported member data.',
    blocks: ['Real payroll and administrator imports'],
    owner: 'Information officer',
    status: 'open',
    answer: null,
  },
  {
    id: 'investment-reporting',
    topic: 'Investment reporting',
    question: 'Does reporting calculated investment performance to clients or trustees require anything beyond intermediary services under the licence?',
    why: 'Investment analytics are labelled as calculated, but distribution to clients may carry licence implications.',
    blocks: ['Sharing investment analytics outside B-Covered'],
    owner: 'Key individual',
    status: 'open',
    answer: null,
  },
  {
    id: 'cell-confidentiality',
    topic: 'Cell captives',
    question: 'What does each cell agreement require for confidentiality, profit-share terms and the reporting basis?',
    why: 'Cell results are calculated from the terms configured per agreement, and cell owners only see their own cell.',
    blocks: ['Cell owner reporting in production'],
    owner: 'Compliance officer',
    status: 'open',
    answer: null,
  },
  {
    id: 'trustee-signoff',
    topic: 'Trustee governance',
    question: 'Who signs off trustee packs and resolutions, so that B-Covered only records decisions and never makes them?',
    why: 'Trustee packs are reporting; recorded decisions must name the deciding body.',
    blocks: ['Issuing trustee packs to boards'],
    owner: 'Principal officer of each fund',
    status: 'open',
    answer: null,
  },
  {
    id: 'two-pot',
    topic: 'Two-pot system',
    question: 'Are the configured two-pot parameters (effective date, component shares, seed capital, minimum withdrawal) current, and which administrator rules apply?',
    why: 'Two-pot indicators read from dated configuration and must match current legislation and administrator rules.',
    blocks: ['Two-pot indicators shown to clients'],
    owner: 'Compliance officer',
    status: 'open',
    answer: null,
  },
]
