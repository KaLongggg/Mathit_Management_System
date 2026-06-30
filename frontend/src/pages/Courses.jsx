import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { PageHeader, SearchInput, EmptyState, ErrorBanner, SkeletonRows, ClassPill, useSort, sortRows, SortHeader } from '../components/ui.jsx';
import { COURSE_CLASSES } from '../lib/constants.js';
import { useConfig } from '../lib/config.js';

export default function Courses() {
  const [term, setTerm] = useState('');
  const [klass, setKlass] = useState('');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [sort, toggleSort] = useSort('course_name', 'asc');
  const navigate = useNavigate();
  const cfg = useConfig();
  const courseClasses = cfg.course_class_options || COURSE_CLASSES;
  const sorted = sortRows(rows || [], sort);

  async function load(search = term, cls = klass) {
    setRows(null);
    setError('');
    let q = supabase
      .from('course')
      .select('course_id,course_name,subtitle,course_class')
      .order('course_name', { ascending: true })
      .limit(500);
    if (search) q = q.or(`course_name.ilike.%${search}%,course_id.ilike.%${search}%`);
    if (cls) q = q.eq('course_class', cls);
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
      <PageHeader title="Courses" subtitle="Synced from Thinkific · classified locally." />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <SearchInput value={term} onChange={setTerm} onSubmit={() => load(term.trim(), klass)} placeholder="Search by name or ID…" />
        <select
          className="input sm:w-48"
          value={klass}
          onChange={(e) => {
            setKlass(e.target.value);
            load(term.trim(), e.target.value);
          }}
          aria-label="Filter by class"
        >
          <option value="">All classes</option>
          {courseClasses.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <button className="btn btn-primary" onClick={() => load(term.trim(), klass)}>Search</button>
      </div>

      <ErrorBanner message={error} />

      {rows === null ? (
        <SkeletonRows />
      ) : rows.length === 0 ? (
        <EmptyState icon="courses" title="No courses found" hint="Try a different search or class filter." />
      ) : (
        <>
          <div className="mb-2 text-sm text-slate-400">{rows.length} course{rows.length === 1 ? '' : 's'}</div>
          <div className="card overflow-hidden">
            <table className="hidden w-full md:table">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                  <SortHeader label="ID" sortKey="course_id" sort={sort} onToggle={toggleSort} />
                  <SortHeader label="Name" sortKey="course_name" sort={sort} onToggle={toggleSort} />
                  <SortHeader label="Class" sortKey="course_class" sort={sort} onToggle={toggleSort} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((c) => (
                  <tr
                    key={c.course_id}
                    onClick={() => navigate(`/course/${encodeURIComponent(c.course_id)}`)}
                    className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-brand-50/60"
                  >
                    <td className="px-5 py-3 font-mono text-[13px] text-slate-500">{c.course_id}</td>
                    <td className="px-5 py-3">
                      <div className="font-medium text-slate-800">{c.course_name}</div>
                      {c.subtitle && <div className="text-xs text-slate-400">{c.subtitle}</div>}
                    </td>
                    <td className="px-5 py-3"><ClassPill value={c.course_class} /></td>
                  </tr>
                ))}
              </tbody>
            </table>

            <ul className="divide-y divide-slate-100 md:hidden">
              {sorted.map((c) => (
                <li key={c.course_id}>
                  <button
                    onClick={() => navigate(`/course/${encodeURIComponent(c.course_id)}`)}
                    className="block w-full px-4 py-3.5 text-left hover:bg-brand-50/60"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate font-medium text-slate-800">{c.course_name}</span>
                      <ClassPill value={c.course_class} />
                    </div>
                    <div className="mt-0.5 text-xs text-slate-400">ID {c.course_id}</div>
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
