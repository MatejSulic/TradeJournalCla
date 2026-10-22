import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import Logo from './Logo';
import { rememberView, viewUrl } from '../lastView';

const links = [
  { to: '/dashboard', label: 'Dashboard', icon: ChartIcon   },
  { to: '/trades',    label: 'Trades',    icon: ListIcon    },
  { to: '/series',    label: 'Series',    icon: SeriesIcon  },
  { to: '/expenses',  label: 'Expenses',  icon: WalletIcon  },
];

const PIN_KEY = 'sidebarPinned';

export default function Layout() {
  const { isDark, toggle } = useTheme();
  const location = useLocation();
  rememberView(location); // sync, so the links below already point at the current filtered view

  // Sidebar: collapsed icon rail by default, slides out over content on hover, pin keeps it open
  const [pinned, setPinned] = useState(() => {
    try { return localStorage.getItem(PIN_KEY) === '1'; } catch { return false; }
  });
  const [hovered, setHovered] = useState(false);
  const open = pinned || hovered;

  const togglePin = () => {
    setPinned(p => {
      try { localStorage.setItem(PIN_KEY, p ? '0' : '1'); } catch { /* ignore */ }
      return !p;
    });
    setHovered(false);
  };

  // Collapse the hover overlay after clicking a link
  useEffect(() => { setHovered(false); }, [location.pathname]);

  const navigate = useNavigate();

  // Labels fade in only when the sidebar is open
  const labelCls = `whitespace-nowrap transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`;

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      {/* Sidebar placeholder — reserves rail width, or full width when pinned */}
      <div className={`relative flex-shrink-0 transition-[width] duration-300 ease-in-out ${pinned ? 'w-56' : 'w-16'}`}>
        <aside
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          className={`absolute inset-y-0 left-0 z-40 bg-surface-card flex flex-col overflow-hidden transition-[width,box-shadow] duration-300 ease-in-out ${
            open ? 'w-56' : 'w-16'
          } ${
            hovered && !pinned
              ? 'shadow-[0_12px_40px_rgb(15_23_42/0.14)] dark:shadow-[0_12px_40px_rgb(0_0_0/0.5)]'
              : 'shadow-[var(--shadow-card)]'
          }`}
        >
          {/* Logo */}
          <div className="h-20 px-4 flex items-center flex-shrink-0">
            <button
              onClick={() => navigate(viewUrl('/dashboard'))}
              className="flex items-center gap-3 rounded-lg hover:opacity-80 transition-opacity"
              title="Dashboard"
            >
              <Logo className="w-8 h-8 flex-shrink-0 text-accent" />
              <span className={`text-lg text-slate-900 dark:text-white ${labelCls}`}>Ascend</span>
            </button>
          </div>

          <nav className="flex-1 px-3 pt-2 space-y-1">
            {links.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={viewUrl(to)}
                title={open ? undefined : label}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors duration-150 ${
                    isActive
                      ? 'bg-accent-soft text-accent font-medium'
                      : 'text-slate-500 dark:text-slate-400 hover:bg-surface-raised hover:text-slate-900 dark:hover:text-white'
                  }`
                }
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className={labelCls}>{label}</span>
              </NavLink>
            ))}
          </nav>

          {/* Theme toggle + pin */}
          <div className="px-3 pb-4 space-y-1">
            <SidebarButton onClick={toggle} label={isDark ? 'Light mode' : 'Dark mode'} labelCls={labelCls}>
              {isDark ? <SunIcon className="w-4 h-4 flex-shrink-0" /> : <MoonIcon className="w-4 h-4 flex-shrink-0" />}
            </SidebarButton>
            <SidebarButton onClick={togglePin} label={pinned ? 'Collapse sidebar' : 'Pin sidebar'} labelCls={labelCls} active={pinned}>
              <ChevronIcon className={`w-4 h-4 flex-shrink-0 transition-transform duration-300 ${pinned ? 'rotate-180' : ''}`} />
            </SidebarButton>
          </div>

        </aside>
      </div>

      {/* Main */}
      <div className="flex-1 min-w-0 bg-surface overflow-hidden">
        <main className="h-full overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function SidebarButton({ onClick, label, labelCls, active = false, children }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-pressed={active || undefined}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors duration-150 hover:bg-surface-raised ${
        active
          ? 'text-accent'
          : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
      }`}
    >
      {children}
      <span className={labelCls}>{label}</span>
    </button>
  );
}

function ChevronIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
    </svg>
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
