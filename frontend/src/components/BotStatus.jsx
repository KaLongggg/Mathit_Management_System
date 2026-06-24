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
    case 'qr': return { label: 'Needs QR scan', color: '#f59e0b', hint: 'Scan the QR code on the server' };
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

export function useBotStatus() {
  const [row, setRow] = useState(undefined);
  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data } = await supabase.from('bot_status').select('*').eq('id', 'whatsapp_bot').maybeSingle();
      if (active) setRow(data || null);
    };
    load();
    const t = setInterval(load, 20_000);
    return () => { active = false; clearInterval(t); };
  }, []);
  return row;
}

const secsAgo = (row) => (row ? Math.max(0, Math.round((Date.now() - new Date(row.updated_at).getTime()) / 1000)) : null);

export function BotStatusBanner() {
  const row = useBotStatus();
  if (row === undefined) return null;
  const s = derive(row);
  const ago = secsAgo(row);
  return (
    <div className="mb-4 flex items-center gap-3 rounded-xl border px-4 py-3" style={{ borderColor: `${s.color}33`, background: `${s.color}12` }}>
      <Dot color={s.color} />
      <div className="min-w-0">
        <span className="font-semibold" style={{ color: s.color }}>WhatsApp bot: {s.label}</span>
        <span className="ml-2 text-sm text-slate-500">{s.hint}{ago != null ? ` · last seen ${ago}s ago` : ''}</span>
      </div>
      {s.label !== 'Online' && (
        <Link to="/link" className="ml-auto shrink-0 text-sm font-semibold" style={{ color: s.color }}>
          Link WhatsApp →
        </Link>
      )}
    </div>
  );
}

export function BotStatusTile() {
  const row = useBotStatus();
  const s = derive(row === undefined ? null : row);
  const ago = secsAgo(row);
  return (
    <Link to="/link" className="card block h-full p-5 transition hover:shadow-soft">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-500">WhatsApp bot</span>
        <Dot color={s.color} />
      </div>
      <div className="mt-3 font-display text-2xl font-semibold" style={{ color: s.color }}>{s.label}</div>
      <div className="mt-1 text-xs text-slate-400">{s.hint}{ago != null ? ` · ${ago}s ago` : ''}</div>
    </Link>
  );
}
