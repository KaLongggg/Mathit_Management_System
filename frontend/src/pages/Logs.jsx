import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { PageHeader, EmptyState, ErrorBanner, Spinner } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';
import { fmtDate } from '../lib/format.js';

const PAGE = 30;
const EMPTY = { status: '', schedule: '', number: '' };
const LOG_STATUSES = ['sent', 'failed', 'dry_run'];

function LogPill({ status }) {
  const map = { sent: 'pill-green', failed: 'pill-coral', dry_run: 'pill-slate' };
  return <span className={`pill ${map[status] || 'pill-slate'}`}>{status || 'unknown'}</span>;
}

function buildQuery(f) {
  let q = supabase
    .from('whatsapp_schedule_logs')
    .select('*')
    .order('sent_at', { ascending: false, nullsFirst: false });
  if (f.status) q = q.eq('status', f.status);
  if (f.schedule) q = q.eq('schedule_id', f.schedule);
  if (f.number.trim()) q = q.ilike('whatsapp_number', `%${f.number.trim()}%`);
  return q;
}

export default function Logs() {
  const [draft, setDraft] = useState(EMPTY);
  const [rows, setRows] = useState([]);
  const [schedules, setSchedules] = useState({});
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState(null);

  const filtersRef = useRef(EMPTY);
  const offsetRef = useRef(0);
  const loadingRef = useRef(false);
  const doneRef = useRef(false);
  const sentinelRef = useRef(null);

  useEffect(() => {
    supabase
      .from('whatsapp_schedules')
      .select('id,name')
      .then(({ data }) => setSchedules(Object.fromEntries((data || []).map((s) => [s.id, s.name]))));
  }, []);

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
    setOpenId(null);
    loadMore();
  }

  useEffect(() => {
    loadMore();
  }, [loadMore]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver((e) => e[0].isIntersecting && loadMore(), { rootMargin: '300px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore]);

  const set = (k) => (e) => {
    const next = { ...draft, [k]: e.target.value };
    setDraft(next);
    if (k !== 'number') applyFilters(next); // selects apply immediately
  };

  return (
    <>
      <PageHeader title="Message log" subtitle="WhatsApp send history from the scheduler." />

      <div className="card p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <select className="input" value={draft.status} onChange={set('status')} aria-label="Filter by status">
            <option value="">All statuses</option>
            {LOG_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select className="input" value={draft.schedule} onChange={set('schedule')} aria-label="Filter by schedule">
            <option value="">All schedules</option>
            {Object.entries(schedules).map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              placeholder="Recipient number…"
              value={draft.number}
              onChange={(e) => setDraft((x) => ({ ...x, number: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && applyFilters(draft)}
            />
            <button className="btn btn-primary" onClick={() => applyFilters(draft)}>Go</button>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <ErrorBanner message={error} />

        {rows.length === 0 && !loading ? (
          <EmptyState icon="logs" title="No log entries" hint="Sends from the WhatsApp scheduler will appear here." />
        ) : (
          <>
            <div className="card divide-y divide-slate-100 overflow-hidden">
              {rows.map((r) => {
                const open = openId === r.id;
                return (
                  <div key={r.id}>
                    <button
                      onClick={() => setOpenId(open ? null : r.id)}
                      className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-brand-50/50"
                      aria-expanded={open}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <LogPill status={r.status} />
                          <span className="font-medium text-slate-800">{r.whatsapp_number || '—'}</span>
                          <span className="text-xs text-slate-400">{schedules[r.schedule_id] || 'Unknown schedule'}</span>
                        </div>
                        <div className="mt-1 truncate text-sm text-slate-500">{r.message || (r.error ? `Error: ${r.error}` : '—')}</div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="hidden text-xs text-slate-400 sm:block">{fmtDate(r.sent_at)}</span>
                        <Icon name="chevronDown" size={16} className={`text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
                      </div>
                    </button>

                    {open && (
                      <div className="space-y-3 border-t border-slate-100 bg-slate-50/60 px-4 py-3 text-sm">
                        <div className="text-xs text-slate-400 sm:hidden">{fmtDate(r.sent_at)}</div>
                        <div>
                          <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Message</div>
                          <pre className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-white p-3 text-slate-700 ring-1 ring-slate-200">{r.message || '—'}</pre>
                        </div>
                        {r.error && (
                          <div>
                            <div className="text-xs font-medium uppercase tracking-wide text-coral-600">Error</div>
                            <pre className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-coral-50 p-3 text-coral-700 ring-1 ring-coral-100">{r.error}</pre>
                          </div>
                        )}
                        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
                          {r.student_id && <span><span className="text-slate-400">Student:</span> {r.student_id}</span>}
                          <span><span className="text-slate-400">Log ID:</span> {r.id}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

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
