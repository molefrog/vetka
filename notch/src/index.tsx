import { createRoot } from 'react-dom/client'
import { Widget } from './Widget'
import './styles.css'

if (!document.getElementById('notch-root')) {
  const container = document.createElement('div')
  container.id = 'notch-root'
  document.body.appendChild(container)
  createRoot(container).render(<Widget />)
}
