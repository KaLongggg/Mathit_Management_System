import { supabase } from './supabaseClient.js';
import { el } from './ui.js';
import { renderLogin } from './views/login.js';
import { renderDashboard } from './views/dashboard.js';
import { renderCourses } from './views/courses.js';
import { renderStudents } from './views/students.js';
import { renderStudentDetail } from './views/studentDetail.js';

// Define routes (including a dynamic one)
const routes = [
  { path: '/dashboard', render: renderDashboard },
  { path: '/courses',   render: renderCourses },
  { path: '/students',  render: renderStudents },
  { path: '/login',     render: renderLogin },
  { path: '/student/:id', render: ({id}) => renderStudentDetail(id) },
];

// Simple matcher that extracts params
function matchRoute(path){
  for (const r of routes){
    const keys = [];
    const rx = '^' + r.path.replace(/\/:([^/]+)/g, (_, k) => {
      keys.push(k);
      return '/([^/]+)';
    }) + '$';
    const re = new RegExp(rx);
    const m = path.match(re);
    if (m) {
      const params = {};
      keys.forEach((k, i) => params[k] = decodeURIComponent(m[i+1]));
      return { render: r.render, params };
    }
  }
  return null;
}

function setActiveNav() {
  const path = (location.hash || '#/dashboard').replace(/^#/, '');
  // Mark "Students" active for both /students and /student/:id
  document.querySelectorAll('[data-nav]').forEach(a => {
    const href = a.getAttribute('href');
    const active =
      (href === `#${path}`) ||
      (href === '#/students' && path.startsWith('/student/'));
    a.dataset.active = active ? 'true' : 'false';
  });
  if (!el.mobileNav.classList.contains('hidden')) {
    el.mobileNav.classList.add('hidden');
    el.btnMenu.setAttribute('aria-expanded', 'false');
  }
}

export async function navigate(){
  const path = (location.hash || '#/dashboard').replace(/^#/, '');
  const { data:{ session } } = await supabase.auth.getSession();

  // auth guard
  if (!session) {
    if (path !== '/login') location.hash = '#/login';
    renderLogin();
    setActiveNav();
    return;
  }

  if (path === '/login' || path === '') {
    location.hash = '#/dashboard';
    renderDashboard();
    setActiveNav();
    return;
  }

  const match = matchRoute(path);
  if (match) {
    match.render(match.params || {});
  } else {
    renderDashboard(); // fallback
  }
  setActiveNav();
}

export function initRouter(){
  window.addEventListener('hashchange', navigate);
  window.addEventListener('load', navigate);
}
