import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { AppProvider, useApp } from './app/AppState'
import { Layout } from './ui/components/Layout'
import { Cycle } from './ui/pages/Cycle'
import { Onboarding } from './ui/pages/Onboarding'
import { Settings } from './ui/pages/Settings'
import { Today } from './ui/pages/Today'
import { Tracking } from './ui/pages/Tracking'

// Seiten mit Diagrammen (Recharts) werden erst bei Bedarf geladen.
const PlanOverview = lazy(() => import('./ui/pages/PlanOverview').then((m) => ({ default: m.PlanOverview })))
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
        <Route path="kraft" element={<Suspense fallback={loading}><Strength /></Suspense>} />
        <Route path="tracking" element={<Tracking />} />
        <Route path="einstellungen" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routed />
      </BrowserRouter>
    </AppProvider>
  )
}
