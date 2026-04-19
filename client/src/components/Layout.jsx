import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import { useGamification, TIER_STYLES } from '../hooks/useGamification';
import XPBar from './XPBar';

const links = [
  { to: '/dashboard', label: 'Dashboard', icon: ChartIcon },
  { to: '/trades',    label: 'Trades',    icon: ListIcon  },
  { to: '/series',    label: 'Series',    icon: SeriesIcon },
  { to: '/profile',   label: 'Profile',   icon: PersonIcon },
];

const VIDEO_PLAYBACK_RATE = 0.8; // 1 = normal speed, 0.1 = 10x slower

export default function Layout() {
  const { profile, refetch } = useGamification();
  const location = useLocation();
  const videoRef = useRef(null);

  // Keep sidebar fresh after every navigation (e.g. returning from TradeForm)
  useEffect(() => { refetch(); }, [location.pathname, refetch]);

  const s = profile ? (TIER_STYLES[profile.level.tier] ?? TIER_STYLES.bronze) : null;

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 bg-surface-card border-r border-surface-border flex flex-col">
        {/* Logo */}
        <div className="px-6 py-6">
          <div className="flex items-center gap-2.5">
            <video
              autoPlay
              loop
              muted
              playsInline
              className="w-7 h-7 rounded-lg object-cover flex-shrink-0"
            >
              <source src="/logo.mp4" type="video/mp4" />
            </video>
            <span className="text-white font-semibold text-sm tracking-tight">Ascend</span>
          </div>
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
                    : 'text-slate-500 hover:bg-surface-raised hover:text-white'
                }`
              }
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

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
      <div className="flex-1 relative overflow-hidden">
        <div className="absolute inset-0 bg-black/75 z-10 pointer-events-none" />
        <video
          ref={videoRef}
          autoPlay
          loop
          muted
          playsInline
          onLoadedMetadata={() => { if (videoRef.current) videoRef.current.playbackRate = VIDEO_PLAYBACK_RATE; }}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        >
          <source src="/background_vid.mp4" type="video/mp4" />
        </video>
        <main className="relative z-10 h-full overflow-y-auto">
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

function PersonIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
  );
}
