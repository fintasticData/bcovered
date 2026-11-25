/** Content baseline from www.bcovered.co.za — Phase 1 clone under /migration */

export const MIGRATION_BASE = '/migration'

export const brand = {
  name: 'BCovered',
  legalName: 'B-Covered (PTY) LTD',
  tagline: 'Insurance as simple as A,B,Covered.',
  email: 'support@bcovered.co.za',
  address: '2nd floor 3 Dorethea Street, Annlin Pretoria',
  officeHours: 'Mon - Fri: 08:00 - 17:00',
  instagram: 'https://www.instagram.com/bcovered_',
  metaDescription:
    'Welcome to BCovered, South Africa’s premier digital insurance marketplace. Insurance. Simplified. All in One Place.',
}

export type ProductSlug = 'car-insurance' | 'home-contents-insurance' | 'building-insurance'

export const products: {
  slug: ProductSlug
  label: string
  shortLabel: string
  eyebrow: string
  title: string
  body: string
  href: string
}[] = [
  {
    slug: 'car-insurance',
    label: 'Car Insurance',
    shortLabel: 'Car',
    eyebrow: 'Car Insurance',
    title: 'Car Insurance Made Simple',
    body:
      'Get the protection you need, without the hassle. BCovered connects you to a range of trusted car insurance providers so you can compare options, find competitive pricing, and choose cover that fits your lifestyle and budget. Whether you want comprehensive protection or basic third-party cover, we make it easy.',
    href: `${MIGRATION_BASE}/car-insurance`,
  },
  {
    slug: 'home-contents-insurance',
    label: 'Home Contents Insurance',
    shortLabel: 'Home contents',
    eyebrow: 'Home Contents Insurance',
    title: 'Home Contents Insurance Made Simple',
    body:
      'Your home is filled with the things that matter most. From appliances and furniture to electronics and valuables, BCovered helps you secure your belongings against theft, loss, and damage. Compare top-rated home contents policies and choose the cover that suits your space and your budget.',
    href: `${MIGRATION_BASE}/home-contents-insurance`,
  },
  {
    slug: 'building-insurance',
    label: 'Building Insurance',
    shortLabel: 'Building',
    eyebrow: 'Building Insurance',
    title: 'Building Insurance Made Simple',
    body:
      'Your property is one of your most valuable assets, and it deserves strong, reliable protection. BCovered gives you access to building insurance options that cover the physical structure of your home against life’s unexpected events, from storms and floods to fire or accidental damage.',
    href: `${MIGRATION_BASE}/building-insurance`,
  },
]

export const partners = [
  { name: 'Budget Insurance', color: '#1e4d8c' },
  { name: '1st for Women', color: '#c2185b' },
  { name: 'Dialdirect', color: '#e65100' },
  { name: 'Virseker', color: '#00897b' },
  { name: 'Auto & General', color: '#c62828' },
]

export const benefits = [
  'Save money',
  'Multiple Insurers',
  'Client centric',
  'Only receive calls from selected insurers',
  'Free independent quotes',
  'Save time',
  'No spam calls',
  'Safe, secure and encrypted forms',
]

export const howItWorks = [
  {
    step: 1,
    title: 'Complete the form',
    body: 'Accurate details in, means successful quotes out.',
  },
  {
    step: 2,
    title: 'Receive multiple quotes in one email',
    body: 'Your details are sent securely to insurers to generate quotes.',
  },
  {
    step: 3,
    title: 'Select "Pick Me" for your preferred quote',
    body: 'Compare freely, with zero pressure.',
  },
  {
    step: 4,
    title: 'Receive a call from your selected insurer',
    body: 'The insurer will call you to finalise your insurance.',
  },
]

export const faqs = [
  {
    q: 'Why us?',
    a: 'We have streamlined the insurance quoting process by using safe, secure and encrypted forms, and by offering trusted insurers on our panel, making the quoting process easier.',
  },
  {
    q: 'How long does it take to get a quote?',
    a: 'It takes under 3 minutes to fill in the form. You will receive an email in your inbox, junk or spam folder in less than 5 minutes.',
  },
  {
    q: 'Why did I not receive my quote?',
    a: 'Ensure your information is completed correctly. Your comparison email is legitimate, but it may go to your spam or junk folder the first time.',
  },
  {
    q: 'Will I get spam calls?',
    a: 'No! Only the insurers you pick will call you back.',
  },
  {
    q: 'Do you issue insurance policies?',
    a: 'No, we do not offer advice; we are an insurance comparison site only. The policy will be issued and administered by your selected insurer.',
  },
  {
    q: 'Why should I not go directly to the insurer?',
    a: 'Each phone call takes approximately 30–45 minutes. Imagine doing this with every insurer just to compare quotes.',
  },
  {
    q: 'Are my quotes accurate?',
    a: 'Your quotes are indicative. Your final quote will be confirmed with your selected insurer based on your risk profile.',
  },
  {
    q: 'What happens after I click "Pick Me"?',
    a: 'Your information is sent through to the insurer you selected. You will receive a call back to complete the final underwriting process.',
  },
]

