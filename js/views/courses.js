// courses.js
import { supabase } from '../supabaseClient.js';
import { el, showApp, fmtMoney, escapeHtml } from '../ui.js';

// ---------- LIST ----------
export function renderCourses(){
  showApp();
  el.view.innerHTML = `
  <section class="card p-6">
    <div class="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
      <h2 class="text-xl font-semibold">Courses</h2>
      <div class="sm:ml-auto flex gap-2 w-full sm:w-auto">
        <input id="qCourse" class="input h-11 flex-1" placeholder="Search by name or ID...">
        <button id="btnCourseSearch" class="btn btn-primary h-11">Search</button>
        <button id="btnCourseAdd" class="btn btn-ghost h-11" title="Add course">＋ Add</button>
      </div>
    </div>

    <div class="overflow-x-auto">
      <table class="min-w-full text-sm">
        <thead>
          <tr class="text-left text-zinc-600 dark:text-zinc-400">
            <th class="py-2">ID</th><th class="py-2">Name</th><th class="py-2">Year</th>
            <th class="py-2">Duration</th><th class="py-2">Price</th><th class="py-2">Free</th><th class="py-2">Created</th>
          </tr>
        </thead>
        <tbody id="courseRows"></tbody>
      </table>
    </div>
  </section>`;

  const rowsEl = document.getElementById('courseRows');

  const load = async (term='')=>{
    rowsEl.innerHTML = '';
    let q = supabase
      .from('course')
      .select('course_id,course_name,year,duration,price,free_course,create_date')
      .order('create_date',{ascending:false})
      .limit(200);
    if(term) q = q.or(`course_name.ilike.%${term}%,course_id.ilike.%${term}%`);

    const { data, error } = await q;
    if(error){
      rowsEl.innerHTML = `<tr><td colspan="7" class="py-6 text-center text-red-600">${escapeHtml(error.message)}</td></tr>`;
      return;
    }
    if(!data?.length){
      rowsEl.innerHTML = `<tr><td colspan="7" class="py-6 text-center text-zinc-500">No courses found.</td></tr>`;
      return;
    }

    rowsEl.innerHTML = data.map(c=>`
      <tr class="border-t border-zinc-200/70 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer"
          data-id="${escapeHtml(c.course_id)}">
        <td class="py-2 font-medium">${c.course_id}</td>
        <td class="py-2">${escapeHtml(c.course_name)}</td>
        <td class="py-2">${c.year ?? '-'}</td>
        <td class="py-2">${c.duration ?? '-'}</td>
        <td class="py-2">${fmtMoney(Number(c.price))}</td>
        <td class="py-2">${c.free_course?'<span class="pill pill-green">Free</span>':'<span class="pill pill-red">Paid</span>'}</td>
        <td class="py-2">${c.create_date ?? '-'}</td>
      </tr>`).join('');

    // row click → editor
    rowsEl.querySelectorAll('tr[data-id]').forEach(tr=>{
      tr.addEventListener('click', ()=>{
        const id = tr.getAttribute('data-id');
        // navigate with your router (hash route):
        location.hash = `#/course/${encodeURIComponent(id)}`;
      });
    });
  };

  document.getElementById('btnCourseSearch').onclick = ()=> load(document.getElementById('qCourse').value.trim());
  document.getElementById('qCourse').addEventListener('keydown', e=>{
    if(e.key==='Enter') document.getElementById('btnCourseSearch').click();
  });

  // Add → go to editor in "create" mode
  document.getElementById('btnCourseAdd').onclick = ()=>{
    location.hash = '#/course/new';
  };

  load();
}

