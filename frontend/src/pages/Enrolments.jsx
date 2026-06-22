import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { PageHeader, SearchInput, EmptyState, ErrorBanner, SkeletonRows, StatusPill } from '../components/ui.jsx';
import { ENROLMENT_STATUSES } from '../lib/constants.js';
import { fmtDateShort, pct } from '../lib/format.js';

export default function Enrolments() {
  const [term, setTerm] = useState('');
  const [status, setStatus] = useState('');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  async function load(search = term, st = status) {
    setRows(null);
    setError('');
    let q = supabase
      .from('enrolments')
      .select('id, student_id, course_id, course_name, user_name, status, percentage_completed, enrolled_at')
      .order('enrolled_at', { ascending: false })
      .limit(200);
    if (search) {
      const s = search.replace(/[,()]/g, '\\$&');
      q = q.or([`id.ilike.%${s}%`, `student_id.ilike.%${s}%`, `course_id.ilike.%${s}%`, `user_name.ilike.%${s}%`].join(','));
    }
    if (st) q = q.eq('status', st);
    const { data, error } = await q;
    if (error) {
      setError(error.message);
      setRows([]);
      return;
    }
    setRows(data || []);
  }

  useEffect(() => {
    load('', '');
  }, []);

  return (
    <>
      <PageHeader title="Enrolments" subtitle="Synced from Thinkific." />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <SearchInput value={term} onChange={setTerm} onSubmit={() => load(term.trim(), status)} placeholder="Search by enrolment, student, course or name…" />
        <select
          className="input sm:w-44"
          value={status}
          onChange={(e) => { setStatus(e.target.value); load(term.trim(), e.target.value); }}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {ENROLMENT_STATUSES.map((s) => (
            <option key={s} value={s} className="capitalize">{s}</option>
          ))}
        </select>
        <button className="btn btn-primary" onClick={() => load(term.trim(), status)}>Search</button>
      </div>

      <ErrorBanner message={error} />

      {rows === null ? (
        <SkeletonRows />
      ) : rows.length === 0 ? (
        <EmptyState icon="enrolments" title="No enrolments found" hint="Try a different search or status filter." />
      ) : (
        <>
          <div className="mb-2 text-sm text-slate-400">Showing {rows.length}{rows.length === 200 ? '+ (refine to narrow)' : ''}</div>
          <div className="card overflow-hidden">
            <table className="hidden w-full md:table">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3 font-medium">Student</th>
                  <th className="px-5 py-3 font-medium">Course</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Completion</th>
                  <th className="px-5 py-3 font-medium">Enrolled</th>
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
                    <td className="px-5 py-3 tabular-nums text-slate-600">{pct(r.percentage_completed)}</td>
                    <td className="px-5 py-3 text-slate-500">{fmtDateShort(r.enrolled_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <ul className="divide-y divide-slate-100 md:hidden">
              {rows.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => navigate(`/enrolment/${encodeURIComponent(r.id)}`)}
                    className="block w-full px-4 py-3.5 text-left hover:bg-brand-50/60"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate font-medium text-slate-800">{r.user_name || r.student_id}</span>
                      <StatusPill status={r.status} />
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
