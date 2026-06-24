import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { PageHeader, Spinner } from '../components/ui.jsx';

export default function LinkWhatsApp() {
  const [row, setRow] = useState(undefined);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data } = await supabase.from('bot_status').select('*').eq('id', 'whatsapp_bot').maybeSingle();
      if (active) setRow(data || null);
    };
    load();
    const t = setInterval(load, 6000); // poll fast — the QR rotates every ~20s
    return () => { active = false; clearInterval(t); };
  }, []);

  const state = row?.state;
  const stale = row && Date.now() - new Date(row.updated_at).getTime() > 90000;

  return (
    <>
      <PageHeader title="Link WhatsApp" subtitle="Connect the sending bot by scanning with the MathitHK WhatsApp phone." backTo="/scheduler" backLabel="Back to scheduler" />
      <div className="card mx-auto max-w-md p-6 text-center">
        {row === undefined ? (
          <div className="py-10"><Spinner size={24} /></div>
        ) : state === 'ready' && !stale ? (
          <div className="py-8">
            <div className="text-5xl">✅</div>
            <p className="mt-3 text-lg font-semibold text-emerald-600">WhatsApp is connected</p>
            <p className="mt-1 text-sm text-slate-500">The bot is online and ready to send.</p>
          </div>
        ) : stale || !row?.qr ? (
          <div className="py-10">
            <Spinner size={22} />
            <p className="mt-3 text-sm text-slate-500">
              {stale ? 'Bot is offline — waiting for it to come up…' : `Waiting for a QR code… (${state || 'starting'})`}
            </p>
          </div>
        ) : (
          <>
            <img src={row.qr} alt="WhatsApp QR code" className="mx-auto h-64 w-64" />
            <div className="mt-4 text-left text-sm text-slate-600">
              <p className="font-medium text-slate-700">On the MathitHK WhatsApp phone:</p>
              <ol className="mt-1 list-decimal space-y-0.5 pl-5">
                <li>Settings → <span className="font-medium">Linked Devices</span></li>
                <li>Tap <span className="font-medium">Link a Device</span></li>
                <li>Point the camera at this code</li>
              </ol>
              <p className="mt-3 text-xs text-slate-400">The code refreshes automatically; this page updates every few seconds. It turns into a ✅ once linked.</p>
            </div>
          </>
        )}
      </div>
    </>
  );
}
