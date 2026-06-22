import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { PageHeader, Field, ErrorBanner, SkeletonRows, StatusPill } from '../components/ui.jsx';
import { fmtDate, fmtDateShort, pct } from '../lib/format.js';

export default function EnrolmentDetail() {
  const { id } = useParams();
  const [rec, setRec] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from('enrolments').select('*').eq('id', id).maybeSingle();
      if (error) setError(error.message);
      else if (!data) setError('Enrolment not found.');
      else setRec(data);
    })();
  }, [id]);

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
            <Field label="Started at">{fmtDate(rec.started_at)}</Field>
            <Field label="Completed">{rec.completed ? 'Yes' : 'No'}</Field>
            <Field label="Completed at">{fmtDate(rec.completed_at)}</Field>
            <Field label="Expired">{rec.expired ? 'Yes' : 'No'}</Field>
            <Field label="Expiry date">{fmtDate(rec.expiry_date)}</Field>
            <Field label="Free trial">{rec.is_free_trial ? 'Yes' : 'No'}</Field>
            <Field label="Updated at">{fmtDate(rec.updated_at)}</Field>
          </div>
        </div>
      ) : null}
    </>
  );
}
