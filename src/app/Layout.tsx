import { useEffect, useRef } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Sidebar, TabBar } from './nav.tsx';
import { useStore } from '../data/store.ts';
import { useCoachSync, useToday } from './hooks.ts';
import { wasCheckInSeen } from './checkinGate.ts';

export function Layout() {
  const toasts = useStore((s) => s.toasts);
  const today = useToday();
  const hasCheckIn = useStore((s) => !!s.checkIns[today]);
  const navigate = useNavigate();
  const location = useLocation();
  const decided = useRef(false);

  // Die eingeplante Einheit folgt dem Coach — im Rahmen, damit es auf jedem Tab
  // greift und nicht nur auf dem, der zufällig offen ist.
  useCoachSync(today);

  // First launch of the day goes straight to the check-in. It runs once per
  // session and only from the landing route, so a deep link is never hijacked.
  // On the very first render the path is still '/', before the redirect to
  // '/today' resolves — both count as "the app was just opened".
  useEffect(() => {
    if (decided.current) return;
    const isLanding = location.pathname === '/' || location.pathname === '/today';
    if (!isLanding) {
      decided.current = true;
      return;
    }
    decided.current = true;
    if (hasCheckIn || wasCheckInSeen(today)) return;
    navigate('/checkin', { replace: true });
  }, [hasCheckIn, today, navigate, location.pathname]);

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
