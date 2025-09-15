import { supabase } from './supabaseClient.js';
import { el } from './ui.js';
import { renderLogin } from './views/login.js';
import { renderDashboard } from './views/dashboard.js';
import { renderCourses, renderCourseEditor } from './views/courses.js'; // ⬅️ import editor
import { renderStudents } from './views/students.js';
import { renderStudentDetail } from './views/studentDetail.js';
import { renderEnrolments, renderEnrolmentEditor } from './views/enrolments.js';




// Routes (add /course/:id; "new" is a valid :id too)
const routes = [
  { path: '/dashboard',   render: renderDashboard },
  { path: '/courses',     render: renderCourses },
  { path: '/course/:id',  render: ({ id }) => renderCourseEditor(id) },
  { path: '/enrolments',  render: renderEnrolments },               // ← NEW
  { path: '/enrolment/:id', render: ({ id }) => renderEnrolmentEditor(id) }, // ← NEW
  { path: '/students',    render: renderStudents },
  { path: '/student/:id', render: ({ id }) => renderStudentDetail(id) },
  { path: '/login',       render: renderLogin },
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
  document.querySelectorAll('[data-nav]').forEach(a => {
    const href = a.getAttribute('href');
    const isStudents = href === '#/students' && (path === '/students' || path.startsWith('/student/'));
    const isCourses  = href === '#/courses'  && (path === '/courses'  || path.startsWith('/course/')); // ⬅️ keep active
    const isEnrols = href === '#/enrolments' && (path === '/enrolments' || path.startsWith('/enrolment/'));
    const isExact    = href === `#${path}`;


    a.dataset.active = (isStudents || isCourses || isExact) ? 'true' : 'false';
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
