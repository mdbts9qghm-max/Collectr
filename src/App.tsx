import { useEffect, useRef, useState } from 'react';
import { Navigate, Route, HashRouter as Router, Routes } from 'react-router-dom';
import { Layout } from './app/Layout.tsx';
import { useStore } from './data/store.ts';
import { useTheme } from './app/hooks.ts';
import { initUpdates } from './app/updates.ts';
import type { UpdateController } from './app/updates.ts';
import { Button } from './ui/primitives.tsx';
import { Today } from './screens/Today.tsx';
import { CheckIn } from './screens/CheckIn.tsx';
import { Training } from './screens/Training.tsx';
import { Sleep } from './screens/Sleep.tsx';
import { Week } from './screens/Week.tsx';
import { Habits } from './screens/Habits.tsx';
import { Tasks } from './screens/Tasks.tsx';
import { Analytics } from './screens/Analytics.tsx';
import { Goals } from './screens/Goals.tsx';
import { Coach } from './screens/Coach.tsx';
import { Profile } from './screens/Profile.tsx';
import { More } from './screens/More.tsx';

export default function App() {
  const ready = useStore((s) => s.ready);
  const init = useStore((s) => s.init);
  const [updateReady, setUpdateReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const updates = useRef<UpdateController | null>(null);
  useTheme();

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    // Dismissal lasts for this session only. Reopening the app asks again,
    // which is the difference between a reminder and being ignored forever.
    updates.current = initUpdates(() => setUpdateReady(true));
    // Exposed so Settings can trigger a check without importing the module.
    window.__hybridCheckForUpdate = () => updates.current?.check();
  }, []);

  if (!ready) {
    return (
      <div
        style={{
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          background: 'var(--bg)',
          color: 'var(--text-muted)',
          gap: 12,
        }}
      >
        <div className="col center gap-3">
          <span style={{ fontSize: 30 }}>⚡</span>
          <span className="t-small">Daten werden geladen…</span>
        </div>
      </div>
    );
  }

  return (
    <Router>
      {updateReady && !dismissed && (
        <div className="update-bar" role="status">
          <span className="update-bar-text">Neue Version verfügbar</span>
          <Button variant="ghost" size="sm" onClick={() => setDismissed(true)}>
            Später
          </Button>
          <Button variant="primary" size="sm" onClick={() => void updates.current?.apply()}>
            Neu laden
          </Button>
        </div>
      )}
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/today" replace />} />
          <Route path="/today" element={<Today />} />
          <Route path="/checkin" element={<CheckIn />} />
          <Route path="/training" element={<Training />} />
          <Route path="/sleep" element={<Sleep />} />
          <Route path="/week" element={<Week />} />
          <Route path="/habits" element={<Habits />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/goals" element={<Goals />} />
          <Route path="/coach" element={<Coach />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/more" element={<More />} />
          <Route path="*" element={<Navigate to="/today" replace />} />
        </Route>
      </Routes>
    </Router>
  );
}
