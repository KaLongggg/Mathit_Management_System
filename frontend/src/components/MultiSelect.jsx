import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons.jsx';

// Lightweight multi-select dropdown. `options` is an array of strings.
export function MultiSelect({ label, options, selected, onChange, className = '' }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const toggle = (opt) =>
    onChange(selected.includes(opt) ? selected.filter((o) => o !== opt) : [...selected, opt]);

  const shown = q ? options.filter((o) => String(o).toLowerCase().includes(q.toLowerCase())) : options;
  const summary = selected.length === 0 ? label : `${label} · ${selected.length}`;

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`input flex items-center justify-between gap-2 ${selected.length ? 'border-brand-400 font-medium text-slate-800' : 'text-slate-500'}`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{summary}</span>
        <Icon name="chevronDown" size={16} className="shrink-0 text-slate-400" />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full min-w-[13rem] rounded-xl border border-slate-200 bg-white p-1.5 shadow-soft">
          {options.length > 8 && (
            <input className="input mb-1 h-9" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          )}
          <div className="max-h-60 overflow-auto">
            {shown.length === 0 ? (
              <div className="px-2 py-2 text-sm text-slate-400">No options</div>
            ) : (
              shown.map((opt) => (
                <label key={opt} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
                  <input type="checkbox" className="h-4 w-4 rounded accent-brand-600" checked={selected.includes(opt)} onChange={() => toggle(opt)} />
                  <span className="truncate">{opt}</span>
                </label>
              ))
            )}
          </div>
          {selected.length > 0 && (
            <button type="button" className="mt-1 w-full rounded-lg px-2 py-1.5 text-left text-xs text-brand-700 hover:bg-brand-50" onClick={() => onChange([])}>
              Clear selection
            </button>
          )}
        </div>
      )}
    </div>
  );
}
