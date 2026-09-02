import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { sharePayloadFromHash } from './engine/share'
import { hydrateFromStorage } from './state/store'
import { startWebMCP } from './webmcp/controller'

// Restore the autosaved session before anything renders — unless the URL
// carries a shared composition, which App loads instead.
if (!sharePayloadFromHash(window.location.hash)) {
  hydrateFromStorage()
}

startWebMCP()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
