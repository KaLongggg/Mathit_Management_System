import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { PageHeader, EmptyState, ErrorBanner, Spinner } from '../components/ui.jsx';
import { fullName } from '../lib/format.js';

const PAGE = 30;
const EMPTY = { first: '', last: '', email: '', phone: '', dse_year: '' };

function buildQuery(f) {
  let q = supabase.from('student').select('*').order('created_at', { ascending: false });
  if (f.first.trim()) q = q.ilike('first_name', `%${f.first.trim()}%`);
  if (f.last.trim()) q = q.ilike('last_name', `%${f.last.trim()}%`);
  if (f.email.trim()) q = q.ilike('email', `%${f.email.trim()}%`);
  if (f.phone.trim()) q = q.ilike('phone_number', `%${f.phone.trim()}%`);
  if (f.dse_year.trim()) q = q.ilike('dse_year', `%${f.dse_year.trim()}%`);
  return q;
}

export default function Students() {
  const [draft, setDraft] = useState(EMPTY);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  // refs to avoid stale closures inside the IntersectionObserver
  const filtersRef = useRef(EMPTY);
  const offsetRef = useRef(0);
  const loadingRef = useRef(false);
  const doneRef = useRef(false);
  const sentinelRef = useRef(null);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || doneRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    const from = offsetRef.current;
    const { data, error } = await buildQuery(filtersRef.current).range(from, from + PAGE - 1);
    if (error) {
      setError(error.message);
      doneRef.current = true;
      setDone(true);
    } else {
      const batch = data || [];
      setRows((prev) => [...prev, ...batch]);
      offsetRef.current += batch.length;
      if (batch.length < PAGE) {
        doneRef.current = true;
        setDone(true);
      }
    }
    loadingRef.current = false;
    setLoading(false);
  }, []);

  function applyFilters(next) {
    filtersRef.current = next;
    offsetRef.current = 0;
    doneRef.current = false;
    setError('');
    setRows([]);
    setDone(false);
    loadMore();
  }

  // initial load
  useEffect(() => {
    loadMore();
  }, [loadMore]);

  // infinite scroll
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => entries[0].isIntersecting && loadMore(),
      { rootMargin: '300px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore]);

  const set = (k) => (e) => setDraft((x) => ({ ...x, [k]: e.target.value }));
  const onEnter = (e) => e.key === 'Enter' && applyFilters(draft);

  return (
    <>
      <PageHeader title="Students" subtitle="Filter, then scroll to load more." />

      <div className="card p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <input className="input" placeholder="First name" value={draft.first} onChange={set('first')} onKeyDown={onEnter} />
          <input className="input" placeholder="Last name" value={draft.last} onChange={set('last')} onKeyDown={onEnter} />
          <input className="input" placeholder="Email" value={draft.email} onChange={set('email')} onKeyDown={onEnter} />
          <input className="input" placeholder="WhatsApp / Phone" value={draft.phone} onChange={set('phone')} onKeyDown={onEnter} />
          <input className="input" placeholder="DSE year" value={draft.dse_year} onChange={set('dse_year')} onKeyDown={onEnter} />
        </div>
        <div className="mt-3 flex gap-2">
          <button className="btn btn-primary" onClick={() => applyFilters(draft)}>Apply filters</button>
          <button className="btn btn-ghost" onClick={() => { setDraft(EMPTY); applyFilters(EMPTY); }}>Clear</button>
        </div>
      </div>

      <div className="mt-4">
        <ErrorBanner message={error} />

        {rows.length === 0 && !loading ? (
          <EmptyState icon="students" title="No matching students" hint="Try fewer or different filters." />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              {rows.map((s) => (
                <Link
                  key={s.student_id}
                  to={`/student/${encodeURIComponent(s.student_id)}`}
                  className="card block p-4 transition hover:-translate-y-0.5 hover:shadow-soft"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{fullName(s) || s.student_id}</div>
                      <div className="truncate text-sm text-slate-500">{s.email || '—'}</div>
                    </div>
                    {s.dse_year && <span className="pill pill-brand shrink-0">DSE {s.dse_year}</span>}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                    <span>ID: {s.student_id}</span>
                    <span>WhatsApp: {s.phone_number || '-'}</span>
                  </div>
                </Link>
              ))}
            </div>

            {/* sentinel + status */}
            <div ref={sentinelRef} className="flex items-center justify-center py-6 text-sm text-slate-400">
              {loading ? (
                <span className="flex items-center gap-2"><Spinner size={16} /> Loading…</span>
              ) : done ? (
                rows.length > 0 ? `All ${rows.length} loaded` : ''
              ) : (
                'Scroll to load more'
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
