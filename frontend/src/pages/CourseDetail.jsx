import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useToast } from '../components/Toast.jsx';
import { PageHeader, Field, ErrorBanner, SkeletonRows, Spinner, StatusPill, EmptyState, SearchInput } from '../components/ui.jsx';
import { COURSE_CLASSES, ENROLMENT_STATUSES } from '../lib/constants.js';
import { fmtDateShort, fullName, pct } from '../lib/format.js';

const PAGE = 25;

function CourseRoster({ courseId }) {
  const navigate = useNavigate();
  const [term, setTerm] = useState('');
  const [status, setStatus] = useState('');
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const filtersRef = useRef({ term: '', status: '' });
  const offsetRef = useRef(0);
  const loadingRef = useRef(false);
  const doneRef = useRef(false);
  const sentinelRef = useRef(null);

  const buildQuery = (f) => {
    let q = supabase
      .from('enrolments')
      .select('id, student_id, status, percentage_completed, enrolled_at, user_name, user_email, student:student_id ( first_name, last_name, phone_number, dse_year )')
      .eq('course_id', courseId)
      .order('enrolled_at', { ascending: false });
    if (f.term.trim()) q = q.ilike('user_name', `%${f.term.trim()}%`);
    if (f.status) q = q.eq('status', f.status);
    return q;
  };

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
      if (batch.length < PAGE) { doneRef.current = true; setDone(true); }
    }
    loadingRef.current = false;
    setLoading(false);
  }, [courseId]); // eslint-disable-line

  const apply = (next) => {
    filtersRef.current = next;
    offsetRef.current = 0;
    doneRef.current = false;
    setRows([]);
    setDone(false);
    setError('');
    loadMore();
    // refresh count for the active filter
    let cq = supabase.from('enrolments').select('*', { count: 'exact', head: true }).eq('course_id', courseId);
    if (next.term.trim()) cq = cq.ilike('user_name', `%${next.term.trim()}%`);
    if (next.status) cq = cq.eq('status', next.status);
    cq.then(({ count }) => setTotal(count ?? null));
  };

  useEffect(() => { apply({ term: '', status: '' }); }, [courseId]); // eslint-disable-line

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver((e) => e[0].isIntersecting && loadMore(), { rootMargin: '250px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore]);

  return (
    <div className="mt-4 card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:p-5">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Enrolled students</h2>
          {total != null && <span className="text-sm text-slate-400">{total.toLocaleString()}</span>}
        </div>
        <div className="flex flex-1 gap-2 sm:ml-auto sm:max-w-md">
          <SearchInput value={term} onChange={setTerm} onSubmit={() => apply({ term, status })} placeholder="Search by name…" />
          <select
            className="input sm:w-40"
            value={status}
            onChange={(e) => { setStatus(e.target.value); apply({ term, status: e.target.value }); }}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            {ENROLMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <ErrorBanner message={error} />

      {rows.length === 0 && !loading ? (
        <p className="px-5 py-10 text-center text-sm text-slate-500">No students match.</p>
      ) : (
        <>
          {/* Desktop table */}
          <table className="hidden w-full md:table">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-5 py-3 font-medium">Student</th>
                <th className="px-5 py-3 font-medium">WhatsApp</th>
                <th className="px-5 py-3 font-medium">DSE</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Completion</th>
                <th className="px-5 py-3 font-medium">Enrolled</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => navigate(`/student/${encodeURIComponent(r.student_id)}`)}
                  className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-brand-50/60"
                >
                  <td className="px-5 py-3">
                    <div className="font-medium text-slate-800">{fullName(r.student) || r.user_name || r.student_id}</div>
                    <div className="text-xs text-slate-400">{r.user_email || ''}</div>
                  </td>
                  <td className="px-5 py-3 text-slate-600">{r.student?.phone_number || '-'}</td>
                  <td className="px-5 py-3 text-slate-600">{r.student?.dse_year || '-'}</td>
                  <td className="px-5 py-3"><StatusPill status={r.status} /></td>
                  <td className="px-5 py-3 tabular-nums text-slate-600">{pct(r.percentage_completed)}</td>
                  <td className="px-5 py-3 text-slate-500">{fmtDateShort(r.enrolled_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Mobile cards */}
          <ul className="divide-y divide-slate-100 md:hidden">
            {rows.map((r) => (
              <li key={r.id}>
                <button onClick={() => navigate(`/student/${encodeURIComponent(r.student_id)}`)} className="block w-full px-4 py-3.5 text-left hover:bg-brand-50/60">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate font-medium text-slate-800">{fullName(r.student) || r.user_name || r.student_id}</span>
                    <StatusPill status={r.status} />
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-slate-400">
                    <span>{r.student?.phone_number || 'no phone'}</span>
                    <span>{pct(r.percentage_completed)}</span>
                    <span>{fmtDateShort(r.enrolled_at)}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>

          <div ref={sentinelRef} className="flex items-center justify-center py-5 text-sm text-slate-400">
            {loading ? <span className="flex items-center gap-2"><Spinner size={16} /> Loading…</span>
              : done ? `All ${rows.length} shown` : 'Scroll to load more'}
          </div>
        </>
      )}
    </div>
  );
}

export default function CourseDetail() {
  const { id } = useParams();
  const toast = useToast();
  const [course, setCourse] = useState(null);
  const [error, setError] = useState('');
  const [klass, setKlass] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from('course').select('*').eq('course_id', id).single();
      if (error) setError(error.message);
      else { setCourse(data); setKlass(data.course_class || ''); }
    })();
  }, [id]);

  async function saveClass() {
    setSaving(true);
    const { error } = await supabase.from('course').update({ course_class: klass || null }).eq('course_id', id);
    setSaving(false);
    if (error) return toast(error.message, 'error');
    setCourse((c) => ({ ...c, course_class: klass || null }));
    toast('Class updated.', 'success');
  }

  const dirty = course && (course.course_class || '') !== klass;

  return (
    <>
      <PageHeader title="Course" backTo="/courses" backLabel="Back to courses" actions={<span className="pill pill-brand">Synced from Thinkific</span>} />

      <ErrorBanner message={error} />

      {!course && !error ? (
        <SkeletonRows rows={4} />
      ) : course ? (
        <>
          <div className="card overflow-hidden">
            <div className="flex items-start gap-4 border-b border-slate-100 p-5 sm:p-6">
              {course.course_card_image_url && (
                <img src={course.course_card_image_url} alt="" className="h-20 w-20 flex-shrink-0 rounded-xl object-cover ring-1 ring-slate-200" />
              )}
              <div className="min-w-0">
                <h2 className="text-xl font-semibold">{course.course_name}</h2>
                {course.subtitle && <p className="mt-1 text-sm text-slate-500">{course.subtitle}</p>}
              </div>
            </div>

            <div className="border-b border-slate-100 bg-brand-50/40 p-5 sm:p-6">
              <label className="label" htmlFor="course-class">Class</label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <select id="course-class" className="input sm:w-64" value={klass} onChange={(e) => setKlass(e.target.value)}>
                  <option value="">— Unclassified —</option>
                  {COURSE_CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <button className="btn btn-primary sm:w-auto" onClick={saveClass} disabled={!dirty || saving}>
                  {saving ? <Spinner /> : 'Save class'}
                </button>
              </div>
              <p className="mt-1.5 text-xs text-slate-400">Locally managed — not overwritten by a normal Thinkific sync.</p>
            </div>

            <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
              <Field label="Course ID"><span className="font-mono text-[13px]">{course.course_id}</span></Field>
              <Field label="Product ID"><span className="font-mono text-[13px]">{course.product_id}</span></Field>
              <Field label="Slug"><span className="font-mono text-[13px]">{course.slug}</span></Field>
              <Field label="Instructor ID"><span className="font-mono text-[13px]">{course.instructor_id}</span></Field>
              <Field label="Keywords" full>{course.keywords}</Field>
              <Field label="Description" full>
                <span className="whitespace-pre-wrap text-sm text-slate-600">{course.description || '-'}</span>
              </Field>
            </div>
          </div>

          <CourseRoster courseId={id} />
        </>
      ) : null}
    </>
  );
}
