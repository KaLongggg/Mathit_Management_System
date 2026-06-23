import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useToast } from '../components/Toast.jsx';
import { PageHeader, Field, ErrorBanner, SkeletonRows, ActivePill, Spinner } from '../components/ui.jsx';
import { MultiSelect } from '../components/MultiSelect.jsx';
import { Icon } from '../components/icons.jsx';
import { fmtDate } from '../lib/format.js';
import { downloadCsv } from '../lib/csv.js';
import { CRON_FIELDS, parseCron, serializeCron } from '../lib/cron.js';
import { buildAudienceSql, audienceFields, AUDIENCE_DEFAULT } from '../lib/audience.js';
import { ENROLMENT_STATUSES } from '../lib/constants.js';

const SOURCES = [
  { key: 'course', label: 'Course students' },
  { key: 'students', label: 'Students' },
  { key: 'leads', label: 'Marketing leads' },
  { key: 'manual', label: 'Manual list' },
  { key: 'advanced', label: 'Advanced (SQL)' },
];

const DEFAULTS = {
  name: '', cron_expr: '0 10 * * *', timezone: 'Asia/Hong_Kong',
  message_template: '', pdf_path: '', image_path: '', active: false,
};

const recipientName = (r) => r.full_name || [r.first_name, r.last_name].filter(Boolean).join(' ') || '—';

// Runs the read-only preview RPC whenever the query changes (debounced).
function useRecipients(sql, debounceMs = 400) {
  const [state, setState] = useState({ rows: null, loading: false, error: '' });
  useEffect(() => {
    const q = (sql || '').trim();
    if (!q) { setState({ rows: [], loading: false, error: '' }); return; }
    let active = true;
    setState((s) => ({ ...s, loading: true, error: '' }));
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc('preview_recipients', { p_sql: q });
      if (!active) return;
      if (error) setState({ rows: null, loading: false, error: error.message });
      else setState({ rows: data || [], loading: false, error: '' });
    }, debounceMs);
    return () => { active = false; clearTimeout(t); };
  }, [sql, debounceMs]);
  return state;
}

