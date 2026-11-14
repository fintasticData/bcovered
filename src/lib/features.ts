// Feature flags for modules that are only partly built. Set VITE_FEATURES_OFF to a comma-separated list
// (for example "specialist,funds") to hide those areas from navigation without removing their routes.

export type FeatureKey = 'life' | 'controls' | 'funds' | 'specialist'

export const FEATURE_LABEL: Record<FeatureKey, string> = {
  life: 'Life & Benefits',
  controls: 'Controls',
  funds: 'Funds & Investments',
  specialist: 'Specialist',
}

const off = new Set(
  String(import.meta.env?.VITE_FEATURES_OFF ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
)

export const isFeatureOn = (key: FeatureKey) => !off.has(key)
