import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { AppProvider, useApp } from './app/AppState'
import { CloudGate } from './app/cloud'
import { Layout } from './ui/components/Layout'
import { Cycle } from './ui/pages/Cycle'
import { Onboarding } from './ui/pages/Onboarding'
import { Privacy } from './ui/pages/Privacy'
import { Settings } from './ui/pages/Settings'
import { Today } from './ui/pages/Today'
import { UpdatePrompt } from './ui/components/UpdatePrompt'

// Seiten mit Diagrammen (Recharts) werden erst bei Bedarf geladen.
const PlanOverview = lazy(() => import('./ui/pages/PlanOverview').then((m) => ({ default: m.PlanOverview })))
const Recovery = lazy(() => import('./ui/pages/Recovery').then((m) => ({ default: m.Recovery })))
const Strength = lazy(() => import('./ui/pages/Strength').then((m) => ({ default: m.Strength })))
const loading = <div className="p-4 text-sm text-muted">Lade …</div>

function Routed() {
  const { data } = useApp()
  if (!data.settings.onboarded) return <Onboarding />
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Today />} />
        <Route path="zyklus" element={<Cycle />} />
        <Route path="plan" element={<Suspense fallback={loading}><PlanOverview /></Suspense>} />
        <Route
          path="erholung"
          element={
            <Suspense fallback={loading}>
              <Recovery />
            </Suspense>
          }
        />
        <Route path="kraft" element={<Suspense fallback={loading}><Strength /></Suspense>} />
        <Route path="tracking" element={<Navigate to="/kraft" replace />} />
        <Route path="einstellungen" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  // Öffentliche Seite ohne Anmeldung (Privacy-Policy-URL für WHOOP)
  if (window.location.pathname === '/datenschutz') return <Privacy />
  return (
    <>
      <UpdatePrompt />
      <CloudGate>
        {(repo, onRemoteChange) => (
          <AppProvider repo={repo} {...(onRemoteChange ? { onRemoteChange } : {})}>
            <BrowserRouter>
              <Routed />
            </BrowserRouter>
          </AppProvider>
        )}
      </CloudGate>
    </>
  )
}
