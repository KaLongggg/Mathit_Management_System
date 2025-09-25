import { supabase } from '../supabaseClient.js';
import { el, showApp, escapeHtml, cssId } from '../ui.js';
import { renderWhatsAppSchedulerDetail } from './schedulerDetail.js';

// -------- utils --------
function $(id){ return document.getElementById(id); }
function bool(v){ return v === true || v === 'true' || v === 1; }
function fmtDate(d){ 
  if (!d) return '-';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? '-' : dt.toLocaleString();
}
function toast(msg, type='info'){
  const box = document.createElement('div');
  box.className = `fixed bottom-4 right-4 px-4 py-3 rounded-xl shadow-lg text-sm z-50 ${type==='error'?'bg-red-600 text-white':type==='success'?'bg-emerald-600 text-white':'bg-zinc-900 text-white'}`;
  box.textContent = msg; document.body.appendChild(box); setTimeout(()=> box.remove(), 2500);
}
function badgeActive(v){ return bool(v) ? '<span class="pill pill-green">Active</span>' : '<span class="pill pill-red">Inactive</span>'; }

// -------- List Page --------
export async function renderWhatsAppSchedules(){
  showApp();
  el.view.innerHTML = `
  <section class="card p-6">
    <div class="flex items-start justify-between gap-3">
      <h2 class="text-xl font-semibold">WhatsApp Scheduler</h2>
      <div class="flex gap-2">
        <button id="btnNew" class="btn btn-primary h-11">New Schedule</button>
        <button id="btnRefresh" class="btn btn-ghost h-11">Refresh</button>
      </div>
    </div>
    <div id="listWrap" class="mt-4"></div>
  </section>`;

  $('btnNew').onclick = ()=> { location.hash = '#/scheduler/new'; };
  $('btnRefresh').onclick = loadList;
  await loadList();

  async function loadList(){
    const wrap = $('listWrap');
    wrap.innerHTML = '<div class="text-zinc-500">Loading…</div>';
    const { data, error } = await supabase
      .from('whatsapp_schedules')
      .select('*')
      .order('created_at', { ascending:false });
    if (error){ wrap.innerHTML = `<div class="text-red-600">${escapeHtml(error.message)}</div>`; return; }
    if (!data?.length){ wrap.innerHTML = '<div class="text-zinc-500">No schedules yet.</div>'; return; }

    wrap.innerHTML = `<div class="grid md:grid-cols-2 gap-4">${data.map(cardItem).join('')}</div>`;

    data.forEach(r=>{
      const c = document.getElementById(`wa-${cssId(r.id)}`);
      c && (c.onclick = ()=> { location.hash = `#/scheduler/${encodeURIComponent(r.id)}`; });
      const t = document.getElementById(`toggle-${cssId(r.id)}`);
      if (t){
        t.onclick = async (e)=>{
          e.stopPropagation();
          t.disabled = true;
          const { error: uerr } = await supabase
            .from('whatsapp_schedules')
            .update({ active: !bool(r.active) })
            .eq('id', r.id);
          t.disabled = false;
          if (uerr) return toast(uerr.message,'error');
          toast('Updated.','success');
          loadList();
        };
      }
    });
  }

  function cardItem(r){
    return `
    <div id="wa-${cssId(r.id)}" class="card p-5 hover:ring-2 hover:ring-brand-teal/60 transition cursor-pointer">
      <div class="flex items-start justify-between gap-4">
        <div>
          <div class="text-lg font-semibold">${escapeHtml(r.name)}</div>
          <div class="text-sm text-zinc-600 dark:text-zinc-400">${escapeHtml(r.cron_expr)} · ${escapeHtml(r.timezone || '')}</div>
        </div>
        <div class="flex items-center gap-2">
          ${badgeActive(r.active)}
          <button id="toggle-${cssId(r.id)}" class="btn btn-ghost h-8 text-xs">${bool(r.active)?'Disable':'Enable'}</button>
        </div>
      </div>
      <div class="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        <div><span class="text-zinc-500">Created:</span> ${escapeHtml(fmtDate(r.created_at))}</div>
      </div>
    </div>`;
  }
}

// -------- Router glue for list+detail --------
export function routeWhatsAppScheduler(){
  const parts = location.hash.split('/'); 
  if (parts[1] !== 'scheduler') return false;
  const id = parts[2];
  if (id) return renderWhatsAppSchedulerDetail(decodeURIComponent(id));
  return renderWhatsAppSchedules();
}
