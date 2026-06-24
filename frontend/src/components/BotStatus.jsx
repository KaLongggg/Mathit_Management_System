import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';

// If the last heartbeat is older than this, the bot is treated as offline
// (it writes every ~30s, so 90s = three missed beats).
const STALE_MS = 90_000;

function derive(row) {
  if (!row) return { label: 'Unknown', color: '#94a3b8', hint: 'No status reported yet' };
  const ageMs = Date.now() - new Date(row.updated_at).getTime();
  if (ageMs > STALE_MS) {
    return { label: 'Offline', color: '#ef4444', hint: 'No recent heartbeat — the bot may be stopped' };
  }
  switch (row.state) {
    case 'ready': return { label: 'Online', color: '#10b981', hint: 'WhatsApp connected' };
    case 'disconnected': return { label: 'Disconnected', color: '#ef4444', hint: row.detail || 'WhatsApp disconnected' };
    case 'qr': return { label: 'Needs QR scan', color: '#f59e0b', hint: 'Scan the QR code to link' };
    case 'auth_failure': return { label: 'Auth failed', color: '#ef4444', hint: row.detail || 'Re-authenticate the bot' };
    default: return { label: 'Starting', color: '#f59e0b', hint: row.detail || 'Connecting…' };
  }
}

function Dot({ color }) {
  return (
    <span className="relative flex h-2.5 w-2.5">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: color }} />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ background: color }} />
    </span>
  );
}

// All WhatsApp accounts (one bot_status row each), polled live.
export function useBotStatuses() {
  const [rows, setRows] = useState(undefined);
  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data } = await supabase.from('bot_status').select('*').order('id');
      if (active) setRows(data || []);
    };
    load();
    const t = setInterval(load, 20_000);
    return () => { active = false; clearInterval(t); };
  }, []);
  return rows;
}

const secsAgo = (row) => (row ? Math.max(0, Math.round((Date.now() - new Date(row.updated_at).getTime()) / 1000)) : null);

function BotStatusBannerRow({ row }) {
  const s = derive(row);
  const ago = secsAgo(row);
  return (
    <div className="flex items-center gap-3 rounded-xl border px-4 py-3" style={{ borderColor: `${s.color}33`, background: `${s.color}12` }}>
      <Dot color={s.color} />
      <div className="min-w-0">
        <span className="font-semibold" style={{ color: s.color }}>{row.label || 'WhatsApp bot'}: {s.label}</span>
        <span className="ml-2 text-sm text-slate-500">{s.hint}{ago != null ? ` · last seen ${ago}s ago` : ''}</span>
      </div>
      {s.label !== 'Online' && (
        <Link to="/link" className="ml-auto shrink-0 text-sm font-semibold" style={{ color: s.color }}>
          Link →
        </Link>
      )}
    </div>
  );
}

export function BotStatusBanner() {
  const rows = useBotStatuses();
  if (rows === undefined || rows.length === 0) return null;
  return (
    <div className="mb-4 space-y-2">
      {rows.map((row) => <BotStatusBannerRow key={row.id} row={row} />)}
    </div>
  );
}

export function BotStatusTile() {
  const rows = useBotStatuses();
  const list = rows === undefined ? [] : rows;
  return (
    <Link to="/link" className="card block h-full p-5 transition hover:shadow-soft">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-500">WhatsApp {list.length > 1 ? 'accounts' : 'bot'}</span>
      </div>
      <div className="mt-3 space-y-2">
        {list.length === 0 && <div className="font-display text-2xl font-semibold text-slate-300">—</div>}
        {list.map((row) => {
          const s = derive(row);
          return (
            <div key={row.id} className="flex items-center gap-2">
              <Dot color={s.color} />
              <span className="truncate text-sm font-medium text-slate-700">{row.label || row.id}</span>
              <span className="ml-auto shrink-0 text-xs font-semibold" style={{ color: s.color }}>{s.label}</span>
            </div>
          );
        })}
      </div>
    </Link>
  );
}
