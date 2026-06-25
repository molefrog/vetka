import { createRoot } from 'react-dom/client'
import { Widget, type NotchMode } from './Widget'
import './styles.css'

// Derive the vetka server origin from where this script was loaded.
// e.g. https://vetka.sh/notch.js → https://vetka.sh
const apiBase = new URL('.', import.meta.url).origin

// Dev-only state preview: ?notch=anonymous|owner|visitor on the host page.
const forced = new URLSearchParams(window.location.search).get('notch')
const forceMode: NotchMode | null =
  forced === 'anonymous' || forced === 'owner' || forced === 'visitor'
    ? forced
    : null

// Load the widget fonts (Manrope for labels, IBM Plex Mono for shortcut chips).
// In prod these should be self-hosted/scoped to the widget; fine for the host <head> for now.
if (!document.getElementById('notch-fonts')) {
  const link = document.createElement('link')
  link.id = 'notch-fonts'
  link.rel = 'stylesheet'
  link.href =
    'https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700&family=IBM+Plex+Mono:wght@500&display=swap'
  document.head.appendChild(link)
}

if (!document.getElementById('notch-root')) {
  const container = document.createElement('div')
  container.id = 'notch-root'
  document.body.appendChild(container)
  createRoot(container).render(<Widget apiBase={apiBase} forceMode={forceMode} />)
}
