import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { PageHeader, Field, ErrorBanner, SkeletonRows } from '../components/ui.jsx';

export default function CourseDetail() {
  const { id } = useParams();
  const [course, setCourse] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from('course').select('*').eq('course_id', id).single();
      if (error) setError(error.message);
      else setCourse(data);
    })();
  }, [id]);

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
              <img
                src={course.course_card_image_url}
                alt=""
                className="h-20 w-20 flex-shrink-0 rounded-xl object-cover ring-1 ring-slate-200"
              />
            )}
            <div className="min-w-0">
              <h2 className="text-xl font-semibold">{course.course_name}</h2>
              {course.subtitle && <p className="mt-1 text-sm text-slate-500">{course.subtitle}</p>}
            </div>
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
