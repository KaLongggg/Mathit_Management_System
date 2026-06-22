import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, AreaChart, Area,
} from 'recharts';
import { supabase } from '../lib/supabase.js';
import { Icon } from '../components/icons.jsx';
import { PageHeader } from '../components/ui.jsx';
import {
  COURSE_CLASSES, COURSE_CLASS_COLORS, ENROLMENT_STATUSES, ENROLMENT_STATUS_COLORS,
} from '../lib/constants.js';

const CLASS_ORDER = [...COURSE_CLASSES, 'Unclassified'];
const fmtMonth = (m) => new Date(m).toLocaleDateString('en', { month: 'short', year: '2-digit' });

async function count(table, build) {
  let q = supabase.from(table).select('*', { count: 'exact', head: true });
  if (build) q = build(q);
  const { count, error } = await q;
  return error ? 0 : count || 0;
}

function StatCard({ icon, label, value, sub, to }) {
  const body = (
    <div className="card h-full p-5 transition hover:shadow-soft">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-600">
        <Icon name={icon} size={20} />
      </span>
      <div className="mt-4 font-display text-3xl font-semibold tabular-nums">
        {value == null ? <span className="skeleton inline-block h-8 w-16 align-middle" /> : value.toLocaleString()}
      </div>
      <div className="mt-1 text-sm text-slate-500">{label}</div>
      {sub && <div className="mt-2 text-xs font-medium text-brand-600">{sub}</div>}
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

function ChartCard({ title, subtitle, children }) {
  return (
    <div className="card p-5">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

const tooltipStyle = {
  borderRadius: 12,
  border: '1px solid #e2e8f0',
  boxShadow: '0 10px 30px rgba(33,71,82,.12)',
  fontSize: 13,
};

export default function Dashboard() {
  const [s, setS] = useState({});
  const [bar, setBar] = useState(null); // { data, classes }
  const [classMix, setClassMix] = useState([]);
  const [studentsMonth, setStudentsMonth] = useState([]);
  const [topCourses, setTopCourses] = useState([]);

  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
  const weekAgoDate = weekAgo.slice(0, 10);

  useEffect(() => {
    let active = true;
    (async () => {
      const [students, courses, enrolments, act, comp, exp, pend, newStu, emc, sbm, tc] = await Promise.all([
        count('student'),
        count('course'),
        count('enrolments'),
        count('enrolments', (q) => q.eq('status', 'active')),
        count('enrolments', (q) => q.eq('status', 'completed')),
        count('enrolments', (q) => q.eq('status', 'expired')),
        count('enrolments', (q) => q.eq('status', 'pending')),
        count('student', (q) => q.gte('created_at', weekAgo)),
        supabase.rpc('enrolments_by_month_class'),
        supabase.rpc('students_by_month'),
        supabase.rpc('top_courses', { p_limit: 8 }),
      ]);
      if (!active) return;

      setS({ students, courses, enrolments, act, comp, exp, pend, newStu });

      // ---- enrolments by month, stacked by class ----
      const emcRows = emc.data || [];
      const totals = {};
      emcRows.forEach((d) => { totals[d.course_class] = (totals[d.course_class] || 0) + Number(d.n); });
      setClassMix(
        CLASS_ORDER.filter((c) => totals[c]).map((c) => ({
          name: c, value: totals[c], color: COURSE_CLASS_COLORS[c] || '#cbd5e1',
        })),
      );

      const monthsAll = [...new Set(emcRows.map((d) => d.month))].sort();
      const last = monthsAll.slice(-14);
      const lastSet = new Set(last);
      const pivot = Object.fromEntries(last.map((m) => [m, { month: m }]));
      emcRows.forEach((d) => { if (lastSet.has(d.month)) pivot[d.month][d.course_class] = Number(d.n); });
      const classes = CLASS_ORDER.filter((c) => emcRows.some((d) => lastSet.has(d.month) && d.course_class === c));
      setBar({ data: last.map((m) => pivot[m]), classes });

      // ---- new students by month (last 18) ----
      setStudentsMonth((sbm.data || []).slice(-18).map((d) => ({ month: d.month, n: Number(d.n) })));

      // ---- top courses ----
      setTopCourses(
        (tc.data || []).map((d) => ({
          name: (d.course_name || d.course_id || '').slice(0, 28),
          n: Number(d.n),
          color: COURSE_CLASS_COLORS[d.course_class] || '#37889b',
        })),
      );
    })();
    return () => { active = false; };
  }, []); // eslint-disable-line

  const statusData = ENROLMENT_STATUSES
    .map((k) => ({ name: k, value: { active: s.act, completed: s.comp, expired: s.exp, pending: s.pend }[k] || 0 }))
    .filter((d) => d.value > 0);

  return (
    <>
      <PageHeader title="Dashboard" subtitle="A live snapshot of your academy." />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon="students" label="Students" value={s.students} sub={s.newStu != null ? `+${s.newStu} this week` : null} to="/students" />
        <StatCard icon="courses" label="Courses" value={s.courses} to="/courses" />
        <StatCard icon="enrolments" label="Enrolments" value={s.enrolments} to="/enrolments" />
        <StatCard icon="check" label="Active enrolments" value={s.act} to="/enrolments" />
      </div>

      {/* Enrolments by month, stacked by class */}
      <div className="mt-4">
        <ChartCard title="Enrolments by month" subtitle="Stacked by course class · last 14 months">
          {!bar ? (
            <div className="skeleton h-[320px] w-full rounded-xl" />
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={bar.data} margin={{ left: -16, right: 8, top: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f6" />
                <XAxis dataKey="month" tickFormatter={fmtMonth} tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
                <YAxis tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={fmtMonth} />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                {bar.classes.map((c) => (
                  <Bar key={c} dataKey={c} stackId="a" fill={COURSE_CLASS_COLORS[c] || '#cbd5e1'} radius={[0, 0, 0, 0]} maxBarSize={48} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* Top courses */}
        <ChartCard title="Top courses" subtitle="By total enrolments">
          {topCourses.length === 0 ? (
            <div className="skeleton h-[300px] w-full rounded-xl" />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={topCourses} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eef2f6" />
                <XAxis type="number" tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11, fill: '#475569' }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#f1f5f9' }} />
                <Bar dataKey="n" radius={[0, 6, 6, 0]} maxBarSize={22}>
                  {topCourses.map((c, i) => <Cell key={i} fill={c.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Class mix donut */}
        <ChartCard title="Enrolment mix" subtitle="Share by course class (all-time)">
          {classMix.length === 0 ? (
            <div className="skeleton h-[300px] w-full rounded-xl" />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={classMix} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={2}>
                  {classMix.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* New students by month */}
        <ChartCard title="New students" subtitle="Sign-ups per month · last 18 months">
          {studentsMonth.length === 0 ? (
            <div className="skeleton h-[280px] w-full rounded-xl" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={studentsMonth} margin={{ left: -16, right: 8, top: 4 }}>
                <defs>
                  <linearGradient id="g-students" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#37889b" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#37889b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f6" />
                <XAxis dataKey="month" tickFormatter={fmtMonth} tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
                <YAxis tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={fmtMonth} />
                <Area type="monotone" dataKey="n" name="New students" stroke="#37889b" strokeWidth={2} fill="url(#g-students)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Enrolment status donut */}
        <ChartCard title="Enrolment status" subtitle="Current breakdown">
          {statusData.length === 0 ? (
            <div className="skeleton h-[280px] w-full rounded-xl" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}>
                  {statusData.map((d, i) => <Cell key={i} fill={ENROLMENT_STATUS_COLORS[d.name]} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12, textTransform: 'capitalize' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </>
  );
}
