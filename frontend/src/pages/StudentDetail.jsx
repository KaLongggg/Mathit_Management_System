import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { deleteStudent, enrolStudent, updateStudent } from '../lib/api.js';
import { useToast } from '../components/Toast.jsx';
import { PageHeader, Field, ErrorBanner, SkeletonRows, StatusPill, Spinner, Modal, useSort, sortRows, SortHeader } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';
import { MultiSelect } from '../components/MultiSelect.jsx';
import { ENROLMENT_STATUSES, thinkificAdminUserUrl } from '../lib/constants.js';
import { getConfig } from '../lib/config.js';
import { fmtDate, fmtDateShort, fullName, pct } from '../lib/format.js';

function LogPill({ status }) {
  const map = { sent: 'pill-green', failed: 'pill-coral', dry_run: 'pill-slate' };
  return <span className={`pill ${map[status] || 'pill-slate'}`}>{status || 'unknown'}</span>;
}

function EnrolCourseForm({ studentId, onClose, onDone }) {
  const toast = useToast();
  const [term, setTerm] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [err, setErr] = useState('');

  const search = useCallback(async (t = '') => {
    setSearching(true);
    let q = supabase.from('course').select('course_id,course_name').order('course_name').limit(25);
    if (t.trim()) q = q.or(`course_name.ilike.%${t.trim()}%,course_id.ilike.%${t.trim()}%`);
    const { data } = await q;
    setResults(data || []);
    setSearching(false);
  }, []);

  useEffect(() => { search(); }, [search]);

  async function enrol(c) {
    setErr('');
    setBusyId(c.course_id);
    try {
      const months = await getConfig('enrolment_expiry_months');
      await enrolStudent(studentId, c.course_id, months);
      toast('Enrolled.', 'success');
      onDone();
      onClose();
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          className="input"
          placeholder="Search course…"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search(term)}
          autoFocus
        />
        <button className="btn btn-ghost" onClick={() => search(term)}>Search</button>
      </div>
      <ErrorBanner message={err} />
      <div className="max-h-80 divide-y divide-slate-100 overflow-auto rounded-xl border border-slate-200">
        {searching ? (
          <div className="p-4 text-sm text-slate-400">Searching…</div>
        ) : results.length === 0 ? (
          <div className="p-4 text-sm text-slate-400">No courses found.</div>
        ) : (
          results.map((c) => (
            <div key={c.course_id} className="flex items-center gap-2 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-slate-800">{c.course_name}</div>
                <div className="font-mono text-xs text-slate-400">{c.course_id}</div>
              </div>
              <button className="btn btn-sm btn-primary" disabled={busyId === c.course_id} onClick={() => enrol(c)}>
                {busyId === c.course_id ? <Spinner size={14} /> : 'Enrol'}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FIELDS = [
  ['first_name', 'First name'],
  ['last_name', 'Last name'],
  ['email', 'Email'],
  ['phone_number', 'WhatsApp / Phone'],
  ['dse_year', 'DSE Year'],
  ['dse_aim', 'DSE Aim'],
  ['current_level', 'Current Level'],
];

export default function StudentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [student, setStudent] = useState(null);
  const [error, setError] = useState('');
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [enrols, setEnrols] = useState(null);
  const [msgs, setMsgs] = useState(null);
  const [schedNames, setSchedNames] = useState({});
  const [showEnrol, setShowEnrol] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [eStatusSel, setEStatusSel] = useState([]);
  const [eFrom, setEFrom] = useState('');
  const [eTo, setETo] = useState('');
  const [eSort, toggleESort] = useSort('enrolled_at', 'desc');

  const visibleEnrols = enrols
    ? sortRows(
        enrols.filter(
          (e) =>
            (eStatusSel.length === 0 || eStatusSel.includes(e.status)) &&
            (!eFrom || (e.enrolled_at && e.enrolled_at >= eFrom)) &&
            (!eTo || (e.enrolled_at && e.enrolled_at <= eTo)),
        ),
        eSort,
        { course: (e) => e.course?.course_name },
      )
    : null;

  const loadEnrols = useCallback(async () => {
    const { data, error } = await supabase
      .from('enrolments')
      .select('id, course_id, status, percentage_completed, enrolled_at, course:course_id ( course_name )')
      .eq('student_id', id)
      .order('enrolled_at', { ascending: false });
    setEnrols(error ? [] : data || []);
  }, [id]);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from('student').select('*').eq('student_id', id).single();
      if (error) setError(error.message);
      else setStudent(data);
    })();
    loadEnrols();
    supabase
      .from('whatsapp_schedule_logs')
      .select('*')
      .eq('student_id', id)
      .order('sent_at', { ascending: false })
      .limit(50)
      .then(({ data }) => setMsgs(data || []));
    supabase
      .from('whatsapp_schedules')
      .select('id,name')
      .then(({ data }) => setSchedNames(Object.fromEntries((data || []).map((s) => [s.id, s.name]))));
  }, [id, loadEnrols]);

  function startEdit() {
    setForm({ ...Object.fromEntries(FIELDS.map(([k]) => [k, student[k] ?? ''])), postal_address: student.postal_address ?? '', alt_phone: student.alt_phone ?? '' });
    setEdit(true);
  }

  async function save() {
    if (form.email && !EMAIL_RE.test(form.email.trim())) {
      toast('Please enter a valid email address.', 'error');
      return;
    }
    setSaving(true);
    try {
      // Thinkific-owned fields go through the edge function; postal_address is
      // local-only, saved straight to Supabase.
      const fields = Object.fromEntries(FIELDS.map(([k]) => [k, (form[k] ?? '').toString().trim()]));
      const postal = (form.postal_address ?? '').toString().trim() || null;
      const altPhone = (form.alt_phone ?? '').toString().trim() || null;
      const [{ student: saved }] = await Promise.all([
        updateStudent(id, fields),
        supabase.from('student').update({ postal_address: postal, alt_phone: altPhone }).eq('student_id', id),
      ]);
      setStudent({ ...saved, postal_address: postal, alt_phone: altPhone });
      setEdit(false);
      toast('Saved.', 'success');
    } catch (ex) {
      toast(ex.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    const ok = window.confirm(
      `Delete ${fullName(student) || 'this student'} from Thinkific?\n\nThis permanently removes their account and enrolments and cannot be undone.`,
    );
    if (!ok) return;
    setDeleting(true);
    try {
      await deleteStudent(id);
      toast('Student deleted.', 'success');
      navigate('/students');
    } catch (ex) {
      toast(ex.message, 'error');
      setDeleting(false);
    }
  }

  if (error) return (<><PageHeader title="Student" backTo="/students" /><ErrorBanner message={error} /></>);
  if (!student) return (<><PageHeader title="Student" backTo="/students" /><SkeletonRows rows={4} /></>);

  return (
    <>
      <PageHeader
        title={fullName(student) || 'Student'}
        backTo="/students"
        backLabel="Back to students"
        actions={
          edit ? (
            <>
              <button className="btn btn-ghost" onClick={() => setEdit(false)} disabled={saving}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? <Spinner /> : 'Save changes'}
              </button>
            </>
          ) : (
            <>
              <a href={thinkificAdminUserUrl(student.student_id)} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
                <Icon name="external" size={16} /> Thinkific
              </a>
              <button className="btn btn-ghost" onClick={startEdit}>
                <Icon name="edit" size={16} /> Edit
              </button>
              <button className="btn btn-danger-ghost" onClick={remove} disabled={deleting}>
                {deleting ? <Spinner /> : <><Icon name="trash" size={16} /> Delete</>}
              </button>
            </>
          )
        }
      />

      <div className="card p-5 sm:p-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Student ID"><span className="font-mono text-[13px]">{student.student_id}</span></Field>
          {FIELDS.map(([k, label]) => (
            <div key={k}>
              {edit ? (
                <>
                  <label className="label" htmlFor={k}>{label}</label>
                  <input
                    id={k}
                    className="input"
                    type={k === 'email' ? 'email' : 'text'}
                    value={form[k] ?? ''}
                    onChange={(e) => setForm((x) => ({ ...x, [k]: e.target.value }))}
                  />
                </>
              ) : (
                <Field label={label}>{student[k]}</Field>
              )}
            </div>
          ))}
          <div>
            {edit ? (
              <>
                <label className="label" htmlFor="alt_phone">Alternate phone</label>
                <input id="alt_phone" className="input" value={form.alt_phone ?? ''} onChange={(e) => setForm((x) => ({ ...x, alt_phone: e.target.value }))} />
              </>
            ) : (
              <Field label="Alternate phone">{student.alt_phone}</Field>
            )}
          </div>
          <div className="sm:col-span-2">
            {edit ? (
              <>
                <label className="label" htmlFor="postal_address">Shipping address (SF / 順豐)</label>
                <textarea id="postal_address" className="input" rows={3} value={form.postal_address ?? ''} onChange={(e) => setForm((x) => ({ ...x, postal_address: e.target.value }))} />
              </>
            ) : (
              <Field label="Shipping address" full>
                {student.postal_address ? <span className="whitespace-pre-wrap">{student.postal_address}</span> : null}
              </Field>
            )}
          </div>
        </div>
      </div>

      {/* Enrolments */}
      <div className="mt-4 card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">Enrolments</h2>
              {enrols && (
                <span className="text-sm text-slate-400">
                  {visibleEnrols.length}{visibleEnrols.length !== enrols.length ? ` / ${enrols.length}` : ''}
                </span>
              )}
            </div>
            <button className="btn btn-sm btn-soft shrink-0" onClick={() => setShowEnrol(true)}>
              <Icon name="plus" size={15} /> Enrol in course
            </button>
          </div>
          {enrols && enrols.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-4">
              <MultiSelect label="Status" options={ENROLMENT_STATUSES} selected={eStatusSel} onChange={setEStatusSel} />
              <input className="input h-10" type="date" value={eFrom} onChange={(e) => setEFrom(e.target.value)} aria-label="Enrolled from" title="Enrolled from" />
              <input className="input h-10" type="date" value={eTo} onChange={(e) => setETo(e.target.value)} aria-label="Enrolled to" title="Enrolled to" />
              <button className="btn btn-ghost h-10" onClick={() => { setEStatusSel([]); setEFrom(''); setETo(''); }}>Clear</button>
            </div>
          )}
        </div>

        {enrols === null ? (
          <div className="p-5"><SkeletonRows rows={3} /></div>
        ) : enrols.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">No enrolments yet.</p>
        ) : visibleEnrols.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">No enrolments match these filters.</p>
        ) : (
          <>
            <table className="hidden w-full md:table">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                  <SortHeader label="Course" sortKey="course" sort={eSort} onToggle={toggleESort} />
                  <SortHeader label="Status" sortKey="status" sort={eSort} onToggle={toggleESort} />
                  <SortHeader label="Completion" sortKey="percentage_completed" sort={eSort} onToggle={toggleESort} />
                  <SortHeader label="Enrolled" sortKey="enrolled_at" sort={eSort} onToggle={toggleESort} />
                </tr>
              </thead>
              <tbody>
                {visibleEnrols.map((e) => (
                  <tr
                    key={e.id}
                    onClick={() => navigate(`/enrolment/${encodeURIComponent(e.id)}`)}
                    className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-brand-50/60"
                  >
                    <td className="px-5 py-3">
                      <div className="font-medium text-slate-800">{e.course?.course_name || e.course_id}</div>
                      <div className="font-mono text-xs text-slate-400">{e.course_id}</div>
                    </td>
                    <td className="px-5 py-3"><StatusPill status={e.status} /></td>
                    <td className="px-5 py-3 tabular-nums text-slate-600">{pct(e.percentage_completed)}</td>
                    <td className="px-5 py-3 text-slate-500">{fmtDateShort(e.enrolled_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <ul className="divide-y divide-slate-100 md:hidden">
              {visibleEnrols.map((e) => (
                <li key={e.id}>
                  <button
                    onClick={() => navigate(`/enrolment/${encodeURIComponent(e.id)}`)}
                    className="block w-full px-4 py-3.5 text-left hover:bg-brand-50/60"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate font-medium text-slate-800">{e.course?.course_name || e.course_id}</span>
                      <StatusPill status={e.status} />
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      {pct(e.percentage_completed)} · {fmtDateShort(e.enrolled_at)}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* Message history */}
      <div className="mt-4 card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-semibold">Message history</h2>
          {msgs && <span className="text-sm text-slate-400">{msgs.length}{msgs.length === 50 ? '+' : ''}</span>}
        </div>
        {msgs === null ? (
          <div className="p-5"><SkeletonRows rows={3} /></div>
        ) : msgs.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">No WhatsApp messages sent to this student yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {msgs.map((m) => (
              <li key={m.id} className="px-5 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <LogPill status={m.status} />
                    <span className="truncate text-sm text-slate-500">{schedNames[m.schedule_id] || '—'}</span>
                  </div>
                  <span className="shrink-0 text-xs text-slate-400">{fmtDate(m.sent_at)}</span>
                </div>
                <div className="mt-1 line-clamp-2 whitespace-pre-wrap break-words text-sm text-slate-700">
                  {m.message || (m.error ? `Error: ${m.error}` : '—')}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal open={showEnrol} onClose={() => setShowEnrol(false)} title="Enrol in a course">
        <EnrolCourseForm studentId={id} onClose={() => setShowEnrol(false)} onDone={loadEnrols} />
      </Modal>
    </>
  );
}
