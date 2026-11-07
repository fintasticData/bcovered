import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { bootDemoBackend } from './api/client'
import { QueryProvider } from './api/QueryProvider'
import { AppErrorBoundary, clearReloadFlag, reloadForNewBuild } from './components/AppErrorBoundary'
import './index.css'

window.addEventListener('vite:preloadError', (event) => {
  if (reloadForNewBuild()) event.preventDefault()
})
window.setTimeout(clearReloadFlag, 10_000)

bootDemoBackend()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <QueryProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryProvider>
    </AppErrorBoundary>
  </StrictMode>,
)