export const reviews = [
  {
    name: 'Lameez Kourie',
    quote: 'Quick and easy to get a quote. No unnecessary spam calls.',
  },
  {
    name: 'Adnan Bhamjee',
    quote: 'Had the best experience with Bcovered simple and easy to use',
  },
  {
    name: 'Mavela Madhlala',
    quote: 'Less effort , less hassle , very convenient.',
  },
]

export const newsItems = [
  {
    id: 'el-nino',
    title: 'How a Potential El Niño Could Affect Your Insurance and Your Pocket',
    date: '04 Sep 2026',
    excerpt: 'What changing weather patterns can mean for short-term cover in South Africa.',
  },
  {
    id: 'digital-ai',
    title: 'How Digital Insurance and Artificial Intelligence Are Transforming Cover',
    date: '04 Sep 2026',
    excerpt: 'A look at how digital marketplaces and AI are reshaping how South Africans compare insurance.',
  },
  {
    id: 'claims-rejected',
    title: "Car Insurance Claims Rejected? Here's What to Do (And How to Avoid It)",
    date: '04 Sep 2026',
    excerpt: 'Practical steps if a claim is declined, and how to prepare before you need to claim.',
  },
  {
    id: 'premiums-rising',
    title: 'Why Are Short-Term Insurance Premiums Rising in South Africa?',
    date: '04 Sep 2026',
    excerpt: 'Context on premium pressure and what comparison shopping can still unlock.',
  },
  {
    id: 'biztrends-2025',
    title: '#BizTrends2025: Data-led insurance product development – the next wave',
    date: '04 Feb 2025',
    excerpt: 'Industry trends around data-led products and customer experience.',
  },
  {
    id: 'higher-premiums',
    title: 'Higher insurance premiums on the cards for South Africa',
    date: '30 Jan 2025',
    excerpt: 'What rising costs mean for personal lines customers.',
  },
]

export const about = {
  eyebrow: 'About Us',
  title: 'The Cover You Need, When You Need It',
  body:
    "Whether you're looking to protect your car, home contents, or building and you just don’t have the time, our platform helps you compare all your insurance needs in one seamless experience. We’re here to simplify the complex insurance process and put you first. Get covered today. Insurance as simple as A,B,Covered.",
  pageTitle: 'We Are Specialized In Digital Insurance',
  pageBody:
    'BCovered was created to put people back at the centre of the insurance experience. We’ve built client-first solutions that bring insurance of all kinds into one easy-to-use space. From streamlined comparisons to centralised management, we’re here to remove the guesswork and give you back control. Our brand is built on trust, accessibility, and modern simplicity, so you can feel empowered, protected, and informed at every step.',
  trustTitle: 'Why South Africans Trust BCovered',
  trustBody:
    "We're not just another comparison site. BCovered is your digital partner in simplifying insurance. Our easy-to-use solution puts you in control, with trusted providers, transparent pricing.",
  solutionsBody:
    "Whether you're looking to protect your car, home contents, or building, our platform helps you compare all your insurance needs in one seamless experience. We’re here to simplify the complex, speak clearly, and put people first. Get covered today.",
}

export type NavLinkItem = { label: string; to: string; children?: undefined }
export type NavGroupItem = { label: string; children: { label: string; to: string }[]; to?: undefined }
export type NavItem = NavLinkItem | NavGroupItem

export const nav: NavItem[] = [
  { label: 'Home', to: MIGRATION_BASE },
  { label: 'About Us', to: `${MIGRATION_BASE}/about-us` },
  {
    label: 'Our Solutions',
    children: products.map((p) => ({ label: p.label, to: p.href })),
  },
  { label: 'News', to: `${MIGRATION_BASE}/news` },
  { label: 'Contact Us', to: `${MIGRATION_BASE}/contact-us` },
]
