import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { RegionOverlay } from './components/RegionOverlay'
import './styles.css'

const container = document.getElementById('root')
if (!container) throw new Error('Root container not found')

createRoot(container).render(
  <StrictMode>
    {new URLSearchParams(window.location.search).get('mode') === 'region' ? (
      <RegionOverlay />
    ) : (
      <App />
    )}
  </StrictMode>
)
