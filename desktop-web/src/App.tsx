import { AddressList } from './components/AddressList'
import { DirectoryField } from './components/DirectoryField'
import { FeaturePills } from './components/FeaturePills'
import { Footer } from './components/Footer'
import { PortField } from './components/PortField'
import { useSnapshot } from './store'

export function App() {
  const { view, busy, error } = useSnapshot()

  return (
    <main className="app">
      <AddressList view={view} />
      <DirectoryField view={view} busy={busy} />
      <PortField view={view} busy={busy} />
      <FeaturePills view={view} busy={busy} />
      <Footer view={view} busy={busy} error={error} />
    </main>
  )
}
