import { useEffect, useState } from 'react';
import { useToast } from '../components/Toast.jsx';
import { PageHeader, SkeletonRows, Spinner } from '../components/ui.jsx';
import { loadConfig, setConfig, CONFIG_DEFAULTS } from '../lib/config.js';

// Each config we expose in the UI. `parse` turns the input string into the
// stored JSON value; `kind` drives the input type.
const FIELDS = [
  {
    key: 'enrolment_expiry_months', label: 'Enrolment expiry', kind: 'number', suffix: 'months',
    hint: 'Default access length applied when you enrol a student through this app (e.g. 12 = one year).',
    parse: (v) => Math.max(0, parseInt(v, 10) || 0),
  },
  {
    key: 'expiry_reminder_days', label: 'Expiry reminder lead time', kind: 'number', suffix: 'days before',
    hint: 'Default "days before expiry" suggested when building re-enrol reminder schedules.',
    parse: (v) => Math.max(0, parseInt(v, 10) || 0),
  },
  {
    key: 'invoice_prefix', label: 'Invoice number prefix', kind: 'text',
    hint: 'Prefix for generated invoice numbers, e.g. "MIT-" → MIT-12345.',
    parse: (v) => v.trim(),
  },
  {
    key: 'course_class_options', label: 'Course classes', kind: 'list',
    hint: 'One class per line. Used by the course filter and the course-detail class dropdown.',
    parse: (v) => v.split('\n').map((s) => s.trim()).filter(Boolean),
  },
  {
    key: 'delivery_mode_options', label: 'Delivery modes', kind: 'list',
    hint: 'One mode per line. Used by each enrolment’s "Delivery mode" dropdown.',
    parse: (v) => v.split('\n').map((s) => s.trim()).filter(Boolean),
  },
];

export default function Settings() {
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadConfig().then((cfg) => {
      setForm(Object.fromEntries(FIELDS.map((f) => {
        const v = cfg[f.key] ?? CONFIG_DEFAULTS[f.key];
        return [f.key, f.kind === 'list' ? (Array.isArray(v) ? v.join('\n') : '') : String(v ?? '')];
      })));
    });
  }, []);

  async function save() {
    setSaving(true);
    try {
      await Promise.all(FIELDS.map((f) => setConfig(f.key, f.parse(form[f.key]))));
      toast('Settings saved.', 'success');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="Settings" subtitle="Business defaults used across the system." />
      {!form ? (
        <SkeletonRows rows={3} />
      ) : (
        <div className="card max-w-2xl p-5 sm:p-6">
          <div className="space-y-6">
            {FIELDS.map((f) => (
              <div key={f.key}>
                <label className="label" htmlFor={f.key}>{f.label}</label>
                {f.kind === 'list' ? (
                  <textarea
                    id={f.key}
                    rows={Math.max(3, form[f.key].split('\n').length)}
                    className="input sm:max-w-xs font-mono text-[13px]"
                    value={form[f.key]}
                    onChange={(e) => setForm((x) => ({ ...x, [f.key]: e.target.value }))}
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      id={f.key}
                      type={f.kind === 'number' ? 'number' : 'text'}
                      min={f.kind === 'number' ? 0 : undefined}
                      className="input sm:w-48"
                      value={form[f.key]}
                      onChange={(e) => setForm((x) => ({ ...x, [f.key]: e.target.value }))}
                    />
                    {f.suffix && <span className="text-sm text-slate-500">{f.suffix}</span>}
                  </div>
                )}
                <p className="mt-1.5 text-xs text-slate-400">{f.hint}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 border-t border-slate-100 pt-4">
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? <Spinner /> : 'Save settings'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
