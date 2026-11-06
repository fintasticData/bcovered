import {
  Car,
  Home,
  Sofa,
  Briefcase,
  Bike,
  Gem,
  type LucideIcon,
} from 'lucide-react'

export type ProductSlug = 'car' | 'home' | 'contents' | 'business' | 'motorbike' | 'valuables'

export interface Product {
  slug: ProductSlug
  name: string
  label: string
  short: string
  tagline: string
  icon: LucideIcon
  fromPrice: number
  image: string
  covers: string[]
  extras: string[]
  exclusions: string[]
}

export const products: Product[] = [
  {
    slug: 'car',
    name: 'Car Insurance',
    label: 'Car',
    short: 'Comprehensive, third-party, fire & theft',
    tagline: 'Cover that keeps you moving – from fender-benders to full write-offs.',
    icon: Car,
    fromPrice: 389,
    image:
      'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?auto=format&fit=crop&w=1400&q=70',
    covers: [
      'Accident damage, theft and hijacking',
      'Fire, hail and flood damage',
      'Third-party liability up to R5 million',
      '24/7 roadside and accident assistance',
    ],
    extras: ['Car hire', 'Tyre & rim cover', 'Scratch & dent', 'Credit shortfall'],
    exclusions: ['Driving under the influence', 'Unlicensed drivers', 'Wear and tear'],
  },
  {
    slug: 'home',
    name: 'Buildings Insurance',
    label: 'Home',
    short: 'Your home’s structure, walls and roof',
    tagline: 'Protect the bricks and mortar you worked so hard for.',
    icon: Home,
    fromPrice: 215,
    image:
      'https://images.unsplash.com/photo-1568605114967-8130f3a36994?auto=format&fit=crop&w=1400&q=70',
    covers: [
      'Fire, lightning, storm and flood',
      'Burst geysers and pipes',
      'Subsidence and landslip (optional)',
      'Public liability as homeowner',
    ],
    extras: ['Solar panels & inverters', 'Power surge', 'Accidental damage'],
    exclusions: ['Poor maintenance', 'Gradual damage', 'Unoccupied for 60+ days'],
  },
  {
    slug: 'contents',
    name: 'Home Contents',
    label: 'Contents',
    short: 'Furniture, appliances and everyday items',
    tagline: 'Everything inside your home, covered at replacement value.',
    icon: Sofa,
    fromPrice: 129,
    image:
      'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=1400&q=70',
    covers: [
      'Theft and forced entry',
      'Fire, storm and water damage',
      'Power surge damage to appliances',
      'Accidental damage to TVs',
    ],
    extras: ['Garden & pool equipment', 'Guests’ belongings', 'Food spoilage (load-shedding)'],
    exclusions: ['Theft without forced entry', 'Items left in an open vehicle'],
  },
  {
    slug: 'business',
    name: 'Business Insurance',
    label: 'Business',
    short: 'SME packages for shops, offices and trades',
    tagline: 'Keep your business trading when the unexpected happens.',
    icon: Briefcase,
    fromPrice: 650,
    image:
      'https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=1400&q=70',
    covers: [
      'Office contents, stock and equipment',
      'Business interruption',
      'Public and product liability',
      'Money, glass and goods in transit',
    ],
    extras: ['Cyber liability', 'Employee dishonesty', 'Electronic equipment'],
    exclusions: ['Contractual penalties', 'Deliberate acts', 'Pre-existing damage'],
  },
  {
    slug: 'motorbike',
    name: 'Motorcycle Insurance',
    label: 'Motorbike',
    short: 'Superbikes, scooters and adventure bikes',
    tagline: 'Ride free knowing your bike and gear are covered.',
    icon: Bike,
    fromPrice: 245,
    image:
      'https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=1400&q=70',
    covers: [
      'Accident damage and theft',
      'Riding gear and helmets',
      'Third-party liability',
      'Recovery and towing',
    ],
    extras: ['Track day cover', 'Accessories', 'Cross-border travel'],
    exclusions: ['Racing (unless added)', 'Unlicensed riders'],
  },
  {
    slug: 'valuables',
    name: 'Portable Valuables',
    label: 'Valuables',
    short: 'Phones, laptops, jewellery and cameras',
    tagline: 'Cover the things you carry – anywhere in the world.',
    icon: Gem,
    fromPrice: 79,
    image:
      'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=1400&q=70',
    covers: [
      'Loss, theft and accidental damage',
      'Worldwide cover',
      'Specified jewellery and watches',
      'Cellphones and laptops',
    ],
    extras: ['Bicycles', 'Sports equipment', 'Hearing aids & prescription glasses'],
    exclusions: ['Unattended items in public', 'Cosmetic scratches'],
  },
]

export const getProduct = (slug?: string) => products.find((p) => p.slug === slug)

export const insurers = [
  'Protea Insure',
  'Karoo Mutual',
  'Baobab General',
  'Springbok Assure',
  'Fynbos Underwriting',
  'Table Bay Insurance',
  'Highveld Cover',
  'Drakensberg Re',
]
