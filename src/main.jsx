import { createRoot } from 'react-dom/client'
import App from './App'
import Legal from './Legal'
import './styles.css'

const path = window.location.pathname
const page = path.startsWith('/privacy') ? 'privacy' : path.startsWith('/terms') ? 'terms' : null

createRoot(document.getElementById('root')).render(page ? <Legal page={page} /> : <App />)
