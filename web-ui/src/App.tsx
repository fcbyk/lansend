import { AppProvider } from './contexts'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AppContent } from './AppContent'

function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </ErrorBoundary>
  )
}

export default App
