import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { PageHeader, SearchInput, EmptyState, ErrorBanner, SkeletonRows, StatusPill, useSort, SortHeader } from '../components/ui.jsx';
import { MultiSelect } from '../components/MultiSelect.jsx';
import { ENROLMENT_STATUSES } from '../lib/constants.js';
import { fmtDateShort, pct } from '../lib/format.js';

const EMPTY = { term: '', dse: '', from: '', to: '' };

function PaidBadge({ value }) {
  if (value === true) return <span className="pill pill-green">Paid</span>;
  if (value === false) return <span className="pill pill-coral">Unpaid</span>;
  return <span className="text-slate-300">—</span>;
}

export default function Enrolments() {
  const [draft, setDraft] = useState(EMPTY);
  const [committed, setCommitted] = useState(EMPTY);
  const [statusSel, setStatusSel] = useState([]);
  const [sort, toggleSort] = useSort('enrolled_at', 'desc');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setRows(null);
    setError('');
    const { term, dse, from, to } = committed;
    let q = supabase
      .from('enrolments')
      .select('id, student_id, course_id, course_name, user_name, status, is_paid, percentage_completed, enrolled_at, student:student_id!inner(dse_year)')
      .order(sort.key, { ascending: sort.dir === 'asc' })
      .limit(200);
    if (term.trim()) {
      const s = term.trim().replace(/[,()]/g, '\\$&');
      q = q.or([`id.ilike.%${s}%`, `student_id.ilike.%${s}%`, `course_id.ilike.%${s}%`, `user_name.ilike.%${s}%`].join(','));
    }
    if (statusSel.length) q = q.in('status', statusSel);
    if (dse.trim()) q = q.eq('student.dse_year', dse.trim());
    if (from) q = q.gte('enrolled_at', from);
    if (to) q = q.lte('enrolled_at', to);

    const { data, error } = await q;
    if (error) { setError(error.message); setRows([]); return; }
    setRows(data || []);
  }, [committed, statusSel, sort]);

  useEffect(() => { load(); }, [load]);

  const apply = () => setCommitted(draft);
  const onEnter = (e) => e.key === 'Enter' && apply();
  const set = (k) => (e) => setDraft((x) => ({ ...x, [k]: e.target.value }));

  return (
    <>
      <PageHeader title="Enrolments" subtitle="Synced from Thinkific." />

      <div className="card mb-4 p-4 sm:p-5">
        <div className="grid gap-3 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <SearchInput value={draft.term} onChange={(v) => setDraft((x) => ({ ...x, term: v }))} onSubmit={apply} placeholder="Search enrolment, student, course, name…" />
          </div>
          <MultiSelect label="Status" options={ENROLMENT_STATUSES} selected={statusSel} onChange={setStatusSel} />
          <input className="input" placeholder="DSE year" value={draft.dse} onChange={set('dse')} onKeyDown={onEnter} />
          <div className="grid grid-cols-2 gap-2 lg:col-span-1">
            <input className="input" type="date" value={draft.from} onChange={set('from')} aria-label="Enrolled from" title="Enrolled from" />
            <input className="input" type="date" value={draft.to} onChange={set('to')} aria-label="Enrolled to" title="Enrolled to" />
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button className="btn btn-primary" onClick={apply}>Apply filters</button>
          <button className="btn btn-ghost" onClick={() => { setDraft(EMPTY); setCommitted(EMPTY); setStatusSel([]); }}>Clear</button>
        </div>
      </div>

      <ErrorBanner message={error} />

      {rows === null ? (
        <SkeletonRows />
      ) : rows.length === 0 ? (
        <EmptyState icon="enrolments" title="No enrolments found" hint="Try different filters." />
      ) : (
        <>
          <div className="mb-2 text-sm text-slate-400">Showing {rows.length}{rows.length === 200 ? '+ (refine to narrow)' : ''}</div>
          <div className="card overflow-hidden">
            <table className="hidden w-full md:table">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
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
        </>
      )}
    </>
  );
}
