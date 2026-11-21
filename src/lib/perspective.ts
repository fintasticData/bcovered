// Presentation-only perspective for the unified workspace. Never grants access; RLS and Repo grants remain authoritative.
// CUT LINE (customer portal GTM): do not use "customer" perspective as impersonation or portal entry.
// True preview = /broker/customers/people/:id/your-page. Customer option is removed from LIVE workspace UX.
import { useSyncExternalStore } from 'react'

export type WorkspacePerspective = 'visitor' | 'customer' | 'broker' | 'manager' | 'observer' | 'admin'

const KEY = 'bcovered_workspace_perspective_v1'
const listeners = new Set<() => void>()

const LABEL: Record<WorkspacePerspective, string> = {
  visitor: 'Visitor',
  customer: 'Customer',
  broker: 'Broker',
  manager: 'Manager',
  observer: 'Observer',
  admin: 'Administrator',
}

function read(): WorkspacePerspective {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw && raw in LABEL) return raw as WorkspacePerspective
  } catch {
    // private mode
  }
  return 'broker'
}

let current: WorkspacePerspective = typeof localStorage !== 'undefined' ? read() : 'broker'

export const perspectiveStore = {
  get: () => current,
  label: (p: WorkspacePerspective = current) => LABEL[p],
  set(next: WorkspacePerspective) {
    if (next === current) return
    current = next
    try {
      localStorage.setItem(KEY, next)
    } catch {
      // storage unavailable
    }
    listeners.forEach((l) => l())
  },
  subscribe(fn: () => void) {
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  },
  all: Object.keys(LABEL) as WorkspacePerspective[],
  labels: LABEL,
}

export function usePerspective(): WorkspacePerspective {
  return useSyncExternalStore(perspectiveStore.subscribe, perspectiveStore.get, perspectiveStore.get)
}
