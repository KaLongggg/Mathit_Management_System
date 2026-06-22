import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { Icon } from '../components/icons.jsx';
import { PageHeader } from '../components/ui.jsx';

async function count(table, build) {
  let q = supabase.from(table).select('*', { count: 'exact', head: true });
  if (build) q = build(q);
  const { count, error } = await q;
  return error ? 0 : count || 0;
}

const STATUS_META = [
  { key: 'active', label: 'Active', color: '#37889b' },
  { key: 'completed', label: 'Completed', color: '#10b981' },
  { key: 'expired', label: 'Expired', color: '#f59e0b' },
  { key: 'pending', label: 'Pending', color: '#94a3b8' },
];

function StatCard({ icon, label, value, sub, to }) {
  const body = (
    <div className="card h-full p-5 transition hover:shadow-soft">
      <div className="flex items-center justify-between">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-600">
          <Icon name={icon} size={20} />
        </span>
        {to && <Icon name="back" size={16} className="rotate-180 text-slate-300" />}
      </div>
      <div className="mt-4 font-display text-3xl font-semibold tabular-nums">
        {value == null ? <span className="skeleton inline-block h-8 w-16 align-middle" /> : value.toLocaleString()}
      </div>
      <div className="mt-1 text-sm text-slate-500">{label}</div>
      {sub && <div className="mt-2 text-xs font-medium text-brand-600">{sub}</div>}
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

export default function Dashboard() {
  const [s, setS] = useState({});
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
  const weekAgoDate = weekAgo.slice(0, 10);

  useEffect(() => {
    let active = true;
    (async () => {
      const [students, courses, enrolments, act, comp, exp, pend, newStu, newEnr] = await Promise.all([
        count('student'),
        count('course'),
        count('enrolments'),
        count('enrolments', (q) => q.eq('status', 'active')),
        count('enrolments', (q) => q.eq('status', 'completed')),
        count('enrolments', (q) => q.eq('status', 'expired')),
        count('enrolments', (q) => q.eq('status', 'pending')),
        count('student', (q) => q.gte('created_at', weekAgo)),
        count('enrolments', (q) => q.gte('enrolled_at', weekAgoDate)),
      ]);
      if (active) setS({ students, courses, enrolments, act, comp, exp, pend, newStu, newEnr });
    })();
    return () => {
      active = false;
    };
  }, []); // eslint-disable-line

  const counts = { active: s.act, completed: s.comp, expired: s.exp, pending: s.pend };
  const totalStatus = (s.act || 0) + (s.comp || 0) + (s.exp || 0) + (s.pend || 0);

  return (
    <>
      <PageHeader title="Dashboard" subtitle="A live snapshot of your academy." />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon="students"
          label="Students"
          value={s.students}
          sub={s.newStu != null ? `+${s.newStu} this week` : null}
          to="/students"
        />
        <StatCard icon="courses" label="Courses" value={s.courses} to="/courses" />
        <StatCard
          icon="enrolments"
          label="Enrolments"
          value={s.enrolments}
          sub={s.newEnr != null ? `+${s.newEnr} this week` : null}
          to="/enrolments"
        />
        <StatCard icon="check" label="Active enrolments" value={s.act} to="/enrolments" />
      </div>

      <div className="mt-4 card p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Enrolment status</h2>
          <Link to="/enrolments" className="text-sm font-medium text-brand-700 hover:text-brand-800">
            View all
          </Link>
        </div>

        <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
          {totalStatus > 0 &&
            STATUS_META.map((m) => {
              const v = counts[m.key] || 0;
              const w = (v / totalStatus) * 100;
              return w > 0 ? (
                <div key={m.key} style={{ width: `${w}%`, background: m.color }} title={`${m.label}: ${v}`} />
              ) : null;
            })}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {STATUS_META.map((m) => (
            <div key={m.key} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: m.color }} />
              <span className="text-sm text-slate-600">{m.label}</span>
              <span className="ml-auto font-semibold tabular-nums">
                {counts[m.key] == null ? '–' : counts[m.key].toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