function RecipientsTable({ rows }) {
  const noPhone = rows.filter((r) => !r.phone_number).length;
  return (
    <>
      {noPhone > 0 && <div className="mb-2 text-xs text-amber-600">{noPhone} row(s) have no phone number and will be skipped when sending.</div>}
      <div className="max-h-72 overflow-auto rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Phone</th>
              <th className="px-3 py-2 font-medium">DSE</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-1.5">{recipientName(r)}</td>
                <td className="px-3 py-1.5 font-mono text-[13px]">{r.phone_number || <span className="text-amber-600">missing</span>}</td>
                <td className="px-3 py-1.5 text-slate-500">{r.dse_year ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function RecipientsPreview({ sql, debounce = 400, downloadName }) {
  const { rows, loading, error } = useRecipients(sql, debounce);
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
          Recipients{rows ? `: ${rows.length}${rows.length === 500 ? '+' : ''}` : ''}
          {loading && <Spinner size={14} />}
        </div>
        {rows && rows.length > 0 && downloadName && (
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => downloadCsv(downloadName, [{ label: 'Name', get: recipientName }, { label: 'Phone', key: 'phone_number' }, { label: 'DSE Year', key: 'dse_year' }], rows)}
          >
            <Icon name="download" size={14} /> CSV
          </button>
        )}
      </div>
      {error ? (
        <div className="mt-2"><ErrorBanner message={error} /></div>
      ) : rows === null || (loading && !rows) ? (
        <div className="skeleton mt-2 h-24 w-full rounded-xl" />
      ) : rows.length === 0 ? (
        <p className="mt-2 text-sm text-slate-400">No recipients match yet.</p>
      ) : (
        <div className="mt-2"><RecipientsTable rows={rows} /></div>
      )}
    </div>
  );
}

function Placeholders({ fields }) {
  if (!fields || !fields.length) {
    return <p className="mt-2 text-xs text-slate-400">Placeholders depend on the columns your query returns, e.g. {'{{first_name}}'}.</p>;
  }
  return (
    <div className="mt-2">
      <div className="text-xs font-medium text-slate-500">Available placeholders</div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {fields.map((f) => (
          <span key={f} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[11px] text-slate-600">{`{{${f}}}`}</span>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-slate-400">Use like {'{{first_name}}'}.</p>
    </div>
  );
}

function CoursePicker({ value, name, onPick }) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState([]);
  useEffect(() => {
    let active = true;
    const t = setTimeout(async () => {
      let q = supabase.from('course').select('course_id,course_name').order('course_name').limit(20);
      if (term.trim()) q = q.or(`course_name.ilike.%${term.trim()}%,course_id.ilike.%${term.trim()}%`);
      const { data } = await q;
      if (active) setResults(data || []);
    }, 250);
    return () => { active = false; clearTimeout(t); };
  }, [term]);

  return (
    <div>
      {value && (
        <div className="mb-2 text-sm">
          Course: <span className="font-medium text-slate-800">{name || value}</span>
          <button className="ml-2 text-brand-700 underline" onClick={() => onPick('', '')}>change</button>
        </div>
      )}
      {!value && (
        <>
          <input className="input" placeholder="Search course by name or ID…" value={term} onChange={(e) => setTerm(e.target.value)} />
          {term && results.length > 0 && (
            <div className="mt-1 max-h-56 overflow-auto rounded-xl border border-slate-200">
              {results.map((c) => (
                <button key={c.course_id} className="block w-full px-3 py-2 text-left hover:bg-slate-50" onClick={() => { onPick(c.course_id, c.course_name); setTerm(''); }}>
                  <div className="text-sm font-medium text-slate-800">{c.course_name}</div>
                  <div className="font-mono text-xs text-slate-400">{c.course_id}</div>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AudienceBuilder({ audience, setAudience, advancedSql, setAdvancedSql, options }) {
  const set = (patch) => setAudience((a) => ({ ...a, ...patch }));
  const type = audience.type;
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {SOURCES.map((s) => (
          <button key={s.key} type="button" onClick={() => set({ type: s.key })} className={`btn btn-sm ${type === s.key ? 'btn-primary' : 'btn-ghost'}`}>
            {s.label}
          </button>
        ))}
      </div>
      <div className="mt-3 space-y-3">
        {type === 'course' && (
          <>
            <CoursePicker value={audience.courseId} name={audience.courseName} onPick={(id, nm) => set({ courseId: id, courseName: nm })} />
            <div className="grid gap-2 sm:grid-cols-3">
              <MultiSelect label="Status" options={ENROLMENT_STATUSES} selected={audience.statuses} onChange={(v) => set({ statuses: v })} />
              <MultiSelect label="DSE year" options={options.dseYears} selected={audience.dseYears} onChange={(v) => set({ dseYears: v })} />
              <MultiSelect label="Current level" options={options.levels} selected={audience.levels} onChange={(v) => set({ levels: v })} />
            </div>
          </>
        )}
        {type === 'students' && (
          <div className="grid gap-2 sm:grid-cols-2">
            <MultiSelect label="DSE year" options={options.dseYears} selected={audience.dseYears} onChange={(v) => set({ dseYears: v })} />
            <MultiSelect label="Current level" options={options.levels} selected={audience.levels} onChange={(v) => set({ levels: v })} />
          </div>
        )}
        {type === 'leads' && (
          <div className="grid gap-2 sm:grid-cols-2">
            <MultiSelect label="Campaign" options={options.campaigns} selected={audience.campaigns} onChange={(v) => set({ campaigns: v })} />
            <div className="text-xs text-slate-400 sm:mt-3">Only leads who consented to marketing are included.</div>
          </div>
        )}
        {type === 'manual' && (
          <textarea className="input min-h-[6rem] font-mono text-[13px]" placeholder={'One phone number per line\n59189011\n67412231'} value={audience.phonesText} onChange={(e) => set({ phonesText: e.target.value })} />
        )}
        {type === 'advanced' && (
          <textarea className="input min-h-[8rem] font-mono text-[13px]" placeholder="SELECT phone_number, first_name FROM student WHERE …" value={advancedSql} onChange={(e) => setAdvancedSql(e.target.value)} />
        )}
      </div>
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
            <select className="input mt-2 h-10" value={fld.mode} onChange={(e) => onChange(f.key, { mode: e.target.value })} aria-label={`${f.label} mode`}>
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

  const [model, setModel] = useState(null);
  const [editing, setEditing] = useState(isNew);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState(DEFAULTS);
  const [cron, setCron] = useState(parseCron(DEFAULTS.cron_expr));
  const [audience, setAudience] = useState(AUDIENCE_DEFAULT);
  const [advancedSql, setAdvancedSql] = useState('');
  const [options, setOptions] = useState({ dseYears: [], levels: [], campaigns: [] });

  const cronPreview = useMemo(() => serializeCron(cron), [cron]);
  const effectiveSql = useMemo(
    () => (audience.type === 'advanced' ? advancedSql : buildAudienceSql(audience)),
    [audience, advancedSql],
  );

  useEffect(() => {
    if (isNew) { setModel({ ...DEFAULTS, id: null }); return; }
    (async () => {
      const { data, error } = await supabase.from('whatsapp_schedules').select('*').eq('id', id).single();
      if (error) setError(error.message);
      else setModel(data);
    })();
  }, [id, isNew]);

  // option lists for the builder
  useEffect(() => {
    supabase.rpc('student_filter_options').then(({ data }) => setOptions((o) => ({ ...o, dseYears: data?.dse_years || [], levels: data?.levels || [] })));
    supabase.from('marketing_leads').select('campaign').not('campaign', 'is', null).then(({ data }) =>
      setOptions((o) => ({ ...o, campaigns: [...new Set((data || []).map((r) => r.campaign))].sort() })));
  }, []);

  function beginEdit(src) {
    setForm({
      name: src.name || '', cron_expr: src.cron_expr || '0 10 * * *', timezone: src.timezone || 'Asia/Hong_Kong',
      message_template: src.message_template || '', pdf_path: src.pdf_path || '', image_path: src.image_path || '', active: !!src.active,
    });
    setCron(parseCron(src.cron_expr || '0 10 * * *'));
    if (src.audience && src.audience.type && src.audience.type !== 'advanced') {
      setAudience({ ...AUDIENCE_DEFAULT, ...src.audience });
      setAdvancedSql('');
    } else {
      setAudience({ ...AUDIENCE_DEFAULT, type: 'advanced' });
      setAdvancedSql(src.sql_query || '');
    }
    setEditing(true);
  }

  useEffect(() => { if (isNew) beginEdit({ ...DEFAULTS }); }, [isNew]); // eslint-disable-line

  const setCronField = (key, patch) => setCron((c) => ({ ...c, [key]: { ...c[key], ...patch } }));

  async function save() {
    const sql = (effectiveSql || '').trim();
    const payload = {
      name: form.name.trim(),
      cron_expr: serializeCron(cron),
      timezone: form.timezone.trim() || 'Asia/Hong_Kong',
      sql_query: sql,
      audience: audience.type === 'advanced' ? { type: 'advanced' } : audience,
      message_template: form.message_template.trim(),
      pdf_path: form.pdf_path.trim() || null,
      image_path: form.image_path.trim() || null,
      active: form.active,
    };
    const errs = [];
    if (!payload.name) errs.push('Name is required.');
    if (!sql) errs.push('Pick an audience (no recipients defined yet).');
    if (!payload.message_template) errs.push('Message template is required.');
    if (payload.cron_expr.trim().split(/\s+/).length !== 5) errs.push('Cron expression must have 5 fields.');
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
    const fields = audience.type === 'advanced' ? [] : audienceFields(audience.type);
    return (
      <>
        <PageHeader title={isNew ? 'New schedule' : 'Edit schedule'} backTo="/scheduler" backLabel="Back to scheduler" />
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
            <div className="label">Audience</div>
            <AudienceBuilder audience={audience} setAudience={setAudience} advancedSql={advancedSql} setAdvancedSql={setAdvancedSql} options={options} />
            <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
              <RecipientsPreview sql={effectiveSql} />
            </div>
          </div>

          <div>
            <div className="label">Cron schedule</div>
            <CronBuilder state={cron} onChange={setCronField} />
            <div className="mt-2 text-xs text-slate-500">Preview: <code className="font-mono text-slate-700">{cronPreview}</code></div>
          </div>

          <div>
            <label className="label" htmlFor="s-msg">Message template</label>
            <textarea id="s-msg" className="input min-h-[7rem]" placeholder="Hi {{first_name}}, …" value={form.message_template} onChange={(e) => setForm((x) => ({ ...x, message_template: e.target.value }))} />
            <Placeholders fields={fields} />
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
            <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? <Spinner /> : 'Save schedule'}</button>
            <button className="btn btn-ghost" onClick={() => (isNew ? navigate('/scheduler') : setEditing(false))} disabled={saving}>Cancel</button>
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
            <button className="btn btn-ghost" onClick={() => beginEdit(r)}><Icon name="edit" size={16} /> Edit</button>
          </>
        }
      />

      {/* Recipients — verify who's in this broadcast */}
      <div className="card mb-4 p-5 sm:p-6">
        <RecipientsPreview sql={r.sql_query} debounce={0} downloadName={`recipients-${(r.name || 'schedule').replace(/\s+/g, '-')}.csv`} />
      </div>

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
            <button className="btn btn-danger-ghost" onClick={remove}><Icon name="trash" size={16} /> Delete</button>
          </div>
        </div>

        <div className="card space-y-4 p-5 sm:p-6">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Message template</div>
            <pre className="mt-1.5 whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3.5 text-sm text-slate-700">{r.message_template || '—'}</pre>
          </div>
          <details>
            <summary className="cursor-pointer text-xs font-medium uppercase tracking-wide text-slate-400">Recipient query (SQL)</summary>
            <pre className="mt-1.5 overflow-auto rounded-xl bg-slate-900 p-3.5 font-mono text-[12.5px] leading-relaxed text-slate-100">{r.sql_query || '—'}</pre>
          </details>
        </div>
      </div>
    </>
  );
}
