import { supabase } from '../supabaseClient.js';
import { el, showApp, escapeHtml, cssId } from '../ui.js';

// -------- utils --------
function $(id){ return document.getElementById(id); }
function bool(v){ return v === true || v === 'true' || v === 1; }
function toast(msg, type='info'){
  const box = document.createElement('div');
  box.className = `fixed bottom-4 right-4 px-4 py-3 rounded-xl shadow-lg text-sm z-50 ${type==='error'?'bg-red-600 text-white':type==='success'?'bg-emerald-600 text-white':'bg-zinc-900 text-white'}`;
  box.textContent = msg; document.body.appendChild(box); setTimeout(()=> box.remove(), 2500);
}
function fmtDate(d){ try{ return new Date(d).toLocaleString(); }catch{ return d ?? ''; } }

// --- Template placeholders (student columns) ---
const STUDENT_TEMPLATE_FIELDS = [
  'student_id','phone_number','email','dse_year','is_active','dse_aim',
  'current_level','first_name','last_name','last_sign_in','date_created','postal_address'
];
function placeholderPill(text){
  return `<span class="inline-flex items-center rounded-full border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs">${escapeHtml(text)}</span>`;
}
function renderPlaceholderPills(fields){
  return fields.map(f => placeholderPill(`{{${f}}}`)).join(' ');
}

// -------- cron helpers (self-contained here) --------
function parseCron(expr){ const def = ['*','*','*','*','*']; if (!expr || typeof expr !== 'string') return def; const parts = expr.trim().split(/\s+/); return parts.length===5?parts:def; }
function hookCronMode(prefix){ ['min','hour','dom','mon','dow'].forEach(k=>{ const modeSel = $(`${prefix}-${k}-mode`); if(!modeSel) return; const everyWrap = $(`${prefix}-${k}-every`).closest('[data-every]'); const listWrap = $(`${prefix}-${k}-list`).closest('[data-list]'); modeSel.onchange = ()=>{ const v = modeSel.value; everyWrap.classList.toggle('hidden', v!=='every'); listWrap.classList.toggle('hidden', v!=='list'); }; }); }
function cronField(prefix, key, label, hint){
  return `
  <div>
    <div class="text-sm font-medium mb-1">${escapeHtml(label)}</div>
    <div class="flex items-center gap-2">
      <select id="${prefix}-${key}-mode" class="input h-10 w-28">
        <option value="any">Every</option>
        <option value="every">Every N</option>
        <option value="list">Specific</option>
      </select>
      <div data-every class="flex items-center gap-2 hidden">
        <span class="text-sm">*/</span>
        <input id="${prefix}-${key}-every" class="input h-10 w-20" placeholder="N">
      </div>
      <div data-list class="flex-1 hidden">
        <input id="${prefix}-${key}-list" class="input h-10 w-full" placeholder="e.g. 0,15,30,45">
      </div>
    </div>
    <div class="text-xs text-zinc-500 mt-1">${escapeHtml(hint)}</div>
  </div>`;
}
function cronEditor(prefix){
  return `
  <div class="grid md:grid-cols-5 gap-3">
    ${cronField(prefix,'min','Minute','0-59')}
    ${cronField(prefix,'hour','Hour','0-23')}
    ${cronField(prefix,'dom','Day of Month','1-31')}
    ${cronField(prefix,'mon','Month','1-12 or JAN-DEC')}
    ${cronField(prefix,'dow','Day of Week','0-6 or SUN-SAT')}
  </div>`;
}
function cronToUi(expr, prefix){ const [m,h,dom,mon,dow] = parseCron(expr); const map = { min:m, hour:h, dom, mon, dow }; Object.entries(map).forEach(([k, val])=>{ const modeSel = $(`${prefix}-${k}-mode`); if(!modeSel) return; const everyInp = $(`${prefix}-${k}-every`); const listInp = $(`${prefix}-${k}-list`); const isEvery = /^\*\/(\d+)$/.test(val); if (val==='*'){ modeSel.value='any'; everyInp.closest('[data-every]').classList.add('hidden'); listInp.closest('[data-list]').classList.add('hidden'); } else if (isEvery){ modeSel.value='every'; const n = val.split('/')[1]; everyInp.value=n; everyInp.closest('[data-every]').classList.remove('hidden'); listInp.closest('[data-list]').classList.add('hidden'); } else { modeSel.value='list'; listInp.value=val; everyInp.closest('[data-every]').classList.add('hidden'); listInp.closest('[data-list]').classList.remove('hidden'); } }); }
function uiToCron(prefix){ const f = fld => $(`${prefix}-${fld}`); const comp = fld => { const mode = f(`${fld}-mode`).value; if (mode==='any') return '*'; if (mode==='every'){ const n = f(`${fld}-every`).value.trim() || '1'; return `*/${n}`; } const raw = f(`${fld}-list`).value.trim().replace(/\s+/g,''); return raw || '*'; }; return [comp('min'),comp('hour'),comp('dom'),comp('mon'),comp('dow')].join(' '); }

