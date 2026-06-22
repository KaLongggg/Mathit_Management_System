import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useToast } from '../components/Toast.jsx';
import { PageHeader, Field, ErrorBanner, SkeletonRows, ActivePill, Spinner } from '../components/ui.jsx';
import { Icon } from '../components/icons.jsx';
import { fmtDate } from '../lib/format.js';
import { CRON_FIELDS, parseCron, serializeCron } from '../lib/cron.js';

const STUDENT_FIELDS = [
  'student_id', 'phone_number', 'email', 'dse_year', 'dse_aim', 'current_level',
  'first_name', 'last_name', 'full_name', 'created_at', 'roles',
];

const DEFAULTS = {
  id: null, name: '', cron_expr: '* * * * *', timezone: 'Asia/Hong_Kong',
  sql_query: '', message_template: '', pdf_path: '', image_path: '', active: true, created_at: null,
};

function Placeholders() {
  return (
    <div className="mt-2">
      <div className="text-xs font-medium text-slate-500">Available placeholders (student)</div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {STUDENT_FIELDS.map((f) => (
          <span key={f} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[11px] text-slate-600">
            {`{{${f}}}`}
          </span>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-slate-400">Use like {'{{first_name}}'}. Only fields returned by your SQL are available.</p>
    </div>
  );
}

function CronBuilder({ state, onChange }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {CRON_FIELDS.map((f) => {
        const fld = state[f.key];
        return (
          <div key={f.key} className="rounded-xl border border-slate-200 p-3">
            <div className="text-sm font-medium text-slate-700">{f.label}</div>
            <select
              className="input mt-2 h-10"
              value={fld.mode}
              onChange={(e) => onChange(f.key, { mode: e.target.value })}
              aria-label={`${f.label} mode`}
            >
              <option value="any">Every</option>
              <option value="every">Every N</option>
              <option value="list">Specific</option>
            </select>
            {fld.mode === 'every' && (
              <div className="mt-2 flex items-center gap-2">
                <span className="font-mono text-sm text-slate-400">*/</span>
                <input className="input h-10" placeholder="N" inputMode="numeric" value={fld.every} onChange={(e) => onChange(f.key, { every: e.target.value })} />
              </div>
            )}
            {fld.mode === 'list' && (
              <input className="input mt-2 h-10" placeholder="e.g. 0,15,30,45" value={fld.list} onChange={(e) => onChange(f.key, { list: e.target.value })} />
            )}
            <div className="mt-1.5 text-xs text-slate-400">{f.hint}</div>
          </div>
        );
      })}
    </div>
  );
}

export default function SchedulerDetail() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const toast = useToast();

  const [model, setModel] = useState(isNew ? DEFAULTS : null);
  const [editing, setEditing] = useState(isNew);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // edit state
  const [form, setForm] = useState(DEFAULTS);
  const [cron, setCron] = useState(parseCron(DEFAULTS.cron_expr));
  const cronPreview = useMemo(() => serializeCron(cron), [cron]);

  useEffect(() => {
    if (isNew) return;
    (async () => {
      const { data, error } = await supabase.from('whatsapp_schedules').select('*').eq('id', id).single();
      if (error) setError(error.message);
      else setModel(data);
    })();
  }, [id, isNew]);

  function beginEdit(src) {
    setForm({
      name: src.name || '', timezone: src.timezone || 'Asia/Hong_Kong',
      sql_query: src.sql_query || '', message_template: src.message_template || '',
      pdf_path: src.pdf_path || '', image_path: src.image_path || '', active: !!src.active,
    });
    setCron(parseCron(src.cron_expr || '* * * * *'));
    setEditing(true);
  }

  // start editor immediately for "new"
  useEffect(() => {
    if (isNew) beginEdit(DEFAULTS);
  }, [isNew]);

  const setCronField = (key, patch) => setCron((c) => ({ ...c, [key]: { ...c[key], ...patch } }));

  async function save() {
    const payload = {
      name: form.name.trim(),
      cron_expr: serializeCron(cron),
      timezone: form.timezone.trim() || 'Asia/Hong_Kong',
      sql_query: form.sql_query.trim(),
      message_template: form.message_template.trim(),
      pdf_path: form.pdf_path.trim() || null,
      image_path: form.image_path.trim() || null,
      active: form.active,
    };
    const errs = [];
    if (!payload.name) errs.push('Name is required.');
    if (!payload.sql_query) errs.push('SQL query is required.');
    if (!payload.message_template) errs.push('Message template is required.');
    if (payload.cron_expr.trim().split(/\s+/).length !== 5) errs.push('Cron expression must have 5 fields.');
    if (!payload.timezone) errs.push('Timezone is required.');
    if (errs.length) return toast(errs[0], 'error');

    setSaving(true);
    const resp = isNew
      ? await supabase.from('whatsapp_schedules').insert(payload).select('*').single()
      : await supabase.from('whatsapp_schedules').update(payload).eq('id', id).select('*').single();
    setSaving(false);
    if (resp.error) return toast(resp.error.message, 'error');
    toast('Saved.', 'success');
    navigate(`/scheduler/${encodeURIComponent(resp.data.id)}`, { replace: true });
    setModel(resp.data);
    setEditing(false);
  }

  async function toggleActive() {
    const { error } = await supabase.from('whatsapp_schedules').update({ active: !model.active }).eq('id', model.id);
    if (error) return toast(error.message, 'error');
    toast('Updated.', 'success');
    setModel((m) => ({ ...m, active: !m.active }));
  }

  async function remove() {
    if (!confirm('Delete this schedule?')) return;
    const { error } = await supabase.from('whatsapp_schedules').delete().eq('id', model.id);
    if (error) return toast(error.message, 'error');
    toast('Deleted.', 'success');
    navigate('/scheduler');
  }

  if (error) return (<><PageHeader title="Schedule" backTo="/scheduler" /><ErrorBanner message={error} /></>);
  if (!model) return (<><PageHeader title="Schedule" backTo="/scheduler" /><SkeletonRows rows={5} /></>);

  // -------- EDIT MODE --------
  if (editing) {
    return (
      <>
        <PageHeader
          title={isNew ? 'New schedule' : 'Edit schedule'}
          backTo="/scheduler"
          backLabel="Back to scheduler"
        />
        <div className="card space-y-6 p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="s-name">Name</label>
              <input id="s-name" className="input" placeholder="Campaign name" value={form.name} onChange={(e) => setForm((x) => ({ ...x, name: e.target.value }))} />
            </div>
            <div>
              <label className="label" htmlFor="s-tz">Timezone</label>
              <input id="s-tz" className="input" placeholder="Asia/Hong_Kong" value={form.timezone} onChange={(e) => setForm((x) => ({ ...x, timezone: e.target.value }))} />
            </div>
          </div>

          <div>
            <div className="label">Cron schedule</div>
            <CronBuilder state={cron} onChange={setCronField} />
            <div className="mt-2 text-xs text-slate-500">
              Preview: <code className="font-mono text-slate-700">{cronPreview}</code>
            </div>
          </div>

          <div>
            <label className="label" htmlFor="s-sql">SQL query</label>
            <textarea id="s-sql" className="input min-h-[8rem] font-mono text-[13px]" placeholder="SELECT phone_number, first_name FROM student WHERE …" value={form.sql_query} onChange={(e) => setForm((x) => ({ ...x, sql_query: e.target.value }))} />
          </div>

          <div>
            <label className="label" htmlFor="s-msg">Message template</label>
            <textarea id="s-msg" className="input min-h-[7rem]" placeholder="Hi {{first_name}}, …" value={form.message_template} onChange={(e) => setForm((x) => ({ ...x, message_template: e.target.value }))} />
            <Placeholders />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="s-pdf">PDF file name (optional)</label>
              <input id="s-pdf" className="input" value={form.pdf_path} onChange={(e) => setForm((x) => ({ ...x, pdf_path: e.target.value }))} />
            </div>
            <div>
              <label className="label" htmlFor="s-img">Image file name (optional)</label>
              <input id="s-img" className="input" value={form.image_path} onChange={(e) => setForm((x) => ({ ...x, image_path: e.target.value }))} />
            </div>
            <label className="flex items-center gap-2.5 sm:mt-7">
              <input type="checkbox" className="h-5 w-5 rounded accent-brand-600" checked={form.active} onChange={(e) => setForm((x) => ({ ...x, active: e.target.checked }))} />
              <span className="text-sm font-medium text-slate-700">Active</span>
            </label>
          </div>

          <div className="flex gap-2 border-t border-slate-100 pt-4">
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? <Spinner /> : 'Save schedule'}
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => (isNew ? navigate('/scheduler') : setEditing(false))}
              disabled={saving}
            >
              Cancel
            </button>
          </div>
        </div>
      </>
    );
  }

  // -------- VIEW MODE --------
  const r = model;
  return (
    <>
      <PageHeader
        title={r.name}
        backTo="/scheduler"
        backLabel="Back to scheduler"
        actions={
          <>
            <ActivePill active={r.active} />
            <button className="btn btn-ghost" onClick={() => beginEdit(r)}>
              <Icon name="edit" size={16} /> Edit
            </button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5 sm:p-6">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Cron"><span className="font-mono text-[13px]">{r.cron_expr}</span></Field>
            <Field label="Timezone">{r.timezone}</Field>
            <Field label="Active">{r.active ? 'Yes' : 'No'}</Field>
            <Field label="Created">{fmtDate(r.created_at)}</Field>
            <Field label="PDF file">{r.pdf_path}</Field>
            <Field label="Image file">{r.image_path}</Field>
          </div>
          <div className="mt-5 flex gap-2 border-t border-slate-100 pt-4">
            <button className="btn btn-ghost" onClick={toggleActive}>{r.active ? 'Disable' : 'Enable'}</button>
            <button className="btn btn-danger-ghost" onClick={remove}>
              <Icon name="trash" size={16} /> Delete
            </button>
          </div>
        </div>

        <div className="card space-y-4 p-5 sm:p-6">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-slate-400">SQL query</div>
            <pre className="mt-1.5 overflow-auto rounded-xl bg-slate-900 p-3.5 font-mono text-[12.5px] leading-relaxed text-slate-100">{r.sql_query || '—'}</pre>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Message template</div>
            <pre className="mt-1.5 whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3.5 text-sm text-slate-700">{r.message_template || '—'}</pre>
            <Placeholders />
          </div>
        </div>
      </div>
    </>
  );
}
