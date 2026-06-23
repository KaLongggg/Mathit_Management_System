import { supabase } from './supabase.js';

function esc(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// columns: [{ label, get?(row) | key }]
export function downloadCsv(filename, columns, rows) {
  const header = columns.map((c) => esc(c.label)).join(',');
  const body = rows
    .map((r) => columns.map((c) => esc(c.get ? c.get(r) : r[c.key])).join(','))
    .join('\n');
  const csv = '﻿' + header + '\n' + body; // BOM so Excel reads UTF-8 (Chinese names)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Page through a query (buildQuery returns a fresh query each call) up to `cap` rows.
export async function fetchAll(buildQuery, { pageSize = 1000, cap = 20000 } = {}) {
  const out = [];
  let from = 0;
  while (from < cap) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

export { supabase };
