import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { PageHeader, Spinner } from '../components/ui.jsx';

function BotCard({ row }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(row.label || '');

  const state = row.state;
  const stale = Date.now() - new Date(row.updated_at).getTime() > 90000;

  const save = async () => {
    await supabase.from('bot_status').update({ label: name.trim() || null }).eq('id', row.id);
    setEditing(false); // the 6s poll will reflect the new name
  };

  return (
    <div className="card p-6 text-center">
      <div className="mb-3 flex items-center justify-center gap-2">
        {editing ? (
          <>
            <input
              className="input h-9 w-44 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Account name"
              autoFocus
            />
            <button className="btn btn-sm btn-primary" onClick={save}>Save</button>
          </>
        ) : (
          <>
            <h3 className="font-display text-lg font-semibold text-slate-800">{row.label || row.id}</h3>
            <button className="text-xs text-slate-400 hover:text-brand-600" onClick={() => { setName(row.label || ''); setEditing(true); }}>
              rename
            </button>
          </>
        )}
      </div>

      {state === 'ready' && !stale ? (
        <div className="py-6">
          <div className="text-4xl">✅</div>
          <p className="mt-2 font-semibold text-emerald-600">Connected</p>
          <p className="mt-1 text-sm text-slate-500">Online and ready to send.</p>
        </div>
      ) : stale || !row.qr ? (
        <div className="py-8">
          <Spinner size={20} />
          <p className="mt-3 text-sm text-slate-500">
            {stale ? 'Bot offline — waiting for it to come up…' : `Waiting for a QR code… (${state || 'starting'})`}
          </p>
        </div>
      ) : (
        <>
          <img src={row.qr} alt="WhatsApp QR code" className="mx-auto h-56 w-56" />
          <div className="mt-3 text-left text-sm text-slate-600">
            <p className="font-medium text-slate-700">On this account's phone:</p>
            <ol className="mt-1 list-decimal space-y-0.5 pl-5">
              <li>Settings → <span className="font-medium">Linked Devices</span></li>
              <li>Tap <span className="font-medium">Link a Device</span></li>
              <li>Scan this code</li>
            </ol>
          </div>
        </>
      )}
    </div>
  );
}

export default function LinkWhatsApp() {
  const [rows, setRows] = useState(undefined);

  useEffect(() => {
    let active = true;
    const tick = async () => {
      const { data } = await supabase.from('bot_status').select('*').order('id');
      if (active) setRows(data || []);
    };
    tick();
    const t = setInterval(tick, 6000); // poll fast — QR codes rotate every ~20s
    return () => { active = false; clearInterval(t); };
  }, []);

  return (
    <>
      <PageHeader title="Link WhatsApp" subtitle="Connect each WhatsApp account by scanning the QR with that account's phone." backTo="/scheduler" backLabel="Back to scheduler" />
      {rows === undefined ? (
        <div className="py-10 text-center"><Spinner size={24} /></div>
      ) : rows.length === 0 ? (
        <div className="card mx-auto max-w-md p-6 text-center text-sm text-slate-500">No bots are reporting status yet.</div>
      ) : (
        <div className="mx-auto grid max-w-3xl gap-4 sm:grid-cols-2">
          {rows.map((row) => <BotCard key={row.id} row={row} />)}
        </div>
      )}
    </>
  );
}
