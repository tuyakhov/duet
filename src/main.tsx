import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { initAnalytics, registerContext, startActivityTracking, track } from './analytics'
import App from './App.tsx'
import { sharePayloadFromHash } from './engine/share'
import { hydrateFromStorage } from './state/store'
import { startWebMCP } from './webmcp/controller'

// Restore the autosaved session before anything renders — unless the URL
// carries a shared composition, which App loads instead.
if (!sharePayloadFromHash(window.location.hash)) {
  hydrateFromStorage()
}

const adapter = startWebMCP()

// Optional PostHog analytics — a no-op unless VITE_POSTHOG_KEY was set at build time.
if (initAnalytics()) {
  registerContext({ webmcp_surface: adapter.surface })
  startActivityTracking()
  track('studio_opened', {
    webmcp_surface: adapter.surface,
    shared_link: Boolean(sharePayloadFromHash(window.location.hash)),
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
