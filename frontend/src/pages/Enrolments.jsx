import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { PageHeader, SearchInput, EmptyState, ErrorBanner, StatusPill, Spinner, useSort, SortHeader } from '../components/ui.jsx';
import { MultiSelect } from '../components/MultiSelect.jsx';
import { useToast } from '../components/Toast.jsx';
import { Icon } from '../components/icons.jsx';
import { downloadCsv, fetchAll } from '../lib/csv.js';
import { ENROLMENT_STATUSES } from '../lib/constants.js';
import { fmtDateShort, pct } from '../lib/format.js';

const PAGE = 40;
const EMPTY = { term: '', dse: '', from: '', to: '' };
const ID_SEL = 'id, student:student_id!inner(dse_year)';
const LOAD_COLS = 'id, student_id, course_id, course_name, user_name, status, is_paid, percentage_completed, enrolled_at, student:student_id!inner(dse_year)';

function PaidBadge({ value }) {
  if (value === true) return <span className="pill pill-green">Paid</span>;
  if (value === false) return <span className="pill pill-coral">Unpaid</span>;
  return <span className="text-slate-300">—</span>;
}

export default function Enrolments() {
  const [draft, setDraft] = useState(EMPTY);
  const [committed, setCommitted] = useState(EMPTY);
  const [statusSel, setStatusSel] = useState([]);
  const [paid, setPaid] = useState('');
  const [sort, toggleSort] = useSort('enrolled_at', 'desc');

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const [sel, setSel] = useState(() => new Set());
  const [allMatching, setAllMatching] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const navigate = useNavigate();
  const toast = useToast();
  const offsetRef = useRef(0);
  const loadingRef = useRef(false);
  const doneRef = useRef(false);
  const sentinelRef = useRef(null);

  const buildQuery = useCallback((selectStr, opts) => {
    const { term, dse, from, to } = committed;
    let q = supabase.from('enrolments').select(selectStr, opts).order(sort.key, { ascending: sort.dir === 'asc' });
    if (term.trim()) {
      const s = term.trim().replace(/[,()]/g, '\\$&');
      q = q.or([`id.ilike.%${s}%`, `student_id.ilike.%${s}%`, `course_id.ilike.%${s}%`, `user_name.ilike.%${s}%`].join(','));
    }
    if (statusSel.length) q = q.in('status', statusSel);
    if (paid === 'paid') q = q.eq('is_paid', true);
    else if (paid === 'unpaid') q = q.eq('is_paid', false);
    else if (paid === 'unset') q = q.is('is_paid', null);
    if (dse.trim()) q = q.eq('student.dse_year', dse.trim());
    if (from) q = q.gte('enrolled_at', from);
    if (to) q = q.lte('enrolled_at', to);
    return q;
  }, [committed, statusSel, paid, sort]);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || doneRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    const from = offsetRef.current;
    const { data, error } = await buildQuery(LOAD_COLS).range(from, from + PAGE - 1);
    if (error) {
      setError(error.message);
      doneRef.current = true;
      setDone(true);
    } else {
      const batch = data || [];
      setRows((prev) => [...prev, ...batch]);
      offsetRef.current += batch.length;
      if (batch.length < PAGE) { doneRef.current = true; setDone(true); }
    }
    loadingRef.current = false;
    setLoading(false);
  }, [buildQuery]);

  // reset + reload whenever filters/sort change
  useEffect(() => {
    offsetRef.current = 0;
    doneRef.current = false;
    loadingRef.current = false;
    setRows([]);
    setDone(false);
    setError('');
    setSel(new Set());
    setAllMatching(false);
    setTotal(null);
    loadMore();
    buildQuery(ID_SEL, { count: 'exact', head: true }).then(({ count }) => setTotal(count ?? null));
  }, [buildQuery]); // eslint-disable-line

  // infinite scroll
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver((e) => e[0].isIntersecting && loadMore(), { rootMargin: '300px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore]);

  const apply = () => setCommitted(draft);
  const onEnter = (e) => e.key === 'Enter' && apply();
  const set = (k) => (e) => setDraft((x) => ({ ...x, [k]: e.target.value }));

  async function exportCsv() {
    setExporting(true);
    try {
      const all = await fetchAll(() => buildQuery(
        'id, student_id, user_name, user_email, course_id, course_name, status, is_paid, paid_amount, percentage_completed, enrolled_at, student:student_id!inner(phone_number, dse_year)',
      ));
      downloadCsv(`enrolments-${new Date().toISOString().slice(0, 10)}.csv`, [
        { label: 'Enrolment ID', key: 'id' },
        { label: 'Student', get: (r) => r.user_name },
        { label: 'Email', get: (r) => r.user_email },
        { label: 'Phone', get: (r) => r.student?.phone_number },
        { label: 'DSE Year', get: (r) => r.student?.dse_year },
        { label: 'Course', get: (r) => r.course_name },
        { label: 'Course ID', key: 'course_id' },
        { label: 'Status', key: 'status' },
        { label: 'Paid', get: (r) => (r.is_paid == null ? '' : r.is_paid ? 'Yes' : 'No') },
        { label: 'Paid Amount', key: 'paid_amount' },
        { label: 'Completion', get: (r) => (r.percentage_completed == null ? '' : `${Math.round(r.percentage_completed * 100)}%`) },
        { label: 'Enrolled', key: 'enrolled_at' },
      ], all);
    } catch (e) {
      setError(e.message);
    } finally {
      setExporting(false);
    }
  }

  async function bulkPaid(value) {
    setBulkBusy(true);
    try {
      if (allMatching) {
        if (!window.confirm(`Mark ALL ${total} matching enrolments ${value ? 'paid' : 'unpaid'}?`)) {
          setBulkBusy(false);
          return;
        }
        const idRows = await fetchAll(() => buildQuery(ID_SEL));
        const ids = idRows.map((r) => r.id);
        for (let i = 0; i < ids.length; i += 500) {
          const { error } = await supabase.from('enrolments').update({ is_paid: value }).in('id', ids.slice(i, i + 500));
          if (error) throw new Error(error.message);
        }
        setRows((rs) => rs.map((r) => ({ ...r, is_paid: value })));
        toast(`Marked ${ids.length} ${value ? 'paid' : 'unpaid'}.`, 'success');
      } else {
        const ids = [...sel];
        if (!ids.length) return;
        const { error } = await supabase.from('enrolments').update({ is_paid: value }).in('id', ids);
        if (error) throw new Error(error.message);
        setRows((rs) => rs.map((r) => (sel.has(r.id) ? { ...r, is_paid: value } : r)));
        toast(`Marked ${ids.length} ${value ? 'paid' : 'unpaid'}.`, 'success');
      }
      setSel(new Set());
      setAllMatching(false);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBulkBusy(false);
    }
  }

  const allLoadedSelected = rows.length > 0 && sel.size === rows.length;
  const selectionCount = allMatching ? total : sel.size;

  return (
    <>
      <PageHeader
        title="Enrolments"
        subtitle="Synced from Thinkific."
        actions={
          <button className="btn btn-ghost" onClick={exportCsv} disabled={exporting}>
            {exporting ? <Spinner /> : <><Icon name="download" size={16} /> Export CSV</>}
          </button>
        }
      />

      <div className="card mb-4 p-4 sm:p-5">
        <div className="grid gap-3 lg:grid-cols-7">
          <div className="lg:col-span-2">
            <SearchInput value={draft.term} onChange={(v) => setDraft((x) => ({ ...x, term: v }))} onSubmit={apply} placeholder="Search enrolment, student, course, name…" />
          </div>
          <MultiSelect label="Status" options={ENROLMENT_STATUSES} selected={statusSel} onChange={setStatusSel} />
          <input className="input" placeholder="DSE year" value={draft.dse} onChange={set('dse')} onKeyDown={onEnter} />
          <select className="input" value={paid} onChange={(e) => setPaid(e.target.value)} aria-label="Paid">
            <option value="">Paid: all</option>
            <option value="paid">Paid</option>
            <option value="unpaid">Unpaid</option>
            <option value="unset">Not set</option>
          </select>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:col-span-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400" htmlFor="enr-from">Enrolled from</label>
              <input id="enr-from" className="input" type="date" value={draft.from} onChange={set('from')} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400" htmlFor="enr-to">Enrolled to</label>
              <input id="enr-to" className="input" type="date" value={draft.to} onChange={set('to')} />
            </div>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button className="btn btn-primary" onClick={apply}>Apply filters</button>
          <button className="btn btn-ghost" onClick={() => { setDraft(EMPTY); setCommitted(EMPTY); setStatusSel([]); setPaid(''); }}>Clear</button>
        </div>
      </div>

      <ErrorBanner message={error} />

      {rows.length === 0 && !loading ? (
        <EmptyState icon="enrolments" title="No enrolments found" hint="Try different filters." />
      ) : (
        <>
          {selectionCount > 0 ? (
            <div className="mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm">
              <span className="font-medium text-brand-800">{selectionCount} selected</span>
              {!allMatching && allLoadedSelected && total > rows.length && (
                <button className="font-medium text-brand-700 underline" onClick={() => setAllMatching(true)}>
                  Select all {total} matching
                </button>
              )}
              <button className="btn btn-sm btn-primary" onClick={() => bulkPaid(true)} disabled={bulkBusy}>{bulkBusy ? <Spinner size={14} /> : 'Mark paid'}</button>
              <button className="btn btn-sm btn-ghost" onClick={() => bulkPaid(false)} disabled={bulkBusy}>Mark unpaid</button>
              <button className="btn btn-sm btn-ghost" onClick={() => { setSel(new Set()); setAllMatching(false); }}>Clear</button>
            </div>
          ) : (
            <div className="mb-2 text-sm text-slate-400">Showing {rows.length}{total != null ? ` of ${total}` : ''}</div>
          )}

          <div className="card overflow-hidden">
            <table className="hidden w-full md:table">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded accent-brand-600"
                      checked={allMatching || allLoadedSelected}
                      onChange={(e) => {
                        if (e.target.checked) setSel(new Set(rows.map((r) => r.id)));
                        else { setSel(new Set()); setAllMatching(false); }
                      }}
                      aria-label="Select all on screen"
                    />
                  </th>
                  <SortHeader label="Student" sortKey="user_name" sort={sort} onToggle={toggleSort} />
                  <SortHeader label="Course" sortKey="course_name" sort={sort} onToggle={toggleSort} />
                  <SortHeader label="Status" sortKey="status" sort={sort} onToggle={toggleSort} />
                  <SortHeader label="Paid" sortKey="is_paid" sort={sort} onToggle={toggleSort} />
                  <SortHeader label="Completion" sortKey="percentage_completed" sort={sort} onToggle={toggleSort} />
                  <SortHeader label="Enrolled" sortKey="enrolled_at" sort={sort} onToggle={toggleSort} />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => navigate(`/enrolment/${encodeURIComponent(r.id)}`)}
                    className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-brand-50/60"
                  >
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded accent-brand-600"
                        checked={allMatching || sel.has(r.id)}
                        onChange={() => { setAllMatching(false); setSel((prev) => { const n = new Set(prev); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; }); }}
                        aria-label="Select row"
                      />
                    </td>
                    <td className="px-5 py-3 font-medium text-slate-800">{r.user_name || r.student_id}</td>
                    <td className="px-5 py-3 text-slate-600">{r.course_name || r.course_id}</td>
                    <td className="px-5 py-3"><StatusPill status={r.status} /></td>
                    <td className="px-5 py-3"><PaidBadge value={r.is_paid} /></td>
                    <td className="px-5 py-3 tabular-nums text-slate-600">{pct(r.percentage_completed)}</td>
                    <td className="px-5 py-3 text-slate-500">{fmtDateShort(r.enrolled_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <ul className="divide-y divide-slate-100 md:hidden">
              {rows.map((r) => (
                <li key={r.id}>
                  <button onClick={() => navigate(`/enrolment/${encodeURIComponent(r.id)}`)} className="block w-full px-4 py-3.5 text-left hover:bg-brand-50/60">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate font-medium text-slate-800">{r.user_name || r.student_id}</span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        {r.is_paid != null && <PaidBadge value={r.is_paid} />}
                        <StatusPill status={r.status} />
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-sm text-slate-500">{r.course_name || r.course_id}</div>
                    <div className="mt-1 text-xs text-slate-400">{pct(r.percentage_completed)} · {fmtDateShort(r.enrolled_at)}</div>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div ref={sentinelRef} className="flex items-center justify-center py-6 text-sm text-slate-400">
            {loading ? <span className="flex items-center gap-2"><Spinner size={16} /> Loading…</span>
              : done ? `All ${rows.length} loaded` : 'Scroll to load more'}
          </div>
        </>
      )}
    </>
  );
}
