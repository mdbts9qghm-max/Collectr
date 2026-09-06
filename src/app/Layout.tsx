import { Outlet } from 'react-router-dom';
import { Sidebar, TabBar } from './nav.tsx';
import { useStore } from '../data/store.ts';

export function Layout() {
  const toasts = useStore((s) => s.toasts);

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="shell-content">
        <main className="app-main">
          <Outlet />
        </main>
      </div>
      <TabBar />
      <div className="toast-layer" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            {t.tone === 'good' && <span>✓</span>}
            {t.tone === 'bad' && <span>⚠️</span>}
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
