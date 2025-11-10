// views/enrolments.js
import { supabase } from '../supabaseClient.js';
import { el, showApp, escapeHtml } from '../ui.js';

/* ----------------------------- LIST PAGE ----------------------------- */
export function renderEnrolments(){
  showApp();
  el.view.innerHTML = `
  <section class="card p-6">
    <div class="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
      <h2 class="text-xl font-semibold">Enrolments</h2>
      <div class="sm:ml-auto flex gap-2 w-full sm:w-auto">
        <input id="q" class="input h-11 flex-1" placeholder="Search by enrolment ID, student, course, email, phone">
        <button id="btnSearch" class="btn btn-primary h-11">Search</button>
        <button id="btnAdd" class="btn btn-ghost h-11" title="Add enrolment">＋ Add</button>
      </div>
    </div>

    <div class="overflow-x-auto">
      <table class="min-w-full text-sm">
        <thead>
          <tr class="text-left text-zinc-600 dark:text-zinc-400">
            <th class="py-2 pr-3">Enrolment ID</th>
            <th class="py-2 pr-3">Student</th>
            <th class="py-2 pr-3">Course</th>
            <th class="py-2 pr-3">Status</th>
            <th class="py-2 pr-3">Delivery</th>
            <th class="py-2">Enrolled</th>
          </tr>
        </thead>
        <tbody id="rows"></tbody>
      </table>
    </div>
  </section>`;

  const rowsEl = document.getElementById('rows');

  const load = async (term='')=>{
    rowsEl.innerHTML = '';
    // Adjust select columns to match your schema
    let q = supabase
      .from('enrolments')
      .select('id, student_id, course_id, status, enrolled_at, delivery_mode, notes')
      .order('enrolled_at', { ascending:false })
      .limit(200);

    if (term){
      const safe = term.replace(/[,()]/g, '\\$&');
      q = q.or([
        `id.ilike.%${safe}%`,
        `student_id.ilike.%${safe}%`,
        `course_id.ilike.%${safe}%`,
        `delivery_mode.ilike.%${safe}%`,
      ].join(','));
    }

    const { data, error } = await q;
    if (error){
      rowsEl.innerHTML = `<tr><td colspan="7" class="py-6 text-center text-red-600">${escapeHtml(error.message)}</td></tr>`;
      return;
    }
    if (!data?.length){
      rowsEl.innerHTML = `<tr><td colspan="7" class="py-6 text-center text-zinc-500">No enrolments found.</td></tr>`;
      return;
    }

    // fetch names in bulk (optional; small datasets ok to do naively)
    const studentIds = [...new Set(data.map(r=>r.student_id).filter(Boolean))];
    const courseIds  = [...new Set(data.map(r=>r.course_id).filter(Boolean))];

    const [studMap, courseMap] = await Promise.all([
      fetchStudentsMap(studentIds),
      fetchCoursesMap(courseIds),
    ]);

    rowsEl.innerHTML = data.map(r => `
      <tr class="border-t border-zinc-200/70 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer"
          data-id="${escapeHtml(r.id)}">
        <td class="py-2 pr-3 font-medium">${escapeHtml(r.id)}</td>
        <td class="py-2 pr-3">
          ${escapeHtml(studMap.get(r.student_id)?.name || r.student_id || '-')}
          <div class="text-xs text-zinc-500">${escapeHtml(studMap.get(r.student_id)?.phone_number || '')}</div>
        </td>
        <td class="py-2 pr-3">${escapeHtml(courseMap.get(r.course_id)?.name || r.course_id || '-')}</td>
        <td class="py-2 pr-3">${escapeHtml(r.status ?? '-')}</td>
        <td class="py-2 pr-3">${escapeHtml((r.delivery_mode||'').toString())}</td>
        <td class="py-2">${r.enrolled_at ? new Date(r.enrolled_at).toLocaleDateString() : '-'}</td>
      </tr>
    `).join('');

    rowsEl.querySelectorAll('tr[data-id]').forEach(tr=>{
      tr.addEventListener('click', ()=>{
        const id = tr.getAttribute('data-id');
        location.hash = `#/enrolment/${encodeURIComponent(id)}`;
      });
    });
  };

  document.getElementById('btnSearch').onclick = ()=> load(document.getElementById('q').value.trim());
  document.getElementById('q').addEventListener('keydown', e=>{
    if (e.key==='Enter') document.getElementById('btnSearch').click();
  });
  document.getElementById('btnAdd').onclick = ()=> location.hash = '#/enrolment/new';

  load();
}

