import type { IndustryRiskTemplate } from '../../db/commercialSchema'

export type IndustryTemplateContent = Omit<IndustryRiskTemplate, 'id' | 'tenant_id' | 'is_active' | 'created_at' | 'updated_at'>

/** Discovery topics the Business Discovery Agent can ask about, in template order. */
export type DiscoveryTopic =
  | 'structure'
  | 'business_name'
  | 'locations'
  | 'premises'
  | 'turnover_staff'
  | 'equipment'
  | 'stock'
  | 'backup_power'
  | 'fire_protection'
  | 'security'
  | 'vehicles'
  | 'public_payments'
  | 'current_cover'
  | 'claims'

const CORE_TOPICS: DiscoveryTopic[] = ['structure', 'business_name', 'locations', 'premises', 'turnover_staff', 'equipment', 'fire_protection', 'security', 'current_cover', 'claims']

const CORE_RULES = ['fire_property', 'business_interruption', 'public_liability', 'theft_money', 'valuation_gap', 'employer_obligations', 'sasria_special_risk']

const CORE_DOCUMENTS = ['Current policy schedule and wording', 'Five-year claims history from the current insurer', 'Asset register with replacement values']

/**
 * Starting points for each industry, not automatic recommendations. The agent adapts questions and exposures to the
 * facts of the specific business; a broker decides what cover to investigate.
 */
