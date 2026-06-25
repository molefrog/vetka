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

// Load the widget fonts:
//  - Overused Grotesk (the Vetka brand body face) — self-hosted from the vetka origin so it
//    works on third-party host pages. The .woff2 must be served with CORS (Access-Control-Allow-Origin).
//  - IBM Plex Mono (shortcut chips) — from Google Fonts.
if (!document.getElementById('notch-fonts')) {
  const link = document.createElement('link')
  link.id = 'notch-fonts'
  link.rel = 'stylesheet'
  link.href =
    'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500&display=swap'
  document.head.appendChild(link)
}
if (!document.getElementById('notch-font-face')) {
  const fontUrl = new URL('fonts/OverusedGrotesk-VF.woff2', import.meta.url).href
  const style = document.createElement('style')
  style.id = 'notch-font-face'
  style.textContent = `@font-face{font-family:"Overused Grotesk";src:url("${fontUrl}") format("woff2");font-weight:100 900;font-style:normal;font-display:swap;}`
  document.head.appendChild(style)
}

if (!document.getElementById('notch-root')) {
  const container = document.createElement('div')
  container.id = 'notch-root'
  document.body.appendChild(container)
  createRoot(container).render(<Widget apiBase={apiBase} forceMode={forceMode} />)
}
