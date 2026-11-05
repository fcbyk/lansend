import { AddressList } from './components/AddressList'
import { DirectoryField } from './components/DirectoryField'
import { FeaturePills } from './components/FeaturePills'
import { Footer } from './components/Footer'
import { PortField } from './components/PortField'
import { StatusBar } from './components/StatusBar'
import { useSnapshot } from './store'

export function App() {
  const { view, busy, error } = useSnapshot()

  return (
    <main className="app">
      <StatusBar view={view} busy={busy} />
      <DirectoryField view={view} busy={busy} />
      <PortField view={view} busy={busy} />
      <FeaturePills view={view} busy={busy} />
      <AddressList view={view} />
      <Footer view={view} busy={busy} error={error} />
    </main>
  )
}
