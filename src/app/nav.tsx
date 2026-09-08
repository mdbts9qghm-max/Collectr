import type { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  IconAnalytics,
  IconCalendar,
  IconCoach,
  IconGoal,
  IconHabits,
  IconProfile,
  IconSleep,
  IconTasks,
  IconToday,
  IconTraining,
} from '../ui/icons.tsx';

export interface NavItem {
  to: string;
  label: string;
  shortLabel: string;
  icon: (props: { size?: number }) => ReactNode;
  /** Shown in the mobile tab bar. Everything else lives under "Mehr". */
  primary: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/today', label: 'Heute', shortLabel: 'Heute', icon: IconToday, primary: true },
  { to: '/training', label: 'Training', shortLabel: 'Training', icon: IconTraining, primary: true },
  { to: '/sleep', label: 'Schlaf & Erholung', shortLabel: 'Schlaf', icon: IconSleep, primary: true },
  { to: '/habits', label: 'Habits', shortLabel: 'Habits', icon: IconHabits, primary: true },
  { to: '/tasks', label: 'Aufgaben', shortLabel: 'Tasks', icon: IconTasks, primary: true },
  // Everything numeric lives here, off the daily screen.
  { to: '/analytics', label: 'Statistik', shortLabel: 'Statistik', icon: IconAnalytics, primary: true },
  { to: '/week', label: 'Woche', shortLabel: 'Woche', icon: IconCalendar, primary: false },
  { to: '/goals', label: 'Ziele', shortLabel: 'Ziele', icon: IconGoal, primary: false },
  { to: '/coach', label: 'Coach', shortLabel: 'Coach', icon: IconCoach, primary: false },
  { to: '/profile', label: 'Profil & Einstellungen', shortLabel: 'Profil', icon: IconProfile, primary: false },
];

export function TabBar() {
  const location = useLocation();
  const items = NAV_ITEMS.filter((i) => i.primary);
  const secondaryActive = NAV_ITEMS.some(
    (i) => !i.primary && location.pathname.startsWith(i.to),
  );

  return (
    <nav className="tabbar" aria-label="Hauptnavigation">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => `tabbar-item ${isActive ? 'active' : ''}`}
        >
          <span className="tabbar-icon">{item.icon({ size: 21 })}</span>
          {item.shortLabel}
        </NavLink>
      ))}
      <NavLink to="/more" className={`tabbar-item ${secondaryActive ? 'active' : ''}`}>
        <span className="tabbar-icon">
          <svg width="21" height="21" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="5" cy="12" r="1.9" />
            <circle cx="12" cy="12" r="1.9" />
            <circle cx="19" cy="12" r="1.9" />
          </svg>
        </span>
        Mehr
      </NavLink>
    </nav>
  );
}

export function Sidebar() {
  return (
    <nav className="sidebar" aria-label="Hauptnavigation">
      <div className="sidebar-brand">
        <span style={{ fontSize: 22 }}>⚡</span>
        <div>
          <div className="t-heading" style={{ letterSpacing: '-0.02em' }}>
            Hybrid
          </div>
          <div className="t-caption muted">Athlete OS</div>
        </div>
      </div>
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
        >
          {item.icon({ size: 19 })}
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
