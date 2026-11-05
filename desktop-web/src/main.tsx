import { createRoot } from 'react-dom/client'
import { App } from './App'
import { ErrorBoundary } from './ErrorBoundary'
import { start } from './store'
import './style.css'

start()

const container = document.getElementById('root')
if (!container) throw new Error('#root not found')

createRoot(container).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
)
