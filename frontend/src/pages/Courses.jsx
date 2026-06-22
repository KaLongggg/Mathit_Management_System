import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { PageHeader, SearchInput, EmptyState, ErrorBanner, SkeletonRows } from '../components/ui.jsx';

export default function Courses() {
  const [term, setTerm] = useState('');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  async function load(search = '') {
    setRows(null);
    setError('');
    let q = supabase
      .from('course')
      .select('course_id,course_name,subtitle,slug,product_id')
      .order('course_name', { ascending: true })
      .limit(300);
    if (search) q = q.or(`course_name.ilike.%${search}%,course_id.ilike.%${search}%`);
    const { data, error } = await q;
    if (error) {
      setError(error.message);
      setRows([]);
      return;
    }
    setRows(data || []);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <>
      <PageHeader title="Courses" subtitle="Synced from Thinkific." />

      <div className="mb-4 flex gap-2">
        <SearchInput value={term} onChange={setTerm} onSubmit={() => load(term.trim())} placeholder="Search by name or ID…" />
        <button className="btn btn-primary" onClick={() => load(term.trim())}>
          Search
        </button>
      </div>

      <ErrorBanner message={error} />

      {rows === null ? (
        <SkeletonRows />
      ) : rows.length === 0 ? (
        <EmptyState icon="courses" title="No courses found" hint="Try a different name or course ID." />
      ) : (
        <div className="card overflow-hidden">
          {/* Desktop table */}
          <table className="hidden w-full md:table">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-5 py-3 font-medium">ID</th>
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Subtitle</th>
                <th className="px-5 py-3 font-medium">Product ID</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr
                  key={c.course_id}
                  onClick={() => navigate(`/course/${encodeURIComponent(c.course_id)}`)}
                  className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-brand-50/60"
                >
                  <td className="px-5 py-3 font-mono text-[13px] text-slate-500">{c.course_id}</td>
                  <td className="px-5 py-3 font-medium text-slate-800">{c.course_name}</td>
                  <td className="px-5 py-3 text-slate-500">{c.subtitle || '-'}</td>
                  <td className="px-5 py-3 font-mono text-[13px] text-slate-500">{c.product_id || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Mobile cards */}
          <ul className="divide-y divide-slate-100 md:hidden">
            {rows.map((c) => (
              <li key={c.course_id}>
                <button
                  onClick={() => navigate(`/course/${encodeURIComponent(c.course_id)}`)}
                  className="block w-full px-4 py-3.5 text-left hover:bg-brand-50/60"
                >
                  <div className="font-medium text-slate-800">{c.course_name}</div>
                  <div className="mt-0.5 text-xs text-slate-400">
                    {c.subtitle ? `${c.subtitle} · ` : ''}ID {c.course_id}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
