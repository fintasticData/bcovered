import type { AssetMapIndustryPack } from './assetMapTypes'

export type IllustratedAreaCard = {
  id: string
  label: string
  hint: string
  accent: string
}

const HOSPITALITY_AREAS: IllustratedAreaCard[] = [
  { id: 'kitchen', label: 'Kitchen', hint: 'Cooking line, cold room, extraction', accent: 'from-orange-100 to-amber-50' },
  { id: 'foh', label: 'Front of house', hint: 'Dining, tills, guest areas', accent: 'from-sky-100 to-cyan-50' },
  { id: 'stockroom', label: 'Stockroom', hint: 'Dry goods and storage', accent: 'from-stone-100 to-zinc-50' },
]

const HOME_AREAS: IllustratedAreaCard[] = [
  { id: 'lounge', label: 'Lounge', hint: 'Living space and entertainment', accent: 'from-teal-100 to-emerald-50' },
  { id: 'study', label: 'Study', hint: 'Desk, laptop and electronics', accent: 'from-indigo-100 to-sky-50' },
  { id: 'kitchen', label: 'Kitchen', hint: 'Appliances and fittings', accent: 'from-amber-100 to-orange-50' },
  { id: 'garage', label: 'Garage', hint: 'Vehicle and tools', accent: 'from-slate-100 to-gray-50' },
]

const PACK_AREAS: Record<AssetMapIndustryPack, IllustratedAreaCard[]> = {
  hospitality: HOSPITALITY_AREAS,
  home: HOME_AREAS,
  logistics: [
    { id: 'office', label: 'Dispatch office', hint: 'Ops desks and systems', accent: 'from-sky-100 to-blue-50' },
    { id: 'bays', label: 'Loading bays', hint: 'Bay doors and forklifts', accent: 'from-amber-100 to-yellow-50' },
    { id: 'yard', label: 'Vehicle yard', hint: 'Trucks and trailers', accent: 'from-emerald-100 to-teal-50' },
  ],
  manufacturing: [
    { id: 'machine', label: 'Machine shop', hint: 'Lathes and CNC', accent: 'from-slate-100 to-zinc-50' },
    { id: 'fab', label: 'Fabrication bay', hint: 'Welding and assembly', accent: 'from-orange-100 to-rose-50' },
    { id: 'compressor', label: 'Compressor room', hint: 'Plant utilities', accent: 'from-cyan-100 to-sky-50' },
  ],
  retail: [
    { id: 'checkout', label: 'Checkout', hint: 'POS and counters', accent: 'from-emerald-100 to-teal-50' },
    { id: 'aisles', label: 'Shop aisles', hint: 'Fixtures and shelving', accent: 'from-amber-100 to-yellow-50' },
    { id: 'stockroom', label: 'Stockroom', hint: 'Racking and stock', accent: 'from-stone-100 to-neutral-50' },
  ],
  generic: [
    { id: 'main', label: 'Main area', hint: 'Primary work space', accent: 'from-mist to-white' },
    { id: 'store', label: 'Storage', hint: 'Stored equipment', accent: 'from-slate-50 to-zinc-50' },
  ],
}

/** Public URLs for industry illustration / demo floor plans. */
export const PACK_ILLUSTRATION_URL: Record<AssetMapIndustryPack, string | null> = {
  hospitality: '/map-packs/map-retail.jpg',
  home: '/map-packs/map-home.jpg',
  logistics: '/map-packs/map-fleet-depot.jpg',
  manufacturing: '/map-packs/map-plant.jpg',
  retail: '/map-packs/map-retail.jpg',
  generic: null,
}

/** Default pin positions (%) on a site layout by area id. */
const AREA_LAYOUT_SLOTS: Record<string, { x: number; y: number }> = {
  kitchen: { x: 22, y: 38 },
  foh: { x: 68, y: 42 },
  stockroom: { x: 48, y: 72 },
  lounge: { x: 30, y: 35 },
  study: { x: 72, y: 28 },
  garage: { x: 78, y: 70 },
  office: { x: 28, y: 30 },
  bays: { x: 55, y: 55 },
  yard: { x: 78, y: 72 },
  machine: { x: 30, y: 40 },
  fab: { x: 62, y: 48 },
  compressor: { x: 80, y: 70 },
  checkout: { x: 25, y: 55 },
  aisles: { x: 55, y: 40 },
  main: { x: 45, y: 45 },
  store: { x: 75, y: 65 },
  'branch-items': { x: 50, y: 85 },
}

export function areasForPack(pack: AssetMapIndustryPack): IllustratedAreaCard[] {
  return PACK_AREAS[pack] ?? PACK_AREAS.generic
}

export function illustrationUrlForPack(pack: AssetMapIndustryPack): string | null {
  return PACK_ILLUSTRATION_URL[pack] ?? null
}

export function layoutSlotForArea(areaId: string | null | undefined, index = 0): { x: number; y: number } {
  const base = AREA_LAYOUT_SLOTS[areaId ?? ''] ?? { x: 40 + (index % 4) * 12, y: 35 + Math.floor(index / 4) * 14 }
  const jitter = (index % 3) * 4
  return { x: Math.min(90, base.x + jitter), y: Math.min(88, base.y + (index % 2) * 5) }
}

export function inferAreaId(label: string, pack: AssetMapIndustryPack): string | null {
  const hay = label.toLowerCase()
  const areas = areasForPack(pack)
  for (const area of areas) {
    if (hay.includes(area.id) || hay.includes(area.label.toLowerCase())) return area.id
  }
  if (pack === 'hospitality') {
    if (hay.includes('cold') || hay.includes('extract') || hay.includes('kitchen')) return 'kitchen'
    if (hay.includes('pos') || hay.includes('till') || hay.includes('front')) return 'foh'
    if (hay.includes('stock')) return 'stockroom'
  }
  if (pack === 'home') {
    if (hay.includes('laptop') || hay.includes('study') || hay.includes('desk')) return 'study'
    if (hay.includes('tv') || hay.includes('lounge') || hay.includes('sofa')) return 'lounge'
    if (hay.includes('car') || hay.includes('garage') || hay.includes('suv')) return 'garage'
    if (hay.includes('kitchen') || hay.includes('appliance')) return 'kitchen'
  }
  return null
}

export function industryPackForKey(industryKey: string | null | undefined): AssetMapIndustryPack {
  const key = (industryKey ?? '').toLowerCase()
  if (
    key.includes('restaurant') ||
    key.includes('hospitality') ||
    key.includes('cafe') ||
    key.includes('catering') ||
    key.includes('food service')
  ) {
    return 'hospitality'
  }
  if (key.includes('transport') || key.includes('logistics') || key.includes('freight')) return 'logistics'
  if (key.includes('manufactur') || key.includes('engineer')) return 'manufacturing'
  if (key.includes('retail') || key.includes('market') || key.includes('shop')) return 'retail'
  if (key.includes('home') || key.includes('personal')) return 'home'
  return 'generic'
}
