import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { createStudent } from '../lib/api.js';
import { useToast } from '../components/Toast.jsx';
import { PageHeader, EmptyState, ErrorBanner, Spinner, Modal } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';
import { downloadCsv, fetchAll } from '../lib/csv.js';
import { fullName } from '../lib/format.js';

const PAGE = 30;
const EMPTY = { first: '', last: '', email: '', phone: '', dse_year: '' };

function buildQuery(f) {
  let q = supabase.from('student').select('*').order('created_at', { ascending: false });
  if (f.first.trim()) q = q.ilike('first_name', `%${f.first.trim()}%`);
  if (f.last.trim()) q = q.ilike('last_name', `%${f.last.trim()}%`);
  if (f.email.trim()) q = q.ilike('email', `%${f.email.trim()}%`);
  if (f.phone.trim()) {
    const p = f.phone.trim();
    q = q.or(`phone_number.ilike.%${p}%,alt_phone.ilike.%${p}%`);
  }
  if (f.dse_year.trim()) q = q.ilike('dse_year', `%${f.dse_year.trim()}%`);
  return q;
}

function AddStudentForm({ onClose }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [f, setF] = useState({ first_name: '', last_name: '', email: '', phone_number: '', dse_year: '', current_level: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    if (!f.first_name.trim() || !f.last_name.trim() || !f.email.trim()) {
      setErr('First name, last name and email are required.');
      return;
    }
    setErr('');
    setBusy(true);
    try {
      const { student } = await createStudent({
        first_name: f.first_name.trim(),
        last_name: f.last_name.trim(),
        email: f.email.trim(),
        phone_number: f.phone_number.trim(),
        dse_year: f.dse_year.trim(),
        current_level: f.current_level.trim(),
      });
      toast('Student created.', 'success');
      onClose();
      navigate(`/student/${encodeURIComponent(student.student_id)}`);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">First name *</label>
          <input className="input" value={f.first_name} onChange={set('first_name')} autoFocus />
        </div>
        <div>
          <label className="label">Last name *</label>
          <input className="input" value={f.last_name} onChange={set('last_name')} />
        </div>
      </div>
      <div>
        <label className="label">Email *</label>
        <input type="email" className="input" value={f.email} onChange={set('email')} />
      </div>
      <div>
        <label className="label">WhatsApp / Phone</label>
        <input className="input" value={f.phone_number} onChange={set('phone_number')} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">DSE Year (optional)</label>
          <input className="input" value={f.dse_year} onChange={set('dse_year')} placeholder="e.g. 2027" />
        </div>
        <div>
          <label className="label">Level (optional)</label>
          <input className="input" value={f.current_level} onChange={set('current_level')} />
        </div>
      </div>
      <ErrorBanner message={err} />
      <p className="text-xs text-slate-400">Creates the account in Thinkific (a welcome email is sent) and adds them here.</p>
      <div className="flex gap-2 pt-1">
        <button className="btn btn-primary" disabled={busy}>{busy ? <Spinner /> : 'Create student'}</button>
        <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
}

export default function Students() {
  const [draft, setDraft] = useState(EMPTY);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [exporting, setExporting] = useState(false);

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

  const set = (k) => (e) => setDraft((x) => ({ ...x, [k]: e.target.value }));
  const onEnter = (e) => e.key === 'Enter' && applyFilters(draft);

  async function exportCsv() {
    setExporting(true);
    try {
      const all = await fetchAll(() => buildQuery(filtersRef.current));
      downloadCsv(`students-${new Date().toISOString().slice(0, 10)}.csv`, [
        { label: 'Student ID', key: 'student_id' },
        { label: 'First name', key: 'first_name' },
        { label: 'Last name', key: 'last_name' },
        { label: 'Email', key: 'email' },
        { label: 'Phone', key: 'phone_number' },
        { label: 'DSE Year', key: 'dse_year' },
        { label: 'DSE Aim', key: 'dse_aim' },
        { label: 'Current Level', key: 'current_level' },
        { label: 'Shipping Address', key: 'postal_address' },
        { label: 'Created', key: 'created_at' },
      ], all);
    } catch (e) {
      setError(e.message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Students"
        subtitle="Filter, then scroll to load more."
        actions={
          <>
            <button className="btn btn-ghost" onClick={exportCsv} disabled={exporting}>
              {exporting ? <Spinner /> : <><Icon name="download" size={16} /> Export CSV</>}
            </button>
            <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
              <Icon name="userPlus" size={16} /> Add student
            </button>
          </>
        }
      />

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

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add student">
        <AddStudentForm onClose={() => setShowAdd(false)} />
      </Modal>
    </>
  );
}
