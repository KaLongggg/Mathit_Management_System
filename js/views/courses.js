// courses.js
import { supabase } from '../supabaseClient.js';
import { el, showApp, escapeHtml } from '../ui.js';

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
      </div>
    </div>

    <div class="overflow-x-auto">
      <table class="min-w-full text-sm">
        <thead>
          <tr class="text-left text-zinc-600 dark:text-zinc-400">
            <th class="py-2">ID</th><th class="py-2">Name</th><th class="py-2">Subtitle</th>
            <th class="py-2">Slug</th><th class="py-2">Product ID</th>
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
      .select('course_id,course_name,subtitle,slug,product_id')
      .order('course_name',{ascending:true})
      .limit(300);
    if(term) q = q.or(`course_name.ilike.%${term}%,course_id.ilike.%${term}%`);

    const { data, error } = await q;
    if(error){
      rowsEl.innerHTML = `<tr><td colspan="5" class="py-6 text-center text-red-600">${escapeHtml(error.message)}</td></tr>`;
      return;
    }
    if(!data?.length){
      rowsEl.innerHTML = `<tr><td colspan="5" class="py-6 text-center text-zinc-500">No courses found.</td></tr>`;
      return;
    }

    rowsEl.innerHTML = data.map(c=>`
      <tr class="border-t border-zinc-200/70 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer"
          data-id="${escapeHtml(c.course_id)}">
        <td class="py-2 font-medium">${escapeHtml(c.course_id)}</td>
        <td class="py-2">${escapeHtml(c.course_name)}</td>
        <td class="py-2">${escapeHtml(c.subtitle ?? '-')}</td>
        <td class="py-2">${escapeHtml(c.slug ?? '-')}</td>
        <td class="py-2">${escapeHtml(c.product_id ?? '-')}</td>
      </tr>`).join('');

    rowsEl.querySelectorAll('tr[data-id]').forEach(tr=>{
      tr.addEventListener('click', ()=>{
        const id = tr.getAttribute('data-id');
        location.hash = `#/course/${encodeURIComponent(id)}`;
      });
    });
  };

  document.getElementById('btnCourseSearch').onclick = ()=> load(document.getElementById('qCourse').value.trim());
  document.getElementById('qCourse').addEventListener('keydown', e=>{
    if(e.key==='Enter') document.getElementById('btnCourseSearch').click();
  });

  load();
}

// ---------- DETAIL (read-only; synced from Thinkific) ----------
export async function renderCourseEditor(courseId){
  showApp();

  if(!courseId || courseId === 'new'){
    el.view.innerHTML = `<div class="card p-6">Courses are synced from Thinkific and can't be created here.
      <a href="#/courses" class="text-indigo-600 hover:underline">Back to courses</a>.</div>`;
    return;
  }

  const { data: course, error } = await supabase
    .from('course')
    .select('*')
    .eq('course_id', courseId)
    .single();
  if (error){
    el.view.innerHTML = `<div class="card p-6 text-red-600">Course not found: ${escapeHtml(error.message)}</div>`;
    return;
  }

  el.view.innerHTML = `
  <div class="mb-4">
    <a href="#/courses" class="text-sm text-zinc-600 hover:underline">&larr; Back to courses</a>
  </div>

  <section class="card p-6">
    <div class="flex items-center gap-3 mb-4">
      ${course.course_card_image_url ? `<img src="${escapeHtml(course.course_card_image_url)}" alt="" class="h-16 w-16 rounded-lg object-cover">` : ''}
      <div>
        <h2 class="text-xl font-semibold">${escapeHtml(course.course_name ?? '')}</h2>
        <p class="text-sm text-zinc-500">${escapeHtml(course.subtitle ?? '')}</p>
      </div>
      <span class="ml-auto pill pill-green">Synced from Thinkific</span>
    </div>

    <div class="grid md:grid-cols-2 gap-4 text-sm">
      ${field('Course ID', course.course_id)}
      ${field('Product ID', course.product_id)}
      ${field('Slug', course.slug)}
      ${field('Instructor ID', course.instructor_id)}
      ${field('Keywords', course.keywords)}
    </div>

    <div class="mt-4">
      <span class="block text-sm font-medium mb-1">Description</span>
      <div class="whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">${escapeHtml(course.description ?? '-')}</div>
    </div>
  </section>`;

  function field(label, val){
    return `
      <label class="block">
        <span class="block text-sm font-medium mb-1">${label}</span>
        <div class="input bg-zinc-50 dark:bg-zinc-800/50">${escapeHtml((val ?? '-').toString())}</div>
      </label>`;
  }
}
