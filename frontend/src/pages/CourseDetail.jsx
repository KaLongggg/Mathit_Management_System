import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useToast } from '../components/Toast.jsx';
import { PageHeader, Field, ErrorBanner, SkeletonRows, Spinner } from '../components/ui.jsx';
import { COURSE_CLASSES } from '../lib/constants.js';

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
      else {
        setCourse(data);
        setKlass(data.course_class || '');
      }
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
      <PageHeader
        title="Course"
        backTo="/courses"
        backLabel="Back to courses"
        actions={<span className="pill pill-brand">Synced from Thinkific</span>}
      />

      <ErrorBanner message={error} />

      {!course && !error ? (
        <SkeletonRows rows={4} />
      ) : course ? (
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

          {/* Editable class — the one locally-owned field on a course */}
          <div className="border-b border-slate-100 bg-brand-50/40 p-5 sm:p-6">
            <label className="label" htmlFor="course-class">Class</label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <select id="course-class" className="input sm:w-64" value={klass} onChange={(e) => setKlass(e.target.value)}>
                <option value="">— Unclassified —</option>
                {COURSE_CLASSES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
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
      ) : null}
    </>
  );
}
