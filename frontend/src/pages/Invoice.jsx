import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { Icon } from '../components/icons.jsx';
import { Spinner } from '../components/ui.jsx';
import { fullName } from '../lib/format.js';

const money = (n) => new Intl.NumberFormat('en-HK', { style: 'currency', currency: 'HKD' }).format(Number(n || 0));

export default function Invoice() {
  const { id } = useParams();
  const [rec, setRec] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('enrolments')
        .select('*, student:student_id ( first_name, last_name, full_name, email, phone_number, postal_address )')
        .eq('id', id)
        .maybeSingle();
      if (error) setError(error.message);
      else if (!data) setError('Enrolment not found.');
      else setRec(data);
    })();
  }, [id]);

  if (error) {
    return (
      <div className="p-8 text-coral-700">
        {error} <Link to="/enrolments" className="underline">Back to enrolments</Link>
      </div>
    );
  }
  if (!rec) return <div className="flex min-h-dvh items-center justify-center text-brand-600"><Spinner size={24} /></div>;

  const s = rec.student || {};
  const invNo = `MIT-${rec.id}`;
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const amount = rec.paid_amount;

  return (
    <div className="min-h-dvh bg-slate-100 py-8 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-3xl items-center justify-between px-4">
        <Link to={`/enrolment/${encodeURIComponent(rec.id)}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:text-brand-800">
          <Icon name="back" size={16} /> Back to enrolment
        </Link>
        <button className="btn btn-primary" onClick={() => window.print()}>
          <Icon name="print" size={16} /> Print / Save PDF
        </button>
      </div>

      <div className="mx-auto max-w-3xl bg-white p-6 shadow-card sm:p-10 print:max-w-none print:p-0 print:shadow-none">
        <div className="flex flex-col gap-5 border-b-2 border-brand-500 pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-3">
            <img src={`${import.meta.env.BASE_URL}favicon.png`} alt="" className="h-12 w-12 rounded-xl" />
            <div>
              <div className="font-display text-xl font-semibold text-brand-700">Mathit</div>
              <div className="text-sm text-slate-500">Mathit Education Limited</div>
              <div className="text-xs text-slate-400">mathit.hk</div>
            </div>
          </div>
          <div className="sm:text-right">
            <div className="font-display text-2xl font-semibold text-slate-800">INVOICE</div>
            <div className="mt-1 text-sm text-slate-500">No. {invNo}</div>
            <div className="text-sm text-slate-500">Date: {today}</div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 sm:gap-6">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Bill to</div>
            <div className="mt-1 font-medium text-slate-800">{fullName(s) || rec.user_name || rec.student_id}</div>
            {s.email && <div className="text-sm text-slate-500">{s.email}</div>}
            {s.phone_number && <div className="text-sm text-slate-500">{s.phone_number}</div>}
            {s.postal_address && <div className="mt-1 whitespace-pre-wrap text-sm text-slate-500">{s.postal_address}</div>}
          </div>
          <div className="text-right">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Status</div>
            <div className="mt-1">
              {rec.is_paid ? <span className="pill pill-green">PAID</span> : <span className="pill pill-amber">UNPAID</span>}
            </div>
            <div className="mt-2 text-xs text-slate-400">Enrolment ref: {rec.id}</div>
          </div>
        </div>

        <table className="mt-8 w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="py-2">Description</th>
              <th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-slate-100">
              <td className="py-3">
                <div className="font-medium text-slate-800">{rec.course_name || rec.course_id}</div>
                <div className="text-xs text-slate-400">Course enrolment{rec.enrolled_at ? ` · ${rec.enrolled_at}` : ''}</div>
              </td>
              <td className="py-3 text-right tabular-nums">{money(amount)}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td className="py-3 text-right font-semibold text-slate-700">Total</td>
              <td className="py-3 text-right text-lg font-semibold tabular-nums text-brand-700">{money(amount)}</td>
            </tr>
          </tfoot>
        </table>

        <div className="mt-10 text-center text-xs text-slate-400">Thank you for learning with Mathit · mathit.hk</div>
      </div>
    </div>
  );
}
