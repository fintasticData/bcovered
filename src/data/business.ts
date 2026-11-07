import {
  Briefcase,
  Building2,
  Cpu,
  Factory,
  GraduationCap,
  HardHat,
  Package,
  Plane,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Stethoscope,
  Store,
  Tractor,
  TrendingDown,
  Truck,
  UtensilsCrossed,
  Warehouse,
  type LucideIcon,
} from 'lucide-react'
import type { CoverClass } from '@/server/domain/commercial/coverClasses'

export interface BusinessIndustry {
  /** Matches the key of an industry risk template. */
  key: string
  label: string
  short: string
  icon: LucideIcon
}

export interface BusinessIndustryGroup {
  title: string
  industries: BusinessIndustry[]
}

export const BUSINESS_INDUSTRY_GROUPS: BusinessIndustryGroup[] = [
  {
    title: 'Trade and hospitality',
    industries: [
      { key: 'restaurants_hospitality', label: 'Restaurants and hospitality', short: 'Hospitality', icon: UtensilsCrossed },
      { key: 'retail', label: 'Retail', short: 'Retail', icon: Store },
      { key: 'wholesale_distribution', label: 'Wholesale and distribution', short: 'Wholesale', icon: Warehouse },
      { key: 'tourism', label: 'Tourism', short: 'Tourism', icon: Plane },
    ],
  },
  {
    title: 'Industry and logistics',
    industries: [
      { key: 'manufacturing', label: 'Manufacturing', short: 'Manufacturing', icon: Factory },
      { key: 'construction', label: 'Construction', short: 'Construction', icon: HardHat },
      { key: 'transport_logistics', label: 'Transport and logistics', short: 'Transport', icon: Truck },
      { key: 'agriculture', label: 'Agriculture', short: 'Agriculture', icon: Tractor },
    ],
  },
  {
    title: 'Professional and services',
    industries: [
      { key: 'professional_services', label: 'Professional services', short: 'Professional', icon: Briefcase },
      { key: 'technology', label: 'Technology companies', short: 'Technology', icon: Cpu },
      { key: 'healthcare_practices', label: 'Healthcare practices', short: 'Healthcare', icon: Stethoscope },
      { key: 'education', label: 'Education', short: 'Education', icon: GraduationCap },
      { key: 'security_services', label: 'Security services', short: 'Security', icon: ShieldCheck },
      { key: 'property_owners', label: 'Property owners and landlords', short: 'Property', icon: Building2 },
    ],
  },
]

export const BUSINESS_INDUSTRIES = BUSINESS_INDUSTRY_GROUPS.flatMap((g) => g.industries)

export interface BusinessCoverArea {
  group: CoverClass['group']
  title: string
  short: string
  icon: LucideIcon
}

export const BUSINESS_COVER_AREAS: BusinessCoverArea[] = [
  { group: 'property', title: 'Property and equipment', short: 'Buildings, stock, machinery, electronics', icon: Package },
  { group: 'interruption', title: 'Business interruption', short: 'Lost profit after insured damage', icon: TrendingDown },
  { group: 'liability', title: 'Liability', short: 'Public, products, employers, professional', icon: Scale },
  { group: 'motor_transit', title: 'Fleet, transit and cargo', short: 'Vehicles, goods in transit, marine', icon: Truck },
  { group: 'specialist', title: 'Specialist cover', short: 'Cyber, crime, contract works, agri', icon: ShieldAlert },
  { group: 'special_risk', title: 'Sasria special risks', short: 'Riot, strike and civil commotion', icon: Siren },
]

export const industryHref = (key: string) => `/business/industries#${key}`
export const coverAreaHref = (group: string) => `/business/cover#${group}`
