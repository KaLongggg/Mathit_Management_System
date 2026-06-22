// /js/views/studentDetail.js
import { supabase } from '../supabaseClient.js';
import { el, showApp, escapeHtml } from '../ui.js';

export async function renderStudentDetail(id){
  showApp();
  el.view.innerHTML = `<div class="card p-6">Loading student ${escapeHtml(id)}…</div>`;

  const { data: s, error } = await supabase
    .from('student')
    .select('*')
    .eq('student_id', id)
    .single();

  if (error) {
    el.view.innerHTML = `<div class="card p-6 text-red-600">Error: ${escapeHtml(error.message)}</div>`;
    return;
  }

  let editMode = false;

  const render = () => {
    el.view.innerHTML = `
                <section class="card p-6">
            <div class="flex items-start justify-between gap-3 flex-wrap">
            <h2 class="text-xl font-semibold">Student</h2>

            <!-- Right-aligned actions; Edit to the LEFT of Back -->
            <div class="ml-auto flex items-center gap-2">
                <button id="btnEditCommit" class="btn btn-ghost">${editMode ? 'Commit' : 'Edit'}</button>
                <a href="#/students" class="btn btn-ghost">Back</a>
            </div>
            </div>

        <form id="formStudent" class="mt-4 grid sm:grid-cols-2 gap-4 text-sm">
          <!-- ID (always read-only) -->
          <label class="block">
            <span class="block font-medium mb-1">Student ID</span>
            <div class="h-11 flex items-center">${escapeHtml(s.student_id ?? '-')}</div>
          </label>

          <!-- First name -->
          <label class="block">
            <span class="block font-medium mb-1">First name</span>
            ${
              editMode
                ? `<input id="first_name" class="input h-11" value="${escapeHtml(s.first_name ?? '')}" />`
                : `<div class="h-11 flex items-center">${escapeHtml(s.first_name ?? '-')}</div>`
            }
          </label>

          <!-- Last name -->
          <label class="block">
            <span class="block font-medium mb-1">Last name</span>
            ${
              editMode
                ? `<input id="last_name" class="input h-11" value="${escapeHtml(s.last_name ?? '')}" />`
                : `<div class="h-11 flex items-center">${escapeHtml(s.last_name ?? '-')}</div>`
            }
          </label>

          <!-- Email -->
          <label class="block">
            <span class="block font-medium mb-1">Email</span>
            ${
              editMode
                ? `<input id="student_email" type="email" class="input h-11" value="${escapeHtml(s.email ?? '')}" />`
                : `<div class="h-11 flex items-center break-all">${escapeHtml(s.email ?? '-')}</div>`
            }
          </label>

          <!-- Phone -->
          <label class="block">
            <span class="block font-medium mb-1">WhatsApp / Phone</span>
            ${
              editMode
                ? `<input id="phone_number" class="input h-11" value="${escapeHtml(s.phone_number ?? '')}" />`
                : `<div class="h-11 flex items-center">${escapeHtml(s.phone_number ?? '-')}</div>`
            }
          </label>
          
          <!-- DSE Year -->
          <label class="block">
            <span class="block font-medium mb-1">DSE Year</span>
            ${
              editMode
                ? `<input id="dse_year" class="input h-11" value="${escapeHtml(s.dse_year ?? '')}" />`
                : `<div class="h-11 flex items-center">${escapeHtml(s.dse_year ?? '-')}</div>`
            }
          </label>

          <!-- DSE Aim -->
          <label class="block">
            <span class="block font-medium mb-1">DSE Aim</span>
            ${
              editMode
                ? `<input id="dse_aim" class="input h-11" value="${escapeHtml(s.dse_aim ?? '')}" />`
                : `<div class="h-11 flex items-center">${escapeHtml(s.dse_aim ?? '-')}</div>`
            }
          </label>

          <!-- Current Level -->
          <label class="block">
            <span class="block font-medium mb-1">Current Level</span>
            ${
              editMode
                ? `<input id="current_level" class="input h-11" value="${escapeHtml(s.current_level ?? '')}" />`
                : `<div class="h-11 flex items-center">${escapeHtml(s.current_level ?? '-')}</div>`
            }
          </label>
        </form>

        <div id="err" class="mt-3 hidden p-3 rounded-lg bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200 text-sm"></div>
      </section>
   <section class="card p-6 mt-6">
      <div class="flex items-center justify-between gap-3">
        <h3 class="text-lg font-semibold">Enrolments</h3>
        <a id="btnAddEnrol" class="btn btn-primary" href="#/enrolment/new">＋ Add enrolment</a>
      </div>
      <div class="mt-4 overflow-x-auto">
        <table class="min-w-full text-sm">
          <thead>
            <tr class="text-left text-zinc-600 dark:text-zinc-400">
              <th class="py-2 pr-3">Enrolment ID</th>
              <th class="py-2 pr-3">Course ID</th>
              <th class="py-2 pr-3">Course Name</th>
              <th class="py-2 pr-3">Status</th>
              <th class="py-2 pr-3">Completion</th>
              <th class="py-2">Enrolled</th>
            </tr>
          </thead>
          <tbody id="enrolRows">
            <tr><td colspan="6" class="py-6 text-center text-zinc-500">Loading…</td></tr>
          </tbody>
        </table>
      </div>
    </section>
    `;

    // Wire the Edit/Commit button
    const btn = document.getElementById('btnEditCommit');
    const errEl = document.getElementById('err');

    btn.onclick = async (e) => {
      e.preventDefault();
      errEl.classList.add('hidden'); errEl.textContent = '';

      if (!editMode) {
        // Switch to edit mode
        editMode = true;
        render();
        return;
      }

      // Commit mode
      const payload = {
        first_name:   document.getElementById('first_name')?.value ?? s.first_name ?? null,
        last_name:    document.getElementById('last_name')?.value ?? s.last_name ?? null,
        email: (document.getElementById('student_email')?.value || '').trim() || s.email || null,
        phone_number: document.getElementById('phone_number')?.value ?? s.phone_number ?? null,
        dse_year:     document.getElementById('dse_year')?.value ?? s.dse_year ?? null,
        dse_aim:      document.getElementById('dse_aim')?.value ?? s.dse_aim ?? null,
        current_level: document.getElementById('current_level')?.value ?? s.current_level ?? null
      };

      // Optional: tiny email sanity check
      if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
        errEl.textContent = 'Please enter a valid email address.';
        errEl.classList.remove('hidden');
        return;
      }

      const prevHTML = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner mr-2"></span>Saving…';

      const { data, error } = await supabase
        .from('student')
        .update(payload)
        .eq('student_id', id)
        .select()
        .single();

      btn.disabled = false;
      btn.innerHTML = prevHTML;

      if (error) {
        errEl.textContent = error.message || 'Failed to save.';
        errEl.classList.remove('hidden');
        return;
      }

      // Refresh local copy and return to view mode
      Object.assign(s, data);
      editMode = false;
      render();
    };
  };

  render();
  (async function loadEnrolments(){
    const tbody = document.getElementById('enrolRows');
    if (!tbody) return;

    // Try a single query with a relationship (requires FK enrolments.course_id -> course.course_id)
    let { data, error } = await supabase
      .from('enrolments')
      .select(`
        id,
        course_id,
        status,
        percentage_completed,
        enrolled_at,
        course:course_id ( course_name )
      `)
      .eq('student_id', id)
      .order('enrolled_at', { ascending: false });

    // Fallback if the relationship isn't set up
    if (error) {
      // basic fetch
      const res = await supabase
        .from('enrolments')
        .select('id, course_id, status, percentage_completed, enrolled_at')
        .eq('student_id', id)
        .order('enrolled_at', { ascending: false });

      if (res.error) {
        tbody.innerHTML = `<tr><td colspan="6" class="py-6 text-center text-red-600">${escapeHtml(res.error.message)}</td></tr>`;
        return;
      }

      const enrols = res.data || [];

      // build course name map
      const courseIds = [...new Set(enrols.map(e => e.course_id).filter(Boolean))];
      let courseMap = new Map();
      if (courseIds.length) {
        const { data: courseRows } = await supabase
          .from('course')
          .select('course_id, course_name')
          .in('course_id', courseIds);
        (courseRows || []).forEach(c => courseMap.set(c.course_id, c.course_name));
      }

      tbody.innerHTML = enrols.length
        ? enrols.map(rowHtml).join('')
        : `<tr><td colspan="6" class="py-6 text-center text-zinc-500">No enrolments yet.</td></tr>`;

      // attach click nav
      enrols.forEach(e => {
        const tr = document.querySelector(`tr[data-enrol="${CSS.escape(e.id)}"]`);
        if (tr) tr.addEventListener('click', ()=> location.hash = `#/enrolment/${encodeURIComponent(e.id)}`);
      });

      function rowHtml(r){
        const name = courseMap.get(r.course_id) || '-';
        return `
          <tr class="border-t border-zinc-200/70 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer"
              data-enrol="${escapeHtml(r.id)}">
            <td class="py-2 pr-3 font-medium">${escapeHtml(r.id)}</td>
            <td class="py-2 pr-3">${escapeHtml(r.course_id || '-')}</td>
            <td class="py-2 pr-3">${escapeHtml(name)}</td>
            <td class="py-2 pr-3">${escapeHtml(r.status || '-')}</td>
            <td class="py-2 pr-3">${r.percentage_completed != null ? Math.round(r.percentage_completed*100)+'%' : '-'}</td>
            <td class="py-2">${r.enrolled_at ? new Date(r.enrolled_at).toLocaleDateString() : '-'}</td>
          </tr>`;
      }

      return;
    }

    // If single-query with relationship worked:
    const enrols = data || [];
    tbody.innerHTML = enrols.length
      ? enrols.map(r => `
        <tr class="border-t border-zinc-200/70 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer"
            data-enrol="${escapeHtml(r.id)}">
          <td class="py-2 pr-3 font-medium">${escapeHtml(r.id)}</td>
          <td class="py-2 pr-3">${escapeHtml(r.course_id || '-')}</td>
          <td class="py-2 pr-3">${escapeHtml(r.course?.course_name || '-')}</td>
          <td class="py-2 pr-3">${escapeHtml(r.status || '-')}</td>
          <td class="py-2 pr-3">${r.percentage_completed != null ? Math.round(r.percentage_completed*100)+'%' : '-'}</td>
          <td class="py-2">${r.enrolled_at ? new Date(r.enrolled_at).toLocaleDateString() : '-'}</td>
        </tr>
      `).join('')
      : `<tr><td colspan="6" class="py-6 text-center text-zinc-500">No enrolments yet.</td></tr>`;

    // row click → open editor
    enrols.forEach(e => {
      const tr = document.querySelector(`tr[data-enrol="${CSS.escape(e.id)}"]`);
      if (tr) tr.addEventListener('click', ()=> location.hash = `#/enrolment/${encodeURIComponent(e.id)}`);
    });
  })();
}
