import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { PageHeader, EmptyState, ErrorBanner, SkeletonRows } from '../components/ui.jsx';
import { fullName } from '../lib/format.js';

const esc = (s) => s.replace(/[,()]/g, '\\$&');

export default function Students() {
  const [f, setF] = useState({ first: '', last: '', email: '', phone: '' });
  const [rows, setRows] = useState(undefined); // undefined=idle, null=loading, []=empty
  const [error, setError] = useState('');

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function search() {
    const { first, last, email, phone } = f;
    if (!first.trim() && !last.trim() && !email.trim() && !phone.trim()) {
      setRows(undefined);
      setError('Enter at least one field to search.');
      return;
    }
    setError('');
    setRows(null);
    const ors = [];
    if (first.trim()) ors.push(`first_name.ilike.%${esc(first.trim())}%`);
    if (last.trim()) ors.push(`last_name.ilike.%${esc(last.trim())}%`);
    if (email.trim()) ors.push(`email.ilike.%${esc(email.trim())}%`);
    if (phone.trim()) ors.push(`phone_number.ilike.%${esc(phone.trim())}%`);

    const { data, error } = await supabase
      .from('student')
      .select('*')
      .or(ors.join(','))
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) {
      setError(error.message);
      setRows([]);
      return;
    }
    setRows(data || []);
  }

  function clear() {
    setF({ first: '', last: '', email: '', phone: '' });
    setRows(undefined);
    setError('');
  }

  return (
    <>
      <PageHeader title="Find a student" subtitle="Search by any combination of fields." />

      <div className="card p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input className="input" placeholder="First name" value={f.first} onChange={set('first')} onKeyDown={(e) => e.key === 'Enter' && search()} />
          <input className="input" placeholder="Last name" value={f.last} onChange={set('last')} onKeyDown={(e) => e.key === 'Enter' && search()} />
          <input className="input" placeholder="Email" value={f.email} onChange={set('email')} onKeyDown={(e) => e.key === 'Enter' && search()} />
          <input className="input" placeholder="WhatsApp / Phone" value={f.phone} onChange={set('phone')} onKeyDown={(e) => e.key === 'Enter' && search()} />
        </div>
        <div className="mt-3 flex gap-2">
          <button className="btn btn-primary" onClick={search}>Search</button>
          <button className="btn btn-ghost" onClick={clear}>Clear</button>
        </div>
      </div>

      <div className="mt-4">
        <ErrorBanner message={error} />
        {rows === null ? (
          <SkeletonRows />
        ) : rows === undefined ? null : rows.length === 0 ? (
          <EmptyState icon="students" title="No matching students" hint="Try fewer or different terms." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {rows.map((s) => (
              <Link
                key={s.student_id}
                to={`/student/${encodeURIComponent(s.student_id)}`}
                className="card block p-5 transition hover:-translate-y-0.5 hover:shadow-soft"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-lg font-semibold">{fullName(s) || s.student_id}</div>
                    <div className="truncate text-sm text-slate-500">{s.email || '—'}</div>
                  </div>
                  {s.dse_year && <span className="pill pill-brand shrink-0">DSE {s.dse_year}</span>}
                </div>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-500">
                  <span><span className="text-slate-400">ID:</span> {s.student_id}</span>
                  <span><span className="text-slate-400">WhatsApp:</span> {s.phone_number || '-'}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
