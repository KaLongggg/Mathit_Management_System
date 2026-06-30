import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useToast } from '../components/Toast.jsx';
import { PageHeader, Field, ErrorBanner, SkeletonRows, StatusPill, Spinner } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';
import { fmtDate, fmtDateShort, pct } from '../lib/format.js';
import { DELIVERY_MODES, thinkificAdminUserUrl, thinkificAdminCourseUrl, thinkificPublicCourseUrl } from '../lib/constants.js';
import { useConfig } from '../lib/config.js';

export default function EnrolmentDetail() {
  const { id } = useParams();
  const toast = useToast();
  const [rec, setRec] = useState(null);
  const [error, setError] = useState('');
  const cfg = useConfig();
  const deliveryOptions = cfg.delivery_mode_options || DELIVERY_MODES;
  const [form, setForm] = useState({ delivery_mode: '', notes: '', paid_amount: '', is_paid: false });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('enrolments')
        .select('*, student:student_id ( phone_number, postal_address ), course:course_id ( slug )')
        .eq('id', id)
        .maybeSingle();
      if (error) setError(error.message);
      else if (!data) setError('Enrolment not found.');
      else {
        setRec(data);
        setForm({
          delivery_mode: data.delivery_mode || '',
          notes: data.notes || '',
          paid_amount: data.paid_amount ?? '',
          is_paid: !!data.is_paid,
        });
      }
    })();
  }, [id]);

  async function save() {
    setSaving(true);
    const payload = {
      delivery_mode: form.delivery_mode || null,
      notes: form.notes.trim() || null,
      paid_amount: form.paid_amount === '' ? null : Number(form.paid_amount),
      is_paid: form.is_paid,
    };
    const { error } = await supabase.from('enrolments').update(payload).eq('id', id);
    setSaving(false);
    if (error) return toast(error.message, 'error');
    setRec((r) => ({ ...r, ...payload }));
    toast('Saved.', 'success');
  }

  return (
    <>
      <PageHeader
        title={`Enrolment ${id}`}
        backTo="/enrolments"
        backLabel="Back to enrolments"
        actions={<span className="pill pill-brand">Synced from Thinkific</span>}
      />

      <ErrorBanner message={error} />

      {!rec && !error ? (
        <SkeletonRows rows={5} />
      ) : rec ? (
        <>
          <div className="card p-5 sm:p-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Student">{rec.user_name}</Field>
              <Field label="Student ID"><span className="font-mono text-[13px]">{rec.student_id}</span></Field>
              <Field label="Email">{rec.user_email}</Field>
              <Field label="Course">{rec.course_name}</Field>
              <Field label="Course ID"><span className="font-mono text-[13px]">{rec.course_id}</span></Field>
              <Field label="Status"><StatusPill status={rec.status} /></Field>
              <Field label="Completion"><span className="tabular-nums">{pct(rec.percentage_completed)}</span></Field>
              <Field label="Enrolled at">{fmtDateShort(rec.enrolled_at)}</Field>
              <Field label="Activated at">{fmtDate(rec.activated_at)}</Field>
              <Field label="Completed">{rec.completed ? 'Yes' : 'No'}</Field>
              <Field label="Completed at">{fmtDate(rec.completed_at)}</Field>
              <Field label="Expired">{rec.expired ? 'Yes' : 'No'}</Field>
              <Field label="Expiry date">{fmtDate(rec.expiry_date)}</Field>
              <Field label="Free trial">{rec.is_free_trial ? 'Yes' : 'No'}</Field>
            </div>
            <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              <a href={thinkificAdminUserUrl(rec.student_id)} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-ghost">
                <Icon name="external" size={14} /> Student on Thinkific
              </a>
              {rec.course?.slug && (
                <a href={thinkificPublicCourseUrl(rec.course.slug)} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-ghost">
                  <Icon name="external" size={14} /> Course page
                </a>
              )}
              <a href={thinkificAdminCourseUrl(rec.course_id)} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-ghost">
                <Icon name="external" size={14} /> Edit course on Thinkific
              </a>
            </div>
          </div>

          {/* Local admin fields — managed in the app, not synced from Thinkific */}
          <div className="mt-4 card p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-2">
              <h2 className="text-lg font-semibold">Admin</h2>
              <span className="pill pill-slate">Local</span>
            </div>

            {/* Student contact (read-only here — edit on the student page) */}
            <div className="mb-4 grid gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
              <Field label="WhatsApp / Phone">{rec.student?.phone_number}</Field>
              <Field label="Shipping address" full>
                {rec.student?.postal_address ? <span className="whitespace-pre-wrap">{rec.student.postal_address}</span> : null}
              </Field>
              <div className="sm:col-span-2">
                <Link to={`/student/${encodeURIComponent(rec.student_id)}`} className="text-xs font-medium text-brand-700 hover:text-brand-800">
                  Edit contact on student page →
                </Link>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="delivery_mode">Delivery mode</label>
                <select id="delivery_mode" className="input" value={form.delivery_mode} onChange={(e) => setForm((x) => ({ ...x, delivery_mode: e.target.value }))}>
                  <option value="">—</option>
                  {deliveryOptions.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="flex flex-col">
                <label className="label" htmlFor="paid_amount">Paid amount (HKD)</label>
                <div className="flex items-center gap-4">
                  <input id="paid_amount" type="number" step="0.01" className="input" value={form.paid_amount} onChange={(e) => setForm((x) => ({ ...x, paid_amount: e.target.value }))} />
                  <label className="flex shrink-0 items-center gap-2 text-sm font-medium text-slate-700">
                    <input type="checkbox" className="h-5 w-5 rounded accent-brand-600" checked={form.is_paid} onChange={(e) => setForm((x) => ({ ...x, is_paid: e.target.checked }))} />
                    Paid
                  </label>
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="notes">Notes</label>
                <textarea id="notes" className="input" rows={4} placeholder="Internal notes…" value={form.notes} onChange={(e) => setForm((x) => ({ ...x, notes: e.target.value }))} />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? <Spinner /> : 'Save'}</button>
              <Link to={`/invoice/${encodeURIComponent(id)}`} className="btn btn-ghost">
                <Icon name="file" size={16} /> Invoice
              </Link>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
