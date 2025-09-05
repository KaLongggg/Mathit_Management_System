import { supabase } from './supabaseClient.js';
import { el } from './ui.js';
import { renderLogin } from './views/login.js';
import { navigate, initRouter } from './router.js';

// Sign out buttons
document.getElementById('btnSignOut')?.addEventListener('click', async () => {
  await supabase.auth.signOut();
  location.hash = '#/login';
});
document.getElementById('btnSignOutMobile')?.addEventListener('click', async () => {
  await supabase.auth.signOut();
  location.hash = '#/login';
  el.mobileNav.classList.add('hidden');
  el.btnMenu.setAttribute('aria-expanded', 'false');
});

// Mobile menu toggle
el.btnMenu?.addEventListener('click', () => {
  const isHidden = el.mobileNav.classList.toggle('hidden');
  el.btnMenu.setAttribute('aria-expanded', (!isHidden).toString());
});

// Initial view (show login quickly, then reconcile)
renderLogin();

// Auth state → re-evaluate route
supabase.auth.onAuthStateChange((_event, _session) => {
  navigate();
});

// Start router
initRouter();
