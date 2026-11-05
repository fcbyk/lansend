import { createRoot } from 'react-dom/client'
import { App } from './App'
import { start } from './store'
import './style.css'

start()

const container = document.getElementById('root')
if (!container) throw new Error('#root not found')

createRoot(container).render(<App />)
