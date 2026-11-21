import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

export type LayoutView = 'classic' | 'fintastic'

const PARAM = 'view'

/** URL-driven Classic ↔ Fintastic layout. Pass `fintastic` for customer My Page / claim desk defaults. */
export function useLayoutView(defaultView: LayoutView = 'classic') {
  const [params, setParams] = useSearchParams()
  const raw = params.get(PARAM)
  const view: LayoutView = raw === 'fintastic' ? 'fintastic' : raw === 'classic' ? 'classic' : defaultView

  const setView = useCallback(
    (next: LayoutView) => {
      setParams(
        (p) => {
          const copy = new URLSearchParams(p)
          if (next === defaultView) copy.delete(PARAM)
          else copy.set(PARAM, next)
          return copy
        },
        { replace: true },
      )
    },
    [defaultView, setParams],
  )

  return { view, setView, isFintastic: view === 'fintastic' }
}
