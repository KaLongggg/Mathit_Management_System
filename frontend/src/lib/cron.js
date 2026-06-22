// Cron field model used by the schedule editor.
// Each of the 5 fields has a mode: 'any' (*), 'every' (*/N), or 'list' (raw e.g. 0,15,30).
export const CRON_FIELDS = [
  { key: 'min', label: 'Minute', hint: '0–59' },
  { key: 'hour', label: 'Hour', hint: '0–23' },
  { key: 'dom', label: 'Day of month', hint: '1–31' },
  { key: 'mon', label: 'Month', hint: '1–12 or JAN–DEC' },
  { key: 'dow', label: 'Day of week', hint: '0–6 or SUN–SAT' },
];

const KEYS = CRON_FIELDS.map((f) => f.key);

export function parseCron(expr) {
  const parts = (expr || '').trim().split(/\s+/);
  const arr = parts.length === 5 ? parts : ['*', '*', '*', '*', '*'];
  const state = {};
  KEYS.forEach((k, i) => {
    const v = arr[i];
    if (v === '*') state[k] = { mode: 'any', every: '', list: '' };
    else if (/^\*\/(\d+)$/.test(v)) state[k] = { mode: 'every', every: v.split('/')[1], list: '' };
    else state[k] = { mode: 'list', every: '', list: v };
  });
  return state;
}

export function serializeCron(state) {
  return KEYS.map((k) => {
    const f = state[k] || {};
    if (f.mode === 'every') return `*/${(f.every || '1').trim() || '1'}`;
    if (f.mode === 'list') return (f.list || '').trim().replace(/\s+/g, '') || '*';
    return '*';
  }).join(' ');
}