// ---------- EDITOR ----------
export async function renderCourseEditor(courseId){
  showApp();

  const isNew = !courseId || courseId === 'new';
  let course = {
    course_id: '',
    course_name: '',
    year: null,
    duration: null,
    price: null,
    form: null,
    create_date: null,
    url: null,
    free_course: false
  };

  if(!isNew){
    const { data, error } = await supabase
      .from('course')
      .select('*')
      .eq('course_id', courseId)
      .single();
    if (error){
      el.view.innerHTML = `<div class="card p-6 text-red-600">Course not found: ${escapeHtml(error.message)}</div>`;
      return;
    }
    course = data;
  }

  el.view.innerHTML = `
  <div class="mb-4">
    <a href="#/courses" class="text-sm text-zinc-600 hover:underline">&larr; Back to courses</a>
  </div>

  <section class="card p-6">
    <div class="grid md:grid-cols-2 gap-4">
      ${inputRow('Course ID','course_id', course.course_id, !isNew)}
      ${inputRow('Course Name','course_name', course.course_name)}
      ${inputRow('Year','year', course.year ?? '')}
      ${inputRow('Duration','duration', course.duration ?? '', 'number')}
      ${inputRow('Price','price', course.price ?? '', 'number', 'step="0.01"')}
      ${inputRow('Form','form', course.form ?? '')}
      ${inputRow('Create Date (YYYY-MM-DD)','create_date', course.create_date ?? '')}
      ${inputRow('URL','url', course.url ?? '')}
      <label class="inline-flex items-center gap-2 mt-2">
        <input id="free_course" type="checkbox" class="h-4 w-4" ${course.free_course ? 'checked':''}>
        <span class="text-sm">Free course</span>
      </label>
    </div>

    <div class="pt-4 flex gap-2">
      <button id="btnSave" class="btn btn-primary">Save</button>
      <span id="saveMsg" class="text-sm text-zinc-500 hidden">Saved ✓</span>
    </div>
  </section>`;

  // handlers
  document.getElementById('btnSave').onclick = async ()=>{
    const payload = {
      course_id: getVal('course_id'),
      course_name: getVal('course_name'),
      year: toNull(getVal('year')),
      duration: toNumOrNull(getVal('duration')),
      price: toNumOrNull(getVal('price')),
      form: toNull(getVal('form')),
      create_date: toNull(getVal('create_date')),
      url: toNull(getVal('url')),
      free_course: document.getElementById('free_course').checked
    };

    if(!payload.course_id){ alert('Course ID is required'); return; }
    if(!payload.course_name){ alert('Course name is required'); return; }

    let error;
    if (isNew){
      ({ error } = await supabase.from('course').insert(payload));
    } else {
      // Do not allow changing PK here; if they changed it, do an upsert then delete old
      if(payload.course_id !== courseId){
        // upsert new id
        const { error: e1 } = await supabase.from('course').upsert(payload);
        if(e1){ alert(e1.message); return; }
        // delete old record
        const { error: e2 } = await supabase.from('course').delete().eq('course_id', courseId);
        if(e2){ alert(e2.message); return; }
        location.hash = `#/course/${encodeURIComponent(payload.course_id)}`;
        return;
      } else {
        ({ error } = await supabase.from('course').update(payload).eq('course_id', courseId));
      }
    }

    const msg = document.getElementById('saveMsg');
    if (error){ msg.textContent = 'Error: ' + error.message; msg.classList.remove('hidden'); msg.classList.add('text-red-600'); }
    else { msg.textContent = 'Saved ✓'; msg.classList.remove('hidden'); msg.classList.remove('text-red-600'); setTimeout(()=>msg.classList.add('hidden'),1400); }
  };

  if (!isNew){
    const delBtn = document.getElementById('btnDelete');
    if (delBtn){
      delBtn.onclick = async ()=>{
        if(!confirm('Delete this course?')) return;
        const { error } = await supabase.from('course').delete().eq('course_id', courseId);
        if (error){ alert(error.message); return; }
        location.hash = '#/courses';
      };
    }
  }

  // helpers
  function inputRow(label, id, val='', disabled=false, extra=''){
    let typeAttr = 'text';
    if (disabled === 'number'){ typeAttr = 'number'; disabled = false; extra = extra || ''; }
    else if (typeof extra === 'string' && extra.startsWith('step')) { typeAttr = 'number'; }
    return `
      <label class="block">
        <span class="block text-sm font-medium mb-1">${label}</span>
        <input id="${id}" ${extra||''} type="${typeAttr}" class="input" ${disabled?'disabled':''} value="${val ?? ''}">
      </label>`;
  }
  function getVal(id){ return (document.getElementById(id)?.value ?? '').trim(); }
  function toNumOrNull(v){ const n = Number(v); return isNaN(n) ? null : n; }
  function toNull(v){ return v ? v : null; }
}
