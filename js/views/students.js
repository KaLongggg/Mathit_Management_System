import { supabase } from '../supabaseClient.js';
import { el, showApp, escapeHtml, cssId } from '../ui.js';

export function renderStudents(){
  showApp();
  el.view.innerHTML = `
  <section class="card p-6">
    <h2 class="text-xl font-semibold mb-4">Find Student</h2>
    <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
      <input id="qFirst" class="input h-11" placeholder="First name">
      <input id="qLast"  class="input h-11" placeholder="Last name">
      <input id="qEmail" class="input h-11" placeholder="Email">
      <input id="qPhone" class="input h-11" placeholder="WhatsApp / Phone">
    </div>
    <div class="flex flex-col sm:flex-row gap-2 mb-4">
      <button id="btnStudentSearch" class="btn btn-primary h-11">Search</button>
      <button id="btnStudentClear" class="btn btn-ghost h-11">Clear</button>
    </div>
    <div id="studentResult" class="grid md:grid-cols-2 gap-4"></div>
  </section>`;

  const resEl = document.getElementById('studentResult');

  const search = async ()=>{
    const first = document.getElementById('qFirst').value.trim();
    const last  = document.getElementById('qLast').value.trim();
    const email = document.getElementById('qEmail').value.trim();
    const phone = document.getElementById('qPhone').value.trim();
    resEl.innerHTML = '';

    if(!first && !last && !email && !phone){
      resEl.innerHTML = `<div class="text-zinc-500">Enter at least one field to search.</div>`;
      return;
    }

    let q = supabase.from('student').select('*').limit(50);
    const ors = [];
    if (first) ors.push(`first_name.ilike.%${first.replace(/[,()]/g,"\\$&")}%`);
    if (last)  ors.push(`last_name.ilike.%${last.replace(/[,()]/g,"\\$&")}%`);
    if (email) ors.push(`email.ilike.%${email.replace(/[,()]/g,"\\$&")}%`);
    if (phone) ors.push(`phone_number.ilike.%${phone.replace(/[,()]/g,"\\$&")}%`);
    q = q.or(ors.join(',')).order('last_sign_in', { ascending:false });

    const { data, error } = await q;
    if (error) { resEl.innerHTML = `<div class="text-red-600">${escapeHtml(error.message)}</div>`; return; }
    if (!data?.length) { resEl.innerHTML = `<div class="text-zinc-500">No matching students.</div>`; return; }

    resEl.innerHTML = data.map(s=> studentCard(s)).join('');
    data.forEach(s=>{
      const elCard = document.getElementById(`stu-${cssId(s.student_id)}`);
      elCard && (elCard.onclick = ()=> { location.hash = `#/student/${encodeURIComponent(s.student_id)}`; });
    });
  };

  document.getElementById('btnStudentSearch').onclick = search;
  document.getElementById('btnStudentClear').onclick = ()=>{
    ['qFirst','qLast','qEmail','qPhone'].forEach(id=>document.getElementById(id).value='');
    resEl.innerHTML = '';
  };
}

function studentCard(s){
  return `
  <div id="stu-${cssId(s.student_id)}" class="card p-5 hover:ring-2 hover:ring-brand-teal/60 transition cursor-pointer">
    <div class="flex items-start justify-between gap-4">
      <div>
        <div class="text-lg font-semibold">${escapeHtml(s.first_name)} ${escapeHtml(s.last_name)}</div>
        <div class="text-sm text-zinc-600 dark:text-zinc-400">${escapeHtml(s.email ?? '')}</div>
      </div>
      <div>${s.is_active?'<span class="pill pill-green">Active</span>':'<span class="pill pill-red">Inactive</span>'}</div>
    </div>
    <div class="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
      <span class="mr-4">ID: ${escapeHtml(s.student_id)}</span>
      <span>WhatsApp: ${escapeHtml(s.phone_number ?? '-')}</span>
    </div>
  </div>`;
}
