import { createRoot } from 'react-dom/client'
import { Widget } from './Widget'
import './styles.css'

// Derive the vetka server origin from where this script was loaded.
// e.g. https://vetka.sh/notch.js → https://vetka.sh
const apiBase = new URL('.', import.meta.url).origin

if (!document.getElementById('notch-root')) {
  const container = document.createElement('div')
  container.id = 'notch-root'
  document.body.appendChild(container)
  createRoot(container).render(<Widget apiBase={apiBase} />)
}
