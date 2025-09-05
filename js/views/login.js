import { supabase } from '../supabaseClient.js';
import { el, showAuth } from '../ui.js';

export function renderLogin() {
  showAuth();
  // Wire the existing login form buttons/fields already in your HTML:
  const btn = document.getElementById('btnSignIn');
  const err = document.getElementById('authError');

  btn?.addEventListener('click', async (e)=>{
    e.preventDefault();
    const email = (document.getElementById('email')?.value || '').trim();
    const password = document.getElementById('password')?.value || '';
    err.classList.add('hidden'); err.textContent='';

    const prev = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = '<span class="spinner mr-2"></span>Signing in…';
    try{
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error || !data?.session) {
        err.textContent = (error?.message) || 'Sign in failed'; err.classList.remove('hidden');
      }
    } finally {
      btn.disabled = false; btn.innerHTML = prev;
    }
  });
}
