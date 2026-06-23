import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useToast } from '../components/Toast.jsx';
import {
  PageHeader, Field, ErrorBanner, SkeletonRows, Spinner, StatusPill, SearchInput,
  useSort, sortRows, SortHeader,
} from '../components/ui.jsx';
import { MultiSelect } from '../components/MultiSelect.jsx';
import { Icon } from '../components/icons.jsx';
import { downloadCsv } from '../lib/csv.js';
import { buildAudienceSql } from '../lib/audience.js';
import { COURSE_CLASSES, ENROLMENT_STATUSES } from '../lib/constants.js';
import { fmtDateShort, fullName, pct } from '../lib/format.js';

function CourseRoster({ courseId, courseName }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [all, setAll] = useState(null);
  const [error, setError] = useState('');
  const [term, setTerm] = useState('');
  const [statusSel, setStatusSel] = useState([]);
  const [dseSel, setDseSel] = useState([]);
  const [levelSel, setLevelSel] = useState([]);
  const [sort, toggleSort] = useSort('enrolled_at', 'desc');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    setAll(null);
    setError('');
    supabase
      .from('enrolments')
      .select('id, student_id, status, percentage_completed, enrolled_at, user_name, user_email, student:student_id ( first_name, last_name, phone_number, dse_year, current_level )')
      .eq('course_id', courseId)
      .order('enrolled_at', { ascending: false })
      .limit(1000)
      .then(({ data, error }) => { if (error) { setError(error.message); setAll([]); } else setAll(data || []); });
  }, [courseId]);

  const name = (r) => fullName(r.student) || r.user_name || r.student_id;
  const dseOptions = [...new Set((all || []).map((r) => r.student?.dse_year).filter(Boolean))].sort();
  const levelOptions = [...new Set((all || []).map((r) => r.student?.current_level).filter(Boolean))].sort();

  const filtered = (all || []).filter(
    (r) =>
      (statusSel.length === 0 || statusSel.includes(r.status)) &&
      (dseSel.length === 0 || dseSel.includes(r.student?.dse_year)) &&
      (levelSel.length === 0 || levelSel.includes(r.student?.current_level)) &&
      (!term.trim() || name(r).toLowerCase().includes(term.trim().toLowerCase())),
  );
  const rows = sortRows(filtered, sort, {
    student: name,
    phone: (r) => r.student?.phone_number,
    dse: (r) => r.student?.dse_year,
  });
  const withPhone = filtered.filter((r) => r.student?.phone_number).length;

  function exportCsv() {
    downloadCsv(`roster-${courseId}-${new Date().toISOString().slice(0, 10)}.csv`, [
      { label: 'Student', get: (r) => name(r) },
      { label: 'Email', get: (r) => r.user_email },
      { label: 'Phone', get: (r) => r.student?.phone_number },
      { label: 'DSE Year', get: (r) => r.student?.dse_year },
      { label: 'Current Level', get: (r) => r.student?.current_level },
      { label: 'Status', key: 'status' },
      { label: 'Completion', get: (r) => (r.percentage_completed == null ? '' : `${Math.round(r.percentage_completed * 100)}%`) },
      { label: 'Enrolled', key: 'enrolled_at' },
    ], filtered);
  }

  async function createScheduler() {
    setCreating(true);
    const cfg = {
      type: 'course', courseId: String(courseId), courseName: courseName || '',
      statuses: statusSel, dseYears: dseSel, levels: levelSel, campaigns: [], phonesText: '',
    };
    const sql = buildAudienceSql(cfg);
    const bits = [];
    if (statusSel.length) bits.push(statusSel.join('/'));
    if (dseSel.length) bits.push(`DSE ${dseSel.join('/')}`);
    if (levelSel.length) bits.push(levelSel.join('/'));
    const schedName = `${courseName || 'Course'} — ${bits.join(', ') || 'all enrolled'}`.slice(0, 120);
    const { data, error } = await supabase
      .from('whatsapp_schedules')
      .insert({ name: schedName, cron_expr: '0 10 * * *', timezone: 'Asia/Hong_Kong', sql_query: sql, audience: cfg, message_template: '', active: false })
      .select('id')
      .single();
    setCreating(false);
    if (error) return toast(error.message, 'error');
    toast(`Draft scheduler created for ${withPhone} recipients (inactive).`, 'success');
    navigate(`/scheduler/${data.id}`);
  }

  return (
    <div className="mt-4 card overflow-hidden">
      <div className="border-b border-slate-100 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Enrolled students</h2>
            {all && <span className="text-sm text-slate-400">{filtered.length}{filtered.length !== all.length ? ` / ${all.length}` : ''}</span>}
          </div>
          <div className="flex shrink-0 gap-2">
            <button className="btn btn-sm btn-ghost" onClick={exportCsv} disabled={!all || filtered.length === 0}>
              <Icon name="download" size={15} /> CSV
            </button>
            <button className="btn btn-sm btn-primary" onClick={createScheduler} disabled={creating || withPhone === 0} title={withPhone === 0 ? 'No recipients with a WhatsApp number' : ''}>
              {creating ? <Spinner size={14} /> : <><Icon name="scheduler" size={15} /> Create scheduler</>}
            </button>
          </div>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <SearchInput value={term} onChange={setTerm} placeholder="Search by name…" />
          <MultiSelect label="Status" options={ENROLMENT_STATUSES} selected={statusSel} onChange={setStatusSel} />
          <MultiSelect label="DSE year" options={dseOptions} selected={dseSel} onChange={setDseSel} />
          <MultiSelect label="Current level" options={levelOptions} selected={levelSel} onChange={setLevelSel} />
        </div>
        <p className="mt-2 text-xs text-slate-400">“Create scheduler” builds a draft WhatsApp campaign whose recipients are the filtered students with a phone number ({withPhone}). It’s created inactive — add a message and activate it.</p>
      </div>

      <ErrorBanner message={error} />

      {all === null ? (
        <div className="p-5"><SkeletonRows rows={4} /></div>
      ) : rows.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-slate-500">No students match.</p>
      ) : (
        <>
          <table className="hidden w-full md:table">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                <SortHeader label="Student" sortKey="student" sort={sort} onToggle={toggleSort} />
                <SortHeader label="WhatsApp" sortKey="phone" sort={sort} onToggle={toggleSort} />
                <SortHeader label="DSE" sortKey="dse" sort={sort} onToggle={toggleSort} />
                <SortHeader label="Status" sortKey="status" sort={sort} onToggle={toggleSort} />
                <SortHeader label="Completion" sortKey="percentage_completed" sort={sort} onToggle={toggleSort} />
                <SortHeader label="Enrolled" sortKey="enrolled_at" sort={sort} onToggle={toggleSort} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} onClick={() => navigate(`/student/${encodeURIComponent(r.student_id)}`)} className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-brand-50/60">
                  <td className="px-5 py-3">
                    <div className="font-medium text-slate-800">{name(r)}</div>
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

          <ul className="divide-y divide-slate-100 md:hidden">
            {rows.map((r) => (
              <li key={r.id}>
                <button onClick={() => navigate(`/student/${encodeURIComponent(r.student_id)}`)} className="block w-full px-4 py-3.5 text-left hover:bg-brand-50/60">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate font-medium text-slate-800">{name(r)}</span>
                    <StatusPill status={r.status} />
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-slate-400">
                    <span>{r.student?.phone_number || 'no phone'}</span>
                    <span>{r.student?.dse_year || '—'}</span>
                    <span>{pct(r.percentage_completed)}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
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

          <CourseRoster courseId={id} courseName={course.course_name} />
        </>
      ) : null}
    </>
  );
}
