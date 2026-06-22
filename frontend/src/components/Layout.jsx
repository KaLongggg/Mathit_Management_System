import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { Icon } from './icons.jsx';

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: 'dashboard', match: ['/dashboard'] },
  { to: '/courses', label: 'Courses', icon: 'courses', match: ['/courses', '/course'] },
  { to: '/students', label: 'Students', icon: 'students', match: ['/students', '/student'] },
  { to: '/enrolments', label: 'Enrolments', icon: 'enrolments', match: ['/enrolments', '/enrolment'] },
  { to: '/scheduler', label: 'Scheduler', icon: 'scheduler', match: ['/scheduler'] },
  { to: '/logs', label: 'Logs', icon: 'logs', match: ['/logs'] },
];

function isActive(pathname, item) {
  return item.match.some((m) => pathname === m || pathname.startsWith(m + '/'));
}

function BrandMark({ compact = false }) {
  return (
    <div className="flex items-center gap-2.5">
      <img src={`${import.meta.env.BASE_URL}favicon.png`} alt="" className="h-9 w-9 rounded-xl bg-white/95 p-1 shadow-sm" />
      {!compact && (
        <div className="leading-tight">
          <div className="font-display text-[15px] font-semibold text-white">Mathit</div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-brand-200/80">
            Management
          </div>
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  async function signOut() {
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-dvh bg-paper md:grid md:grid-cols-[16rem_1fr]">
      {/* Desktop brand rail */}
      <aside className="sticky top-0 hidden h-dvh flex-col bg-brand-700 px-4 py-5 md:flex">
        <div className="px-2">
          <BrandMark />
        </div>
        <nav className="mt-8 flex flex-1 flex-col gap-1" aria-label="Primary">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} className="nav-item" data-active={isActive(pathname, item)}>
              <Icon name={item.icon} size={19} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <button
          onClick={signOut}
          className="nav-item mt-2 w-full justify-start text-brand-100/80"
          type="button"
        >
          <Icon name="logout" size={19} />
          <span>Sign out</span>
        </button>
        <div className="mt-4 border-t border-white/10 px-3 pt-3 text-[11px] text-brand-200/70">
          © Mathit Education Limited
        </div>
      </aside>

      {/* Content column */}
      <div className="flex min-h-dvh flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-40 flex items-center justify-between bg-brand-700 px-4 py-3 pt-safe md:hidden">
          <BrandMark />
          <button
            onClick={signOut}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-white/90 hover:bg-white/10"
            aria-label="Sign out"
            type="button"
          >
            <Icon name="logout" size={20} />
          </button>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-28 sm:px-6 md:py-8 md:pb-10">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom tab bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-slate-200 bg-white/95 pb-safe backdrop-blur md:hidden"
        aria-label="Primary"
      >
        {NAV.map((item) => {
          const active = isActive(pathname, item);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className="flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium"
              data-active={active}
              style={{ color: active ? '#2a6978' : '#94a3b8' }}
            >
              <Icon name={item.icon} size={22} strokeWidth={active ? 2 : 1.6} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
