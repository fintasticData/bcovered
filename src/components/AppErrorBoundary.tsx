import { Component, type ErrorInfo, type ReactNode } from 'react'

const RELOAD_KEY = 'insureflow_chunk_reload'

/** A newer deployment replaced the code-split files this tab was built against. */
export const isChunkLoadError = (e: unknown) =>
  e instanceof Error && /dynamically imported module|Importing a module script failed|error loading dynamically imported|Loading chunk|ChunkLoadError/i.test(e.message)

/** Reloads once to pick up the new build; a second failure shows the error screen instead of looping. */
export function reloadForNewBuild(): boolean {
  if (sessionStorage.getItem(RELOAD_KEY)) return false
  sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  window.location.reload()
  return true
}

export function clearReloadFlag() {
  sessionStorage.removeItem(RELOAD_KEY)
}

export class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (isChunkLoadError(error) && reloadForNewBuild()) return
    console.error(error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="grid min-h-dvh place-items-center bg-sand px-6 text-center">
        <div className="max-w-sm">
          <p className="font-display text-2xl font-bold text-brand-900">Something didn’t load</p>
          <p className="mt-2 text-sm text-ink/70">
            {isChunkLoadError(this.state.error)
              ? 'A newer version of the demo was published while this page was open.'
              : 'The page hit an unexpected error. Your demo data is safe in this browser.'}
          </p>
          <button
            type="button"
            onClick={() => {
              clearReloadFlag()
              window.location.reload()
            }}
            className="btn-primary mt-6"
          >
            Reload
          </button>
          <a href="/" className="mt-3 block text-xs font-semibold text-brand-700 underline">
            Go to the home page
          </a>
        </div>
      </div>
    )
  }
}
