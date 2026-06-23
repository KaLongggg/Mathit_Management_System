import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useToast } from '../components/Toast.jsx';
import { PageHeader, EmptyState, ErrorBanner, SkeletonRows, Spinner } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';
import { fullName } from '../lib/format.js';

const money = (n) => (n == null ? '-' : new Intl.NumberFormat('en-HK', { style: 'currency', currency: 'HKD' }).format(Number(n)));

export default function Shipping() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const navigate = useNavigate();
  const toast = useToast();

  async function load() {
    setRows(null);
    setError('');
    const { data, error } = await supabase
      .from('enrolments')
      .select('id, student_id, course_name, paid_amount, enrolled_at, student:student_id!inner ( first_name, last_name, phone_number, postal_address )')
      .eq('is_paid', true)
      .not('note_delivered', 'is', true)
      .not('student.postal_address', 'is', null)
      .order('enrolled_at', { ascending: true })
      .limit(500);
    if (error) { setError(error.message); setRows([]); return; }
    setRows((data || []).filter((r) => (r.student?.postal_address || '').trim()));
  }

  useEffect(() => { load(); }, []);

  async function markShipped(r) {
    setBusyId(r.id);
    const { error } = await supabase.from('enrolments').update({ note_delivered: true, note_delivered_at: new Date().toISOString() }).eq('id', r.id);
    setBusyId(null);
    if (error) return toast(error.message, 'error');
    setRows((rs) => rs.filter((x) => x.id !== r.id));
    toast('Marked shipped.', 'success');
  }

  return (
    <>
      <PageHeader
        title="Shipping worklist"
        subtitle="Paid enrolments with a shipping address, notes not yet sent."
        actions={
          <button className="btn btn-ghost no-print" onClick={() => window.print()}>
            <Icon name="print" size={16} /> Print
          </button>
        }
      />
      <ErrorBanner message={error} />

      {rows === null ? (
        <SkeletonRows />
      ) : rows.length === 0 ? (
        <EmptyState icon="truck" title="Nothing to ship" hint="Paid students with an address and undelivered notes will appear here." />
      ) : (
        <>
          <div className="mb-2 text-sm text-slate-400">{rows.length} to ship</div>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3 font-medium">Student</th>
                  <th className="px-5 py-3 font-medium">Shipping address</th>
                  <th className="px-5 py-3 font-medium">Course</th>
                  <th className="px-5 py-3 font-medium">Paid</th>
                  <th className="px-5 py-3 font-medium no-print"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 align-top last:border-0">
                    <td className="px-5 py-3">
                      <button className="font-medium text-slate-800 hover:underline" onClick={() => navigate(`/student/${encodeURIComponent(r.student_id)}`)}>
                        {fullName(r.student) || r.student_id}
                      </button>
                      <div className="text-xs text-slate-400">{r.student?.phone_number || ''}</div>
                    </td>
                    <td className="px-5 py-3 whitespace-pre-wrap text-slate-600">{r.student?.postal_address}</td>
                    <td className="px-5 py-3 text-slate-600">{r.course_name}</td>
                    <td className="px-5 py-3 tabular-nums text-slate-600">{money(r.paid_amount)}</td>
                    <td className="px-5 py-3 no-print">
                      <button className="btn btn-sm btn-primary" disabled={busyId === r.id} onClick={() => markShipped(r)}>
                        {busyId === r.id ? <Spinner size={14} /> : 'Mark shipped'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
