import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useGamification, TIER_STYLES } from '../hooks/useGamification';
import { useTheme } from '../contexts/ThemeContext';
import XPBar from './XPBar';

const links = [
  { to: '/dashboard', label: 'Dashboard', icon: ChartIcon   },
  { to: '/trades',    label: 'Trades',    icon: ListIcon    },
  { to: '/series',    label: 'Series',    icon: SeriesIcon  },
  { to: '/expenses',  label: 'Expenses',  icon: WalletIcon  },
  { to: '/profile',   label: 'Profile',   icon: PersonIcon  },
];

export default function Layout() {
  const { profile, refetch } = useGamification();
  const { isDark, toggle } = useTheme();
  const location = useLocation();

  // Keep sidebar fresh after every navigation (e.g. returning from TradeForm)
  useEffect(() => { refetch(); }, [location.pathname, refetch]);

  const navigate = useNavigate();
  const s = profile ? (TIER_STYLES[profile.level.tier] ?? TIER_STYLES.bronze) : null;

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 bg-surface-card border-r border-surface-border flex flex-col">
        {/* Logo */}
        <div className="px-4 py-5">
          <button
            onClick={() => navigate('/dashboard')}
            className="w-full flex items-center justify-center hover:opacity-80 transition-opacity"
          >
            <img src="/ascend-logo.png" alt="Ascend" className="h-16 w-auto" />
          </button>
        </div>

        <div className="px-3 mb-2">
          <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest px-3">Menu</p>
        </div>

        <nav className="flex-1 px-3 space-y-0.5">
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-150 ${
                  isActive
                    ? 'bg-accent/10 text-accent font-medium'
                    : 'text-slate-500 hover:bg-surface-raised dark:hover:text-white hover:text-slate-900'
                }`
              }
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Theme toggle */}
        <div className="px-4 pb-3">
          <button
            onClick={toggle}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-slate-500 hover:bg-surface-raised dark:hover:text-white hover:text-slate-900 transition-all duration-150 border border-surface-border"
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? <SunIcon className="w-4 h-4 flex-shrink-0" /> : <MoonIcon className="w-4 h-4 flex-shrink-0" />}
            {isDark ? 'Light mode' : 'Dark mode'}
          </button>
        </div>

        {/* XP summary */}
        {profile && s && (
          <div className="border-t border-surface-border p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className={`text-xs font-semibold ${s.text}`}>
                Lv {profile.level.level} · {s.label}
              </span>
              {profile.streakDays >= 1 && (
                <span className="text-xs text-slate-500">
                  🔥 {profile.streakDays}d
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 truncate leading-tight">
              {profile.level.name}
            </p>
            <XPBar xp={profile.xp} level={profile.level} compact />
          </div>
        )}
      </aside>

      {/* Main */}
      <div className="flex-1 bg-surface overflow-hidden">
        <main className="h-full overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function ChartIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.5l5-5 4 4 5-6 4 3" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18" />
    </svg>
  );
}

function ListIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  );
}

function SeriesIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7h18M3 12h18M3 17h10" />
    </svg>
  );
}

function WalletIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2h14a2 2 0 002-2v-3" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 12h5v4h-5a2 2 0 010-4z" />
    </svg>
  );
}

function PersonIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
  );
}

function SunIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="12" cy="12" r="5" />
      <path strokeLinecap="round" d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}

function MoonIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  );
}
