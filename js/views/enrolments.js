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
        <input id="q" class="input h-11 flex-1" placeholder="Search by enrolment ID, student ID, course ID">
        <button id="btnSearch" class="btn btn-primary h-11">Search</button>
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
            <th class="py-2 pr-3">Completion</th>
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
    let q = supabase
      .from('enrolments')
      .select('id, student_id, course_id, course_name, user_name, status, percentage_completed, enrolled_at')
      .order('enrolled_at', { ascending:false })
      .limit(200);

    if (term){
      const safe = term.replace(/[,()]/g, '\\$&');
      q = q.or([
        `id.ilike.%${safe}%`,
        `student_id.ilike.%${safe}%`,
        `course_id.ilike.%${safe}%`,
        `user_name.ilike.%${safe}%`,
      ].join(','));
    }

    const { data, error } = await q;
    if (error){
      rowsEl.innerHTML = `<tr><td colspan="6" class="py-6 text-center text-red-600">${escapeHtml(error.message)}</td></tr>`;
      return;
    }
    if (!data?.length){
      rowsEl.innerHTML = `<tr><td colspan="6" class="py-6 text-center text-zinc-500">No enrolments found.</td></tr>`;
      return;
    }

    rowsEl.innerHTML = data.map(r => `
      <tr class="border-t border-zinc-200/70 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer"
          data-id="${escapeHtml(r.id)}">
        <td class="py-2 pr-3 font-medium">${escapeHtml(r.id)}</td>
        <td class="py-2 pr-3">${escapeHtml(r.user_name || r.student_id || '-')}</td>
        <td class="py-2 pr-3">${escapeHtml(r.course_name || r.course_id || '-')}</td>
        <td class="py-2 pr-3">${escapeHtml(r.status ?? '-')}</td>
        <td class="py-2 pr-3">${pct(r.percentage_completed)}</td>
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

  load();
}

function pct(v){
  if (v == null) return '-';
  return `${Math.round(Number(v) * 100)}%`;
}

/* ------------------------- DETAIL (read-only) ------------------------- */
export async function renderEnrolmentEditor(enrolId){
  showApp();
  if (!enrolId || enrolId === 'new'){
    el.view.innerHTML = `<div class="card p-6">Enrolments are synced from Thinkific and can't be created here.
      <a href="#/enrolments" class="text-indigo-600 hover:underline">Back to enrolments</a>.</div>`;
    return;
  }

  const { data: rec, error } = await supabase
    .from('enrolments').select('*').eq('id', enrolId).maybeSingle();
  if (error){
    el.view.innerHTML = `<div class="card p-6 text-red-600">Load error: ${escapeHtml(error.message)}</div>`;
    return;
  }
  if (!rec){
    el.view.innerHTML = `<div class="card p-6 text-red-600">Enrolment not found.</div>`;
    return;
  }

  el.view.innerHTML = `
  <div class="mb-4">
    <a href="#/enrolments" class="text-sm text-zinc-600 hover:underline">&larr; Back to enrolments</a>
  </div>

  <section class="card p-6">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-xl font-semibold">Enrolment ${escapeHtml(rec.id)}</h2>
      <span class="pill pill-green">Synced from Thinkific</span>
    </div>

    <div class="grid md:grid-cols-2 gap-4 text-sm">
      ${field('Student', rec.user_name)}
      ${field('Student ID', rec.student_id)}
      ${field('Email', rec.user_email)}
      ${field('Course', rec.course_name)}
      ${field('Course ID', rec.course_id)}
      ${field('Status', rec.status)}
      ${field('Completion', pct(rec.percentage_completed))}
      ${field('Enrolled at', rec.enrolled_at)}
      ${field('Activated at', rec.activated_at)}
      ${field('Started at', rec.started_at)}
      ${field('Completed', rec.completed ? 'Yes' : 'No')}
      ${field('Completed at', rec.completed_at)}
      ${field('Expired', rec.expired ? 'Yes' : 'No')}
      ${field('Expiry date', rec.expiry_date)}
      ${field('Free trial', rec.is_free_trial ? 'Yes' : 'No')}
      ${field('Updated at', rec.updated_at)}
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
