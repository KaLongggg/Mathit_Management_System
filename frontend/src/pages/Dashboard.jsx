import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, AreaChart, Area,
} from 'recharts';
import { supabase } from '../lib/supabase.js';
import { gaReport } from '../lib/api.js';
import { Icon } from '../components/icons.jsx';
import { PageHeader, ErrorBanner } from '../components/ui.jsx';
import { BotStatusTile } from '../components/BotStatus.jsx';
import {
  COURSE_CLASSES, COURSE_CLASS_COLORS, ENROLMENT_STATUSES, ENROLMENT_STATUS_COLORS,
} from '../lib/constants.js';

const CLASS_ORDER = [...COURSE_CLASSES, 'Unclassified'];
const fmtMonth = (m) => new Date(m).toLocaleDateString('en', { month: 'short', year: '2-digit' });
// GA returns dates as YYYYMMDD
const fmtGADate = (d) => `${d.slice(4, 6)}/${d.slice(6, 8)}`;
const fmtDay = (d) => new Date(d).toLocaleDateString('en', { month: 'short', day: 'numeric' });
const COMPLETION_COLORS = { '0%': '#94a3b8', '1-49%': '#f59e0b', '50-99%': '#37889b', '100%': '#10b981', Unknown: '#cbd5e1' };

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
  const [dseBars, setDseBars] = useState(null);
  const [completion, setCompletion] = useState(null);
  const [waHealth, setWaHealth] = useState(null);
  const [ga, setGa] = useState({ loading: true });

  useEffect(() => {
    let active = true;
    gaReport()
      .then((d) => active && setGa({ loading: false, ...d }))
      .catch((e) => active && setGa({ loading: false, configured: true, error: e.message }));
    return () => { active = false; };
  }, []);

  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
  const weekAgoDate = weekAgo.slice(0, 10);

  useEffect(() => {
    let active = true;
    (async () => {
      const [students, courses, enrolments, act, comp, exp, pend, newStu, newEnr, emc, sbm, tc, dseR, compR, waR] = await Promise.all([
        count('student'),
        count('course'),
        count('enrolments'),
        count('enrolments', (q) => q.eq('status', 'active')),
        count('enrolments', (q) => q.eq('status', 'completed')),
        count('enrolments', (q) => q.eq('status', 'expired')),
        count('enrolments', (q) => q.eq('status', 'pending')),
        count('student', (q) => q.gte('created_at', weekAgo)),
        count('enrolments', (q) => q.gte('enrolled_at', weekAgoDate)),
        supabase.rpc('enrolments_by_month_class'),
        supabase.rpc('students_by_month'),
        supabase.rpc('top_courses', { p_limit: 8 }),
        supabase.rpc('students_by_dse', { p_limit: 12 }),
        supabase.rpc('enrolment_completion_buckets'),
        supabase.rpc('wa_logs_by_day'),
      ]);
      if (!active) return;

      // students by DSE year
      setDseBars((dseR.data || []).map((d) => ({ name: d.dse_year, n: Number(d.n) })));

      // completion distribution (fixed order)
      const compMap = Object.fromEntries((compR.data || []).map((d) => [d.bucket, Number(d.n)]));
      setCompletion(['0%', '1-49%', '50-99%', '100%', 'Unknown'].filter((b) => compMap[b]).map((b) => ({ name: b, n: compMap[b] })));

      // whatsapp send health (pivot day -> sent/failed/dry_run)
      const waRows = waR.data || [];
      const days = [...new Set(waRows.map((r) => r.day))].sort();
      const waPivot = Object.fromEntries(days.map((d) => [d, { day: d, sent: 0, failed: 0, dry_run: 0 }]));
      waRows.forEach((r) => { if (waPivot[r.day]) waPivot[r.day][r.status] = Number(r.n); });
      setWaHealth(days.map((d) => waPivot[d]));

      setS({ students, courses, enrolments, act, comp, exp, pend, newStu, newEnr });

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

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        <StatCard icon="students" label="Students" value={s.students} sub={s.newStu != null ? `+${s.newStu} this week` : null} to="/students" />
        <StatCard icon="courses" label="Courses" value={s.courses} to="/courses" />
        <StatCard icon="enrolments" label="Enrolments" value={s.enrolments} sub={s.newEnr != null ? `+${s.newEnr} this week` : null} to="/enrolments" />
        <StatCard icon="check" label="Active enrolments" value={s.act} to="/enrolments" />
        <BotStatusTile />
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

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* Students by DSE year */}
        <ChartCard title="Students by DSE year" subtitle="Top cohorts">
          {!dseBars ? (
            <div className="skeleton h-[280px] w-full rounded-xl" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={dseBars} margin={{ left: -16, right: 8, top: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f6" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} interval={0} angle={-30} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="n" name="Students" fill="#37889b" radius={[6, 6, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Completion distribution */}
        <ChartCard title="Completion" subtitle="Enrolment progress distribution">
          {!completion ? (
            <div className="skeleton h-[280px] w-full rounded-xl" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={completion} margin={{ left: -16, right: 8, top: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f6" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
                <YAxis tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#f1f5f9' }} />
                <Bar dataKey="n" name="Enrolments" radius={[6, 6, 0, 0]} maxBarSize={56}>
                  {completion.map((d, i) => <Cell key={i} fill={COMPLETION_COLORS[d.name] || '#37889b'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* WhatsApp send health */}
      <div className="mt-4">
        <ChartCard title="WhatsApp send health" subtitle="Sent vs failed · last 30 days">
          {!waHealth ? (
            <div className="skeleton h-[280px] w-full rounded-xl" />
          ) : waHealth.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-400">No sends in the last 30 days.</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={waHealth} margin={{ left: -16, right: 8, top: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f6" />
                <XAxis dataKey="day" tickFormatter={fmtDay} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} minTickGap={20} />
                <YAxis tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={fmtDay} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="sent" stackId="w" name="Sent" fill="#10b981" maxBarSize={28} />
                <Bar dataKey="failed" stackId="w" name="Failed" fill="#ff5c5c" maxBarSize={28} />
                <Bar dataKey="dry_run" stackId="w" name="Dry run" fill="#94a3b8" maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Website analytics (Google Analytics) */}
      <div className="mt-8">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="font-display text-lg font-semibold">Website · mathit.hk</h2>
          <span className="pill pill-slate">Google Analytics · 30 days</span>
        </div>

        {ga.loading ? (
          <div className="skeleton h-48 w-full rounded-2xl" />
        ) : !ga.configured ? (
          <div className="card p-6">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-600">
                <Icon name="trending" size={20} />
              </span>
              <div>
                <p className="font-medium text-slate-700">Connect Google Analytics</p>
                <p className="mt-1 text-sm text-slate-500">
                  Set <code className="font-mono text-xs">GA_PROPERTY_ID</code> and{' '}
                  <code className="font-mono text-xs">GA_SERVICE_ACCOUNT</code> as secrets on the{' '}
                  <span className="font-medium">ga-report</span> function, and grant that service account Viewer
                  access to the GA4 property. Then refresh.
                </p>
              </div>
            </div>
          </div>
        ) : ga.error ? (
          <div className="card p-6"><ErrorBanner message={`Google Analytics: ${ga.error}`} /></div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 sm:max-w-md">
              <StatCard icon="trending" label="Sessions (30d)" value={ga.totals?.sessions} />
              <StatCard icon="users" label="Active users (30d)" value={ga.totals?.users} />
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <ChartCard title="Traffic" subtitle="Sessions & users · last 30 days">
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={ga.traffic} margin={{ left: -16, right: 8, top: 4 }}>
                    <defs>
                      <linearGradient id="g-sess" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#37889b" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#37889b" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="g-usr" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f6" />
                    <XAxis dataKey="date" tickFormatter={fmtGADate} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} minTickGap={24} />
                    <YAxis tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} labelFormatter={fmtGADate} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area type="monotone" dataKey="sessions" name="Sessions" stroke="#37889b" strokeWidth={2} fill="url(#g-sess)" />
                    <Area type="monotone" dataKey="users" name="Users" stroke="#8b5cf6" strokeWidth={2} fill="url(#g-usr)" />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Top pages" subtitle="Most-viewed · last 30 days">
                {!ga.topPages || ga.topPages.length === 0 ? (
                  <p className="py-12 text-center text-sm text-slate-400">No page data.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart
                      data={ga.topPages.map((p) => ({ name: p.path.length > 26 ? p.path.slice(0, 26) + '…' : p.path, views: p.views }))}
                      layout="vertical"
                      margin={{ left: 8, right: 16 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eef2f6" />
                      <XAxis type="number" tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} allowDecimals={false} />
                      <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11, fill: '#475569' }} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#f1f5f9' }} />
                      <Bar dataKey="views" fill="#37889b" radius={[0, 6, 6, 0]} maxBarSize={22} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
            </div>
          </>
        )}
      </div>
    </>
  );
}
