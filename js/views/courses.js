import { supabase } from '../supabaseClient.js';
import { el, showApp, fmtMoney, escapeHtml } from '../ui.js';

export function renderCourses(){
  showApp();
  el.view.innerHTML = `
  <section class="card p-6">
    <div class="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
      <h2 class="text-xl font-semibold">Courses</h2>
      <div class="sm:ml-auto flex gap-2 w-full sm:w-auto">
        <input id="qCourse" class="input h-11 flex-1" placeholder="Search by name or ID...">
        <button id="btnCourseSearch" class="btn btn-primary h-11">Search</button>
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
    let q = supabase.from('course').select('course_id,course_name,year,duration,price,free_course,create_date')
      .order('create_date',{ascending:false}).limit(200);
    if(term) q = q.or(`course_name.ilike.%${term}%,course_id.ilike.%${term}%`);
    const { data, error } = await q;
    if(error){ rowsEl.innerHTML = `<tr><td colspan="7" class="py-6 text-center text-red-600">${escapeHtml(error.message)}</td></tr>`; return; }
    if(!data?.length){ rowsEl.innerHTML = `<tr><td colspan="7" class="py-6 text-center text-zinc-500">No courses found.</td></tr>`; return; }
    rowsEl.innerHTML = data.map(c=>`
      <tr class="border-t border-zinc-200/70 dark:border-zinc-800">
        <td class="py-2 font-medium">${c.course_id}</td>
        <td class="py-2">${escapeHtml(c.course_name)}</td>
        <td class="py-2">${c.year ?? '-'}</td>
        <td class="py-2">${c.duration ?? '-'}</td>
        <td class="py-2">${fmtMoney(Number(c.price))}</td>
        <td class="py-2">${c.free_course?'<span class="pill pill-green">Free</span>':'<span class="pill pill-red">Paid</span>'}</td>
        <td class="py-2">${c.create_date ?? '-'}</td>
      </tr>`).join('');
  };

  document.getElementById('btnCourseSearch').onclick = ()=> load(document.getElementById('qCourse').value.trim());
  document.getElementById('qCourse').addEventListener('keydown', e=>{ if(e.key==='Enter') document.getElementById('btnCourseSearch').click(); });

  load();
}
