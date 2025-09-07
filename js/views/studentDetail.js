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

          <!-- Status -->
          <label class="block">
            <span class="block font-medium mb-1">Status</span>
            ${
              editMode
                ? `<select id="is_active" class="input h-11">
                     <option value="true"  ${s.is_active ? 'selected' : ''}>Active</option>
                     <option value="false" ${!s.is_active ? 'selected' : ''}>Inactive</option>
                   </select>`
                : `<div class="h-11 flex items-center">${s.is_active ? 'Active' : 'Inactive'}</div>`
            }
          </label>

          <!-- Last sign-in (read-only informational) -->
          <label class="block">
            <span class="block font-medium mb-1">Last sign-in</span>
            <div class="h-11 flex items-center">${escapeHtml(s.last_sign_in ?? '-')}</div>
          </label>
        </form>

        <div id="err" class="mt-3 hidden p-3 rounded-lg bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200 text-sm"></div>
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
        is_active:    (document.getElementById('is_active')?.value ?? (s.is_active ? 'true' : 'false')) === 'true'
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
}