export const INDUSTRY_TEMPLATES: IndustryTemplateContent[] = [
  {
    key: 'restaurants_hospitality',
    name: 'Restaurants and hospitality',
    version: 1,
    summary: 'Sit-down restaurants, cafés, takeaways and caterers with commercial kitchens, perishable stock and public access.',
    keywords: ['restaurant', 'restaurants', 'café', 'cafe', 'bistro', 'eatery', 'takeaway', 'diner', 'catering', 'pizzeria', 'shisanyama'],
    activities: ['Commercial kitchen food preparation', 'Sit-down dining', 'Delivery and online orders', 'Bar service', 'Events and catering'],
    typical_assets: ['Kitchen equipment and extraction', 'Cold rooms and refrigeration', 'Perishable stock', 'POS terminals', 'Furniture and fittings', 'Delivery scooters'],
    exposure_rules: [...CORE_RULES, 'stock_deterioration', 'machinery_breakdown', 'products_liability', 'cyber_payments', 'delivery_motor', 'utility_dependency', 'supplier_dependency', 'fidelity'],
    potential_classes: ['fire_allied_perils', 'office_contents', 'business_interruption', 'deterioration_of_stock', 'machinery_breakdown', 'public_liability', 'products_liability', 'electronic_equipment', 'theft', 'money', 'glass', 'commercial_motor', 'cyber', 'employers_liability', 'fidelity_crime', 'sasria'],
    underwriting_questions: [
      'Is there an automatic fire suppression system over the cooking line, and when was it last serviced?',
      'How often are extraction canopies and ducts professionally cleaned?',
      'What backup power protects refrigeration during load-shedding?',
      'What is the maximum perishable stock value held at each branch?',
      'Is alcohol served, and are there late-night trading hours?',
    ],
    documents: [...CORE_DOCUMENTS, 'Fire suppression service certificate for each kitchen', 'Extraction cleaning records', 'Lease agreements (insurance and indemnity clauses)', 'Latest annual financial statements (for the gross profit basis)'],
    survey_requirements: ['Kitchen fire risk survey per branch', 'Cold room and refrigeration condition check'],
    coverage_considerations: [
      'Deterioration of stock usually needs a defined trigger such as breakdown or public supply failure; scheduled load-shedding may be treated differently.',
      'Business interruption responds to insured damage, not to every loss of revenue.',
      'Lease agreements often make the tenant responsible for glass, signage or improvements.',
    ],
    referral_triggers: ['No fire suppression over cooking lines', 'Prior refrigeration or stock claim', 'Refrigeration without backup power', 'Late-night liquor trading'],
    discovery_topics: ['structure', 'business_name', 'locations', 'premises', 'turnover_staff', 'equipment', 'stock', 'backup_power', 'fire_protection', 'security', 'vehicles', 'public_payments', 'current_cover', 'claims'],
  },
  {
    key: 'manufacturing',
    name: 'Manufacturing',
    version: 1,
    summary: 'Factories and production facilities with plant, machinery, raw materials and finished goods.',
    keywords: ['factory', 'manufacturer', 'manufacturing', 'production line', 'plant', 'processing'],
    activities: ['Production line', 'Raw material storage', 'Cold storage and dispatch', 'Quality control'],
    typical_assets: ['Production machinery', 'Blast freezers and cold rooms', 'Raw materials and finished stock', 'Delivery trucks', 'Factory buildings'],
    exposure_rules: [...CORE_RULES, 'machinery_breakdown', 'stock_deterioration', 'products_liability', 'goods_in_transit', 'delivery_motor', 'utility_dependency', 'customer_concentration', 'supplier_dependency', 'fidelity'],
    potential_classes: ['fire_allied_perils', 'buildings_combined', 'business_interruption', 'machinery_breakdown', 'deterioration_of_stock', 'products_liability', 'public_liability', 'goods_in_transit', 'motor_fleet', 'employers_liability', 'electronic_equipment', 'fidelity_crime', 'sasria'],
    underwriting_questions: ['Which machines are single points of failure for production?', 'What are lead times for replacement parts?', 'Is there a product recall plan?', 'What proportion of revenue comes from the largest customers?'],
    documents: [...CORE_DOCUMENTS, 'Machinery schedule with replacement values', 'Maintenance contracts', 'Product recall plan', 'Latest annual financial statements (for the gross profit basis)'],
    survey_requirements: ['Full fire and engineering risk survey'],
    coverage_considerations: ['Machinery breakdown and business interruption may be separate sections with separate triggers.', 'Book value of machinery is rarely the replacement cost.'],
    referral_triggers: ['Machinery declared at book value', 'Single production site', 'Key-customer revenue concentration above 50%'],
    discovery_topics: [...CORE_TOPICS, 'stock', 'backup_power', 'vehicles'],
  },
  {
    key: 'retail',
    name: 'Retail',
    version: 1,
    summary: 'Shops and stores selling goods to the public, with stock, cash handling and customer footfall.',
    keywords: ['shop', 'store', 'retail', 'boutique', 'spaza', 'pharmacy'],
    activities: ['In-store sales', 'Online sales', 'Stock receiving'],
    typical_assets: ['Stock', 'Shopfittings', 'POS terminals', 'Signage and glass'],
    exposure_rules: [...CORE_RULES, 'cyber_payments', 'products_liability', 'fidelity'],
    potential_classes: ['fire_allied_perils', 'office_contents', 'business_interruption', 'theft', 'money', 'glass', 'public_liability', 'products_liability', 'electronic_equipment', 'cyber', 'fidelity_crime', 'sasria'],
    underwriting_questions: ['What is the peak stock value, for example before December trading?', 'How is cash banked and how often?'],
    documents: [...CORE_DOCUMENTS],
    survey_requirements: ['Security survey for high-value stock'],
    coverage_considerations: ['Seasonal stock peaks can exceed the declared stock sum insured.'],
    referral_triggers: ['High-value or attractive stock', 'Cash held overnight'],
    discovery_topics: [...CORE_TOPICS, 'stock', 'public_payments'],
  },
  {
    key: 'transport_logistics',
    name: 'Transport and logistics',
    version: 1,
    summary: 'Courier, delivery, haulage and warehousing operators with fleets and goods belonging to others.',
    keywords: ['logistics', 'courier', 'haulage', 'trucking', 'freight', 'transport company'],
    activities: ['Fleet operations', 'Warehousing', 'Last-mile delivery'],
    typical_assets: ['Trucks and vans', 'Trailers', 'Warehouse racking', 'Telematics'],
    exposure_rules: [...CORE_RULES, 'delivery_motor', 'goods_in_transit', 'customer_concentration', 'utility_dependency'],
    potential_classes: ['motor_fleet', 'goods_in_transit', 'public_liability', 'fire_allied_perils', 'business_interruption', 'employers_liability', 'marine_cargo', 'sasria'],
    underwriting_questions: ['What are the operating regions and routes?', 'What is the maximum value of goods carried per load?', 'Are vehicles tracked and are drivers monitored?'],
    documents: [...CORE_DOCUMENTS, 'Vehicle schedule', 'Driver licence and training records', 'Carrier contracts'],
    survey_requirements: ['Fleet risk management review'],
    coverage_considerations: ['Goods in transit limits apply per vehicle or load, and carrier liability may be limited by contract.'],
    referral_triggers: ['High-value loads', 'Cross-border operations'],
    discovery_topics: [...CORE_TOPICS, 'vehicles'],
  },
  {
    key: 'construction',
    name: 'Construction',
    version: 1,
    summary: 'Builders and contractors with contract works, plant, sub-contractors and site liability.',
    keywords: ['construction', 'builder', 'contractor', 'civil works', 'building company'],
    activities: ['Contract works on client sites', 'Plant hire', 'Sub-contractor management'],
    typical_assets: ['Mobile plant', 'Tools', 'Site materials', 'Bakkies'],
    exposure_rules: [...CORE_RULES, 'contract_works', 'delivery_motor', 'customer_concentration'],
    potential_classes: ['contractors_all_risks', 'plant_equipment', 'public_liability', 'commercial_motor', 'employers_liability', 'professional_indemnity', 'sasria'],
    underwriting_questions: ['What is the largest contract value currently on site?', 'Do contracts require specific insurance limits?'],
    documents: [...CORE_DOCUMENTS, 'Current contracts with insurance clauses', 'Plant schedule'],
    survey_requirements: ['Site risk review for large contracts'],
    coverage_considerations: ['Client contracts frequently set minimum liability limits and named-insured requirements.'],
    referral_triggers: ['Contracts above R50 million', 'Work at height or demolition'],
    discovery_topics: [...CORE_TOPICS, 'vehicles'],
  },
  {
    key: 'professional_services',
    name: 'Professional services',
    version: 1,
    summary: 'Accountants, consultants, architects and other advisers whose main exposure is advice and client data.',
    keywords: ['accountant', 'consultancy', 'consulting', 'law firm', 'attorneys', 'architect', 'engineers', 'advisory'],
    activities: ['Client advisory work', 'Document and data handling'],
    typical_assets: ['Office contents', 'Laptops and servers'],
    exposure_rules: ['fire_property', 'business_interruption', 'professional_indemnity', 'cyber_payments', 'directors_officers', 'valuation_gap', 'employer_obligations', 'sasria_special_risk'],
    potential_classes: ['office_contents', 'electronic_equipment', 'business_interruption', 'professional_indemnity', 'cyber', 'directors_officers', 'public_liability', 'employers_liability', 'sasria'],
    underwriting_questions: ['What professional services are provided and to which sectors?', 'Are there any prior claims or complaints from clients?'],
    documents: [...CORE_DOCUMENTS, 'Engagement letter template', 'Professional body membership'],
    survey_requirements: [],
    coverage_considerations: ['Professional indemnity is usually written on a claims-made basis.'],
    referral_triggers: ['Prior professional negligence claim', 'Work for listed companies'],
    discovery_topics: ['business_name', 'locations', 'premises', 'turnover_staff', 'equipment', 'public_payments', 'current_cover', 'claims'],
  },
  {
    key: 'agriculture',
    name: 'Agriculture',
    version: 1,
    summary: 'Farms and agricultural enterprises with crops, livestock, equipment and seasonal labour.',
    keywords: ['farm', 'farming', 'orchard', 'vineyard', 'livestock', 'agricultural'],
    activities: ['Crop production', 'Livestock', 'Packhouse operations'],
    typical_assets: ['Tractors and implements', 'Irrigation', 'Packhouses', 'Livestock'],
    exposure_rules: [...CORE_RULES, 'machinery_breakdown', 'goods_in_transit', 'delivery_motor'],
    potential_classes: ['agricultural_specialist', 'fire_allied_perils', 'machinery_breakdown', 'goods_in_transit', 'commercial_motor', 'public_liability', 'employers_liability', 'sasria'],
    underwriting_questions: ['Which crops and livestock are farmed?', 'Is there irrigation and on-farm storage?'],
    documents: [...CORE_DOCUMENTS],
    survey_requirements: ['Farm risk survey'],
    coverage_considerations: ['Crop and livestock cover is specialist and seasonal.'],
    referral_triggers: ['Hail-exposed crops'],
    discovery_topics: [...CORE_TOPICS, 'vehicles'],
  },
  {
    key: 'property_owners',
    name: 'Property owners and landlords',
    version: 1,
    summary: 'Owners of commercial or residential property let to tenants.',
    keywords: ['landlord', 'property owner', 'property portfolio', 'rental property'],
    activities: ['Letting', 'Property maintenance'],
    typical_assets: ['Buildings', 'Lifts and plant', 'Common-area contents'],
    exposure_rules: ['fire_property', 'business_interruption', 'public_liability', 'valuation_gap', 'sasria_special_risk', 'machinery_breakdown'],
    potential_classes: ['buildings_combined', 'fire_allied_perils', 'business_interruption', 'public_liability', 'machinery_breakdown', 'glass', 'sasria'],
    underwriting_questions: ['What are the tenant occupancies?', 'When were buildings last valued?'],
    documents: [...CORE_DOCUMENTS, 'Building valuation report', 'Lease schedule'],
    survey_requirements: ['Building valuation'],
    coverage_considerations: ['Loss of rent is a form of business interruption cover.'],
    referral_triggers: ['Vacant buildings', 'Hazardous tenant occupancies'],
    discovery_topics: ['business_name', 'locations', 'premises', 'turnover_staff', 'fire_protection', 'security', 'current_cover', 'claims'],
  },
  {
    key: 'technology',
    name: 'Technology companies',
    version: 1,
    summary: 'Software, SaaS and IT service providers with data, uptime and contractual obligations.',
    keywords: ['software', 'saas', 'tech company', 'it services', 'app developer', 'technology company'],
    activities: ['Software development', 'Hosting and managed services'],
    typical_assets: ['Laptops and servers', 'Office contents'],
    exposure_rules: ['fire_property', 'business_interruption', 'cyber_payments', 'professional_indemnity', 'directors_officers', 'customer_concentration', 'employer_obligations', 'sasria_special_risk'],
    potential_classes: ['electronic_equipment', 'office_contents', 'cyber', 'professional_indemnity', 'directors_officers', 'business_interruption', 'employers_liability', 'sasria'],
    underwriting_questions: ['Do you hold personal information for clients?', 'What service levels do contracts require?'],
    documents: [...CORE_DOCUMENTS, 'Information security policy', 'Standard client contract'],
    survey_requirements: [],
    coverage_considerations: ['Technology errors and omissions often sit alongside cyber cover.'],
    referral_triggers: ['Handles payment card data', 'US clients'],
    discovery_topics: ['business_name', 'locations', 'premises', 'turnover_staff', 'equipment', 'public_payments', 'current_cover', 'claims'],
  },
  {
    key: 'wholesale_distribution',
    name: 'Wholesale and distribution',
    version: 1,
    summary: 'Wholesalers and distributors holding large stock volumes and delivering to retailers.',
    keywords: ['wholesale', 'wholesaler', 'distributor', 'distribution centre', 'warehouse'],
    activities: ['Warehousing', 'Distribution', 'Importing'],
    typical_assets: ['Stock', 'Racking', 'Forklifts', 'Delivery trucks'],
    exposure_rules: [...CORE_RULES, 'goods_in_transit', 'delivery_motor', 'products_liability', 'customer_concentration', 'supplier_dependency'],
    potential_classes: ['fire_allied_perils', 'business_interruption', 'theft', 'goods_in_transit', 'motor_fleet', 'products_liability', 'public_liability', 'marine_cargo', 'sasria'],
    underwriting_questions: ['What is the peak stock value?', 'Are goods imported?'],
    documents: [...CORE_DOCUMENTS, 'Stock declarations'],
    survey_requirements: ['Warehouse fire and security survey'],
    coverage_considerations: ['Stock declaration conditions can affect claims if declarations are late or understated.'],
    referral_triggers: ['High-piled storage', 'Imports by sea'],
    discovery_topics: [...CORE_TOPICS, 'stock', 'vehicles'],
  },
  {
    key: 'education',
    name: 'Education',
    version: 1,
    summary: 'Private schools, crèches, colleges and training centres.',
    keywords: ['school', 'creche', 'crèche', 'college', 'training centre', 'academy'],
    activities: ['Teaching', 'Aftercare', 'Transport of learners'],
    typical_assets: ['Buildings', 'Computers', 'School buses'],
    exposure_rules: [...CORE_RULES, 'delivery_motor', 'directors_officers'],
    potential_classes: ['buildings_combined', 'office_contents', 'electronic_equipment', 'public_liability', 'commercial_motor', 'directors_officers', 'employers_liability', 'sasria'],
    underwriting_questions: ['How many learners are enrolled?', 'Do you transport learners?'],
    documents: [...CORE_DOCUMENTS],
    survey_requirements: [],
    coverage_considerations: ['Liability to learners is a key consideration.'],
    referral_triggers: ['Learner transport', 'Boarding facilities'],
    discovery_topics: [...CORE_TOPICS, 'vehicles'],
  },
  {
    key: 'healthcare_practices',
    name: 'Healthcare practices',
    version: 1,
    summary: 'Medical, dental and allied-health practices with equipment, patient data and professional exposures.',
    keywords: ['clinic', 'medical practice', 'dentist', 'dental practice', 'physiotherapist', 'doctor', 'vet'],
    activities: ['Consultations', 'Procedures', 'Patient records'],
    typical_assets: ['Medical equipment', 'Practice contents', 'Medication stock'],
    exposure_rules: ['fire_property', 'business_interruption', 'public_liability', 'professional_indemnity', 'cyber_payments', 'machinery_breakdown', 'stock_deterioration', 'valuation_gap', 'employer_obligations', 'sasria_special_risk'],
    potential_classes: ['office_contents', 'electronic_equipment', 'business_interruption', 'professional_indemnity', 'public_liability', 'cyber', 'deterioration_of_stock', 'sasria'],
    underwriting_questions: ['Which procedures are performed?', 'Is medication refrigerated on site?'],
    documents: [...CORE_DOCUMENTS],
    survey_requirements: [],
    coverage_considerations: ['Medical malpractice cover is often arranged through professional bodies.'],
    referral_triggers: ['Surgical procedures', 'Refrigerated vaccines'],
    discovery_topics: ['business_name', 'locations', 'premises', 'turnover_staff', 'equipment', 'stock', 'backup_power', 'public_payments', 'current_cover', 'claims'],
  },
  {
    key: 'security_services',
    name: 'Security services',
    version: 1,
    summary: 'Guarding, armed response and monitoring companies.',
    keywords: ['security company', 'guarding', 'armed response company', 'monitoring company'],
    activities: ['Guarding', 'Armed response', 'Alarm monitoring'],
    typical_assets: ['Response vehicles', 'Control room equipment', 'Firearms'],
    exposure_rules: [...CORE_RULES, 'delivery_motor', 'professional_indemnity', 'fidelity'],
    potential_classes: ['public_liability', 'professional_indemnity', 'commercial_motor', 'fidelity_crime', 'electronic_equipment', 'employers_liability', 'sasria'],
    underwriting_questions: ['Are officers PSIRA registered?', 'Do officers carry firearms?'],
    documents: [...CORE_DOCUMENTS, 'PSIRA registration', 'Client service level agreements'],
    survey_requirements: [],
    coverage_considerations: ['Contractual liability to clients often exceeds standard public liability wording.'],
    referral_triggers: ['Armed officers', 'Cash-in-transit services'],
    discovery_topics: [...CORE_TOPICS, 'vehicles'],
  },
  {
    key: 'tourism',
    name: 'Tourism',
    version: 1,
    summary: 'Guesthouses, lodges, tour operators and travel businesses.',
    keywords: ['guesthouse', 'lodge', 'b&b', 'tour operator', 'safari', 'hotel'],
    activities: ['Accommodation', 'Tours and activities', 'Food and beverage'],
    typical_assets: ['Buildings', 'Furniture', 'Tour vehicles', 'Linen and kitchen equipment'],
    exposure_rules: [...CORE_RULES, 'stock_deterioration', 'delivery_motor', 'products_liability', 'cyber_payments'],
    potential_classes: ['buildings_combined', 'office_contents', 'business_interruption', 'public_liability', 'commercial_motor', 'deterioration_of_stock', 'cyber', 'employers_liability', 'sasria'],
    underwriting_questions: ['How many rooms or guests?', 'Are adventure activities offered?'],
    documents: [...CORE_DOCUMENTS],
    survey_requirements: ['Thatch and fire risk check where applicable'],
    coverage_considerations: ['Thatched roofs and remote locations affect fire terms.'],
    referral_triggers: ['Thatched roofs', 'Adventure activities'],
    discovery_topics: [...CORE_TOPICS, 'vehicles', 'public_payments'],
  },
]

export const FALLBACK_TEMPLATE_KEY = 'professional_services'

/** Matches a free-text description to a template by its keywords, most specific match first. */
export function detectIndustry(text: string, templates: Array<Pick<IndustryTemplateContent, 'key' | 'keywords'>>): string | undefined {
  const t = text.toLowerCase()
  let best: { key: string; len: number } | undefined
  for (const tpl of templates) {
    for (const k of tpl.keywords) {
      const re = new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
      if (re.test(t) && (!best || k.length > best.len)) best = { key: tpl.key, len: k.length }
    }
  }
  return best?.key
}
