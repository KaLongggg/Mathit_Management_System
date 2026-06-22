import { Link } from 'react-router-dom';
import { Icon } from './icons.jsx';
import { COURSE_CLASS_STYLE } from '../lib/constants.js';

export function ClassPill({ value }) {
  if (!value) return <span className="text-slate-400">-</span>;
  const cls = COURSE_CLASS_STYLE[value] || 'bg-slate-100 text-slate-600';
  return <span className={`pill ${cls}`}>{value}</span>;
}

export function Spinner({ size = 18, className = '' }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function PageHeader({ title, subtitle, actions, backTo, backLabel = 'Back' }) {
  return (
    <div className="mb-6">
      {backTo && (
        <Link
          to={backTo}
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:text-brand-800"
        >
          <Icon name="back" size={16} />
          {backLabel}
        </Link>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold sm:text-[1.7rem]">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

const STATUS_STYLE = {
  active: 'pill-brand',
  completed: 'pill-green',
  expired: 'pill-amber',
  pending: 'pill-slate',
};

export function StatusPill({ status }) {
  if (!status) return <span className="text-slate-400">-</span>;
  const cls = STATUS_STYLE[String(status).toLowerCase()] || 'pill-slate';
  return <span className={`pill ${cls} capitalize`}>{status}</span>;
}

export function ActivePill({ active }) {
  return active ? (
    <span className="pill pill-green">Active</span>
  ) : (
    <span className="pill pill-slate">Inactive</span>
  );
}

export function EmptyState({ icon = 'search', title, hint, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/60 px-6 py-14 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-100 text-brand-600">
        <Icon name={icon} size={22} />
      </div>
      <p className="font-medium text-slate-700">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-sm text-slate-500">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    <div className="rounded-xl border border-coral-100 bg-coral-50 px-4 py-3 text-sm text-coral-700" role="alert">
      {message}
    </div>
  );
}

export function SkeletonRows({ rows = 6 }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton h-14 w-full rounded-xl" />
      ))}
    </div>
  );
}

// Read-only labelled value used across detail pages.
export function Field({ label, children, mono = false, full = false }) {
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1 break-words text-slate-800 ${mono ? 'font-mono text-[13px]' : ''}`}>
        {children == null || children === '' ? <span className="text-slate-400">-</span> : children}
      </div>
    </div>
  );
}

// Search input with leading icon; submits on Enter.
export function SearchInput({ value, onChange, onSubmit, placeholder }) {
  return (
    <div className="relative flex-1">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
        <Icon name="search" size={18} />
      </span>
      <input
        className="input pl-10"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onSubmit?.()}
      />
    </div>
  );
}