function validateSchedule({ name, cron_expr, timezone, sql_query, message_template }){
  const errs = [];
  if (!name) errs.push('Name is required.');
  if (!sql_query) errs.push('SQL query is required.');
  if (!message_template) errs.push('Message template is required.');
  if (!cron_expr || cron_expr.trim().split(/\s+/).length !== 5) errs.push('Cron expression must have 5 fields.');
  if (!timezone) errs.push('Timezone is required.');
  return errs;
}

// -------- Detail + Edit --------
export async function renderWhatsAppSchedulerDetail(id){
  showApp();
  const isNew = (id === 'new');
  el.view.innerHTML = `
  <section class="card p-6">
    <div class="flex items-start justify-between gap-3">
      <h2 class="text-xl font-semibold">${isNew ? 'New Schedule' : 'Schedule Detail'}</h2>
      <div class="flex gap-2">
        ${isNew ? '' : '<button id="btnEdit" class="btn btn-ghost h-11">Edit</button>'}
        <button id="btnBack" class="btn h-11">Back</button>
      </div>
    </div>
    <div id="detailWrap" class="mt-4"></div>
  </section>`;

  $('btnBack').onclick = ()=> { location.hash = '#/scheduler'; };

  let model = isNew ? {
    id: null,
    name: '',
    cron_expr: '* * * * *',
    timezone: 'Asia/Hong_Kong',
    sql_query: '',
    message_template: '',
    pdf_path: null,
    image_path: null,
    active: true,
    created_at: null,
  } : await loadOne();

  if (isNew) {
    renderEdit(model);
  } else {
    $('btnEdit').onclick = ()=> renderEdit(model);
    renderView(model);
  }

  async function loadOne(){
    const { data, error } = await supabase
      .from('whatsapp_schedules')
      .select('*')
      .eq('id', id)
      .single();
    if (error){ $('detailWrap').innerHTML = `<div class="text-red-600">${escapeHtml(error.message)}</div>`; return {}; }
    return data;
  }

  function renderView(r){
    $('detailWrap').innerHTML = `
    <div class="grid lg:grid-cols-2 gap-6">
      <div class="space-y-3">
        <div><div class="text-sm text-zinc-500">Name</div><div class="font-medium">${escapeHtml(r.name)}</div></div>
        <div><div class="text-sm text-zinc-500">Cron</div><div class="font-medium">${escapeHtml(r.cron_expr)}</div></div>
        <div><div class="text-sm text-zinc-500">Timezone</div><div class="font-medium">${escapeHtml(r.timezone || '')}</div></div>
        <div><div class="text-sm text-zinc-500">Active</div><div class="font-medium">${bool(r.active) ? 'Yes' : 'No'}</div></div>
        <div><div class="text-sm text-zinc-500">Created</div><div class="font-medium">${escapeHtml(fmtDate(r.created_at))}</div></div>
      </div>
      <div class="space-y-3">
        <div>
          <div class="text-sm text-zinc-500">SQL Query</div>
           <pre class="p-3 bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 rounded-xl overflow-auto text-xs whitespace-pre-wrap break-words font-mono">${escapeHtml(r.sql_query || '')}</pre>
        </div>
        <div>
          <div class="text-sm text-zinc-500">Message Template</div>
          <pre class="p-3 bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 rounded-xl overflow-auto text-xs whitespace-pre-wrap break-words font-mono">${escapeHtml(r.message_template || '')}</pre>
          <div class="mt-2">
            <div class="text-sm text-zinc-500">Available placeholders (student)</div>
            <div class="flex flex-wrap gap-2 mt-1">
              ${renderPlaceholderPills(STUDENT_TEMPLATE_FIELDS)}
            </div>
            <div class="text-xs text-zinc-500 mt-1">Use like {{first_name}}. Only fields returned by your SQL are available.</div>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <div class="text-sm text-zinc-500">PDF File Name</div>
            <div class="font-medium">${escapeHtml(r.pdf_path || '-')}</div>
          </div>
          <div>
            <div class="text-sm text-zinc-500">Image File Name</div>
            <div class="font-medium">${escapeHtml(r.image_path || '-')}</div>
          </div>
        </div>
      </div>
    </div>
    ${isNew ? '' : `
    <div class="mt-6">
      <button id="btnToggle" class="btn btn-ghost">${bool(r.active)?'Disable':'Enable'}</button>
      <button id="btnDelete" class="btn btn-ghost text-red-600">Delete</button>
    </div>`}`;

    if (!isNew){
      $('btnToggle').onclick = async ()=>{
        const { error } = await supabase
          .from('whatsapp_schedules')
          .update({ active: !bool(r.active) })
          .eq('id', r.id);
        if (error) return toast(error.message,'error');
        toast('Updated.','success');
        renderWhatsAppSchedulerDetail(r.id);
      };
      $('btnDelete').onclick = async ()=>{
        if (!confirm('Delete this schedule?')) return;
        const { error } = await supabase
          .from('whatsapp_schedules')
          .delete()
          .eq('id', r.id);
        if (error) return toast(error.message,'error');
        toast('Deleted.','success');
        location.hash = '#/scheduler';
      };
    }
  }

  function renderEdit(r){
    const prefix = 'cron';
    $('detailWrap').innerHTML = `
    <form id="frm" class="space-y-5">
      <div class="grid md:grid-cols-2 gap-4">
        <div>
          <label class="text-sm text-zinc-500">Name</label>
          <input id="f-name" class="input h-11 w-full" placeholder="Rule name" value="${escapeHtml(r.name || '')}">
        </div>
        <div>
          <label class="text-sm text-zinc-500">Timezone</label>
          <input id="f-tz" class="input h-11 w-full" placeholder="e.g. Asia/Hong_Kong" value="${escapeHtml(r.timezone || 'Asia/Hong_Kong')}">
        </div>
      </div>

      <div>
        <div class="mb-2 text-sm text-zinc-500">Cron Schedule</div>
        ${cronEditor(prefix)}
        <div class="mt-2 text-xs text-zinc-500">Preview: <code id="cron-preview" class="text-zinc-700 dark:text-zinc-300">*</code></div>
      </div>

      <div>
        <label class="text-sm text-zinc-500">SQL Query</label>
        <textarea id="f-sql" class="input min-h-32 w-full" placeholder="SELECT ...">${escapeHtml(r.sql_query || '')}</textarea>
      </div>

      <div>
        <label class="text-sm text-zinc-500">Message Template</label>
        <textarea id="f-msg" class="input min-h-28 w-full" placeholder="Hi {{first_name}} ...">${escapeHtml(r.message_template || '')}</textarea>
        <div class="mt-2">
          <div class="text-sm text-zinc-500">Available placeholders (student)</div>
          <div class="flex flex-wrap gap-2 mt-1">
            ${renderPlaceholderPills(STUDENT_TEMPLATE_FIELDS)}
          </div>
          <div class="text-xs text-zinc-500 mt-1">Use like {{first_name}}. Only fields returned by your SQL are available.</div>
        </div>
      </div>

      <div class="grid md:grid-cols-3 gap-4">
        <div>
          <label class="text-sm text-zinc-500">PDF File Name (optional)</label>
          <input id="f-pdf" class="input h-11 w-full" value="${escapeHtml(r.pdf_path || '')}">
        </div>
        <div>
          <label class="text-sm text-zinc-500">Image File Name (optional)</label>
          <input id="f-img" class="input h-11 w-full" value="${escapeHtml(r.image_path || '')}">
        </div>
        <div class="flex items-center gap-2 mt-6">
          <input id="f-active" type="checkbox" ${bool(r.active)?'checked':''}>
          <label for="f-active">Active</label>
        </div>
      </div>

      <div class="flex gap-2">
        <button id="btnSave" class="btn btn-primary h-11" type="submit">Save</button>
        <button id="btnCancel" class="btn h-11" type="button">Cancel</button>
      </div>
    </form>`;

    // Hook cron editor
    hookCronMode(prefix);
    cronToUi(r.cron_expr || '* * * * *', prefix);
    const updatePreview = ()=> $('cron-preview').textContent = uiToCron(prefix);
    ['min','hour','dom','mon','dow'].forEach(k=>{
      [`${prefix}-${k}-mode`, `${prefix}-${k}-every`, `${prefix}-${k}-list`].forEach(id=>{
        $(id).addEventListener('input', updatePreview);
        $(id).addEventListener('change', updatePreview);
      });
    });
    updatePreview();

    $('btnCancel').onclick = ()=>{
        if (r.id) return renderWhatsAppSchedulerDetail(r.id);
        location.hash = '#/scheduler';
    };

    $('frm').onsubmit = async (e)=>{
      e.preventDefault();
      const payload = {
        name: $('f-name').value.trim(),
        cron_expr: uiToCron(prefix),
        timezone: $('f-tz').value.trim() || 'Asia/Hong_Kong',
        sql_query: $('f-sql').value.trim(),
        message_template: $('f-msg').value.trim(),
        pdf_path: $('f-pdf').value.trim() || null,
        image_path: $('f-img').value.trim() || null,
        active: $('f-active').checked,
      };
      const errs = validateSchedule(payload);
      if (errs.length){ return toast(errs[0],'error'); }

      let resp;
      if (isNew){
        resp = await supabase.from('whatsapp_schedules').insert(payload).select('*').single();
      } else {
        resp = await supabase.from('whatsapp_schedules').update(payload).eq('id', r.id).select('*').single();
      }
      if (resp.error) return toast(resp.error.message,'error');
      toast('Saved.','success');
      const saved = resp.data;
      location.hash = `#/scheduler/${encodeURIComponent(saved.id)}`;
    };
  }
}
