import { createRoot } from 'react-dom/client'
import App from './App'
import Legal from './Legal'
import Admin from './Admin'
import FlyBee from './FlyBee'
import './styles.css'

const path = window.location.pathname
const page = path.startsWith('/privacy') ? 'privacy' : path.startsWith('/terms') ? 'terms' : null

createRoot(document.getElementById('root')).render(page ? <Legal page={page} /> : window.location.hash === '#admin' ? <Admin /> : <><App /><FlyBee /></>)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}