async function fetchStudentsMap(ids){
  const map = new Map();
  if (!ids.length) return map;
  const { data, error } = await supabase.from('student')
    .select('student_id, first_name, last_name, email, phone_number')
    .in('student_id', ids);
  if (!error && data) {
    for (const s of data) {
      map.set(s.student_id, { name: `${s.first_name||''} ${s.last_name||''}`.trim(), email: s.email||'',phone_number: s.phone_number||'' });
    }
  }
  return map;
}
async function fetchCoursesMap(ids){
  const map = new Map();
  if (!ids.length) return map;
  const { data, error } = await supabase.from('course')
    .select('course_id, course_name')
    .in('course_id', ids);
  if (!error && data) {
    for (const c of data) map.set(c.course_id, { name: c.course_name });
  }
  return map;
}

/* ---------------------------- EDITOR PAGE ---------------------------- */
export async function renderEnrolmentEditor(enrolId){
  showApp();
  const isNew = !enrolId || enrolId === 'new';

  let rec = {
    id: '',
    student_id: '',
    course_id: '',
    status: 'pending',
    enrolled_at: new Date().toISOString(),
    delivery_mode: 'Online',
    notes: ''
  };

  if (!isNew){
    const { data, error } = await supabase
      .from('enrolments')
      .select('*')
      .eq('id', enrolId)
      .maybeSingle();
    if (error){
      el.view.innerHTML = `<div class="card p-6 text-red-600">Load error: ${escapeHtml(error.message)}</div>`;
      return;
    }
    if (!data){
      el.view.innerHTML = `<div class="card p-6 text-red-600">Enrolment not found.</div>`;
      return;
    }
    rec = data;
  }

  el.view.innerHTML = `
  <div class="mb-4">
    <a href="#/enrolments" class="text-sm text-zinc-600 hover:underline">&larr; Back to enrolments</a>
  </div>

  <section class="card p-6">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-xl font-semibold">${isNew ? 'Add Enrolment' : 'Edit Enrolment'}</h2>
      ${!isNew ? `<button id="btnDelete" class="btn btn-danger">Delete</button>` : ''}
    </div>

    <div class="grid md:grid-cols-2 gap-4">
      ${input('Enrolment ID', 'id', rec.id, false, isNew ? '' : 'disabled')}

      <div class="grid grid-cols-[1fr_auto] gap-2">
        ${input('Student ID', 'student_id', rec.student_id)}
        <button id="pickStudent" class="btn btn-ghost">Pick</button>
      </div>

      <div class="grid grid-cols-[1fr_auto] gap-2">
        ${input('Course ID', 'course_id', rec.course_id)}
        <button id="pickCourse" class="btn btn-ghost">Pick</button>
      </div>
      <label class="block">
        <span class="block text-sm font-medium mb-1">Status</span>
        <select id="status" class="input">
          ${opt('Pending', rec.delivery_mode)}
          ${opt('Confirmed', rec.delivery_mode)}
          ${opt('Cancelled', rec.delivery_mode)}
        </select>
      </label>

      ${input('Enrolled at', 'enrolled_at', rec.enrolled_at)}

      <label class="block">
        <span class="block text-sm font-medium mb-1">Delivery Mode</span>
        <select id="delivery_mode" class="input">
          ${opt('Video', rec.delivery_mode)}
          ${opt('Mong Kok', rec.delivery_mode)}
          ${opt('Tuen Mun', rec.delivery_mode)}
          ${opt('Group', rec.delivery_mode)}
        </select>
      </label>

      <label class="block md:col-span-2">
        <span class="block text-sm font-medium mb-1">Notes</span>
        <textarea id="notes" class="input" rows="4" placeholder="Notes...">${escapeHtml(rec.notes||'')}</textarea>
      </label>
    </div>

    <div class="pt-4 flex gap-2">
      <button id="btnSave" class="btn btn-primary">Save</button>
      <span id="saveMsg" class="text-sm text-zinc-500 hidden">Saved ✓</span>
    </div>
  </section>

  <!-- Simple picker panel -->
  <div id="pickerPanel" class="fixed inset-0 hidden bg-black/30 z-50">
    <div class="absolute inset-0 flex items-start justify-center pt-20 px-4">
      <div class="card p-4 w-full max-w-2xl bg-white dark:bg-zinc-900">
        <div class="flex items-center gap-2 mb-3">
          <input id="pickerQuery" class="input flex-1" placeholder="Search…">
          <button id="pickerClose" class="btn btn-ghost">Close</button>
        </div>
        <div id="pickerList" class="max-h-[60vh] overflow-auto divide-y divide-zinc-200 dark:divide-zinc-800"></div>
      </div>
    </div>
  </div>`;

  /* ---------- handlers ---------- */
  document.getElementById('btnSave').onclick = save;
  if (!isNew) {
    const del = document.getElementById('btnDelete');
    del && (del.onclick = async ()=>{
      if(!confirm('Delete this enrolment?')) return;
      const { error } = await supabase.from('enrolments').delete().eq('id', enrolId);
      if (error) return alert(error.message);
      location.hash = '#/enrolments';
    });
  }

  document.getElementById('pickCourse').onclick = ()=> openPicker('course');
  document.getElementById('pickStudent').onclick = ()=> openPicker('student');

  async function save(){
    const payload = {
      id:           val('id'),
      student_id:   val('student_id'),
      course_id:    val('course_id'),
      status:       val('status') || 'pending',
      enrolled_at:  val('enrolled_at') || null,
      delivery_mode: document.getElementById('delivery_mode').value,
      notes:        (document.getElementById('notes')?.value ?? null)
    };

    if (!payload.id)       return alert('Enrolment ID is required');
    if (!payload.student_id) return alert('Student is required');
    if (!payload.course_id)  return alert('Course is required');

    let error;
    if (isNew){
      ({ error } = await supabase.from('enrolments').insert(payload));
    } else {
      ({ error } = await supabase.from('enrolments').update(payload).eq('id', enrolId));
    }
    const msg = document.getElementById('saveMsg');
    if (error){ msg.textContent = 'Error: ' + error.message; msg.classList.remove('hidden'); msg.classList.add('text-red-600'); }
    else { msg.textContent = 'Saved ✓'; msg.classList.remove('hidden'); msg.classList.remove('text-red-600'); setTimeout(()=>msg.classList.add('hidden'),1400); }
  }

  /* ---------- picker ---------- */
  let pickerMode = null; // 'course' | 'student'
  const panel = document.getElementById('pickerPanel');
  const list  = document.getElementById('pickerList');
  const query = document.getElementById('pickerQuery');
  document.getElementById('pickerClose').onclick = ()=> panel.classList.add('hidden');

  function openPicker(mode){
    pickerMode = mode;
    query.value = '';
    list.innerHTML = '';
    panel.classList.remove('hidden');
    query.focus();
    doSearch('');
  }

  async function doSearch(term){
    if (pickerMode === 'course'){
      let q = supabase.from('course').select('course_id,course_name').limit(30);
      if (term){
        const s = term.replace(/[,()]/g,'\\$&');
        q = q.or(`course_id.ilike.%${s}%,course_name.ilike.%${s}%`);
      }
      const { data } = await q;
      renderList((data||[]).map(c => ({
        id: c.course_id,
        line1: c.course_name,
        line2: `ID: ${c.course_id}`
      })), (item)=>{ document.getElementById('course_id').value = item.id; panel.classList.add('hidden'); });
    } else {
      let q = supabase.from('student').select('student_id,first_name,last_name,email,phone_number').limit(30);
      if (term){
        const s = term.replace(/[,()]/g,'\\$&');
        q = q.or([
          `student_id.ilike.%${s}%`,
          `first_name.ilike.%${s}%`,
          `last_name.ilike.%${s}%`,
          `email.ilike.%${s}%`,
          `phone_number.ilike.%${s}%`,
        ].join(','));
      }
      const { data } = await q;
      renderList((data||[]).map(st => ({
        id: st.student_id,
        line1: `${st.first_name||''} ${st.last_name||''}`.trim() || st.student_id,
        line2: [st.email, st.phone_number].filter(Boolean).join(' · ')
      })), (item)=>{ document.getElementById('student_id').value = item.id; panel.classList.add('hidden'); });
    }
  }
  query.addEventListener('input', e=> doSearch(e.target.value.trim()));

  function renderList(items, onPick){
    list.innerHTML = items.length ? items.map(it => `
      <button class="w-full text-left px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800">
        <div class="font-medium">${escapeHtml(it.line1)}</div>
        <div class="text-xs text-zinc-500">${escapeHtml(it.line2||'')}</div>
        <div class="text-xs text-zinc-500">ID: ${escapeHtml(it.id)}</div>
      </button>
    `).join('') : `<div class="p-3 text-zinc-500">No results.</div>`;
    // attach handlers
    let i = 0;
    list.querySelectorAll('button').forEach(btn=>{
      const item = items[i++];
      btn.onclick = ()=> onPick(item);
    });
  }

  /* ---------- helpers ---------- */
  function input(label,id,value='',placeholder='',extra=''){
    const disabled = extra==='disabled';
    return `
      <label class="block">
        <span class="block text-sm font-medium mb-1">${label}</span>
        <input id="${id}" class="input" ${disabled?'disabled':''} value="${escapeHtml(value||'')}" placeholder="${escapeHtml(placeholder||'')}">
      </label>`;
  }
  function opt(val, cur){ return `<option ${cur===val?'selected':''}>${val}</option>`; }
  function val(id){ return (document.getElementById(id)?.value ?? '').trim(); }
}
