import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useToast } from '../components/Toast.jsx';
import { PageHeader, EmptyState, ErrorBanner, SkeletonRows, ActivePill } from '../components/ui.jsx';
import { BotStatusBanner } from '../components/BotStatus.jsx';
import { Icon } from '../components/icons.jsx';
import { fmtDate } from '../lib/format.js';

export default function Scheduler() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const navigate = useNavigate();
  const toast = useToast();

  async function load() {
    setRows(null);
    setError('');
    const { data, error } = await supabase
      .from('whatsapp_schedules')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      setError(error.message);
      setRows([]);
      return;
    }
    setRows(data || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function toggle(e, r) {
    e.preventDefault();
    e.stopPropagation();
    setBusyId(r.id);
    const { error } = await supabase.from('whatsapp_schedules').update({ active: !r.active }).eq('id', r.id);
    setBusyId(null);
    if (error) return toast(error.message, 'error');
    toast('Updated.', 'success');
    load();
  }

  return (
    <>
      <PageHeader
        title="WhatsApp Scheduler"
        subtitle="Automated message campaigns."
        actions={
          <>
            <button className="btn btn-ghost" onClick={load}>
              <Icon name="refresh" size={16} /> Refresh
            </button>
            <button className="btn btn-primary" onClick={() => navigate('/scheduler/new')}>
              <Icon name="plus" size={16} /> New schedule
            </button>
          </>
        }
      />

      <BotStatusBanner />

      <ErrorBanner message={error} />

      {rows === null ? (
        <SkeletonRows />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="scheduler"
          title="No schedules yet"
          hint="Create your first automated WhatsApp campaign."
          action={
            <button className="btn btn-primary" onClick={() => navigate('/scheduler/new')}>
              <Icon name="plus" size={16} /> New schedule
            </button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((r) => (
            <Link
              key={r.id}
              to={`/scheduler/${encodeURIComponent(r.id)}`}
              className="card block p-5 transition hover:-translate-y-0.5 hover:shadow-soft"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-lg font-semibold">{r.name}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-500">
                    <Icon name="clock" size={15} className="text-slate-400" />
                    <span className="font-mono text-[13px]">{r.cron_expr}</span>
                    <span className="text-slate-300">·</span>
                    <span>{r.timezone}</span>
                  </div>
                </div>
                <ActivePill active={r.active} />
              </div>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-xs text-slate-400">Created {fmtDate(r.created_at)}</span>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={(e) => toggle(e, r)}
                  disabled={busyId === r.id}
                >
                  {r.active ? 'Disable' : 'Enable'}
                </button>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
