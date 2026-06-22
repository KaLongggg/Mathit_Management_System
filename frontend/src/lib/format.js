export function fmtDate(d) {
  if (!d) return '-';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? '-' : dt.toLocaleString();
}

export function fmtDateShort(d) {
  if (!d) return '-';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? '-' : dt.toLocaleDateString();
}

export function pct(v) {
  if (v == null || v === '') return '-';
  const n = Number(v);
  return isNaN(n) ? '-' : `${Math.round(n * 100)}%`;
}

export function fullName(s) {
  if (!s) return '';
  return `${s.first_name || ''} ${s.last_name || ''}`.trim();
}
