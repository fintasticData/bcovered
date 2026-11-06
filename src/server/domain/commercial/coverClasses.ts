export interface CoverClass {
  key: string
  label: string
  description: string
  group: 'property' | 'interruption' | 'liability' | 'motor_transit' | 'specialist' | 'special_risk'
}

/** Potential insurance classes. Listing a class never means an exposure is insurable or included. */
export const COVER_CLASSES: CoverClass[] = [
  { key: 'fire_allied_perils', label: 'Fire and allied perils', group: 'property', description: 'Fire, lightning, explosion, storm and related damage to buildings, contents, stock and plant.' },
  { key: 'buildings_combined', label: 'Buildings combined', group: 'property', description: 'Owned buildings, usually including fire, storm, water damage and limited liability.' },
  { key: 'office_contents', label: 'Office contents', group: 'property', description: 'Furniture, fittings and general contents in offices and premises.' },
  { key: 'business_interruption', label: 'Business interruption', group: 'interruption', description: 'Loss of gross profit and increased cost of working after insured damage, for a chosen indemnity period.' },
  { key: 'theft', label: 'Theft', group: 'property', description: 'Theft following forcible and violent entry into premises.' },
  { key: 'money', label: 'Money', group: 'property', description: 'Cash and negotiable instruments on premises, in safes and in transit.' },
  { key: 'glass', label: 'Glass', group: 'property', description: 'Accidental breakage of external and internal glass and signage.' },
  { key: 'electronic_equipment', label: 'Electronic equipment', group: 'property', description: 'Computers, servers, POS terminals and electronics, including accidental damage.' },
  { key: 'machinery_breakdown', label: 'Machinery breakdown', group: 'property', description: 'Sudden mechanical or electrical breakdown of machinery and plant.' },
  { key: 'deterioration_of_stock', label: 'Deterioration of stock', group: 'property', description: 'Spoilage of refrigerated stock after a defined breakdown or supply failure.' },
  { key: 'goods_in_transit', label: 'Goods in transit', group: 'motor_transit', description: 'Goods moving between suppliers, premises and customers.' },
  { key: 'commercial_motor', label: 'Commercial motor', group: 'motor_transit', description: 'Company cars, bakkies, delivery vehicles and scooters.' },
  { key: 'motor_fleet', label: 'Motor fleet', group: 'motor_transit', description: 'Fleets of commercial vehicles and trucks under one programme.' },
  { key: 'public_liability', label: 'Public liability', group: 'liability', description: 'Third-party injury and property damage arising from business activities or premises.' },
  { key: 'products_liability', label: 'Products liability', group: 'liability', description: 'Injury or damage caused by products the business supplies.' },
  { key: 'employers_liability', label: "Employers' liability", group: 'liability', description: 'Employer legal liability beyond statutory compensation under COIDA.' },
  { key: 'professional_indemnity', label: 'Professional indemnity', group: 'liability', description: 'Claims for professional errors, omissions and negligence.' },
  { key: 'directors_officers', label: 'Directors and officers', group: 'liability', description: 'Management and governance liability of directors and officers.' },
  { key: 'cyber', label: 'Cyber', group: 'specialist', description: 'Ransomware, data breaches, cyber liability and incident response.' },
  { key: 'fidelity_crime', label: 'Fidelity and commercial crime', group: 'specialist', description: 'Employee dishonesty and specified fraud exposures.' },
  { key: 'contractors_all_risks', label: 'Contractors all risks', group: 'specialist', description: 'Construction works, materials and contract exposures.' },
  { key: 'plant_equipment', label: 'Plant and equipment', group: 'specialist', description: 'Construction and mobile machinery.' },
  { key: 'marine_cargo', label: 'Marine cargo', group: 'motor_transit', description: 'Import, export and international transport risks.' },
  { key: 'agricultural_specialist', label: 'Agricultural specialist cover', group: 'specialist', description: 'Farming assets, crops, livestock and equipment.' },
  { key: 'sasria', label: 'Sasria special-risk cover', group: 'special_risk', description: 'Riot, strike, civil commotion and related special risks, subject to Sasria terms per class.' },
]

const BY_KEY = new Map(COVER_CLASSES.map((c) => [c.key, c]))
export const coverLabel = (key: string) => BY_KEY.get(key)?.label ?? key
export const coverOrder = (key: string) => {
  const i = COVER_CLASSES.findIndex((c) => c.key === key)
  return i === -1 ? COVER_CLASSES.length : i
}
