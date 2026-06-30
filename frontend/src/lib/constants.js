// Course classes — used by the Courses filter and the editable field on the
// course detail page. Edit this list to add/rename classes.
export const COURSE_CLASSES = ['All-in-one', '補底班', '常規班', '精讀班', 'By topic', 'Give away'];

// Thinkific deep links. Admin (config) lives on the thinkific subdomain and is
// keyed by course id; the public sales page is on the custom domain, keyed by slug.
const THINKIFIC_ADMIN_BASE = 'https://mathit-hk.thinkific.com';
const THINKIFIC_PUBLIC_BASE = 'https://www.mathit.hk';
export const thinkificAdminCourseUrl = (courseId) => `${THINKIFIC_ADMIN_BASE}/manage/courses/${courseId}/content`;
export const thinkificPublicCourseUrl = (slug) => `${THINKIFIC_PUBLIC_BASE}/courses/${slug}`;
export const thinkificAdminUserUrl = (userId) => `${THINKIFIC_ADMIN_BASE}/manage/users/${userId}`;

export const COURSE_CLASS_STYLE = {
  'All-in-one': 'bg-brand-100 text-brand-800',
  '補底班': 'bg-amber-100 text-amber-700',
  '常規班': 'bg-slate-100 text-slate-600',
  '精讀班': 'bg-violet-100 text-violet-700',
  'By topic': 'bg-sky-100 text-sky-700',
  'Give away': 'bg-emerald-100 text-emerald-700',
};

// Hex colours matching the class pills, for charts.
export const COURSE_CLASS_COLORS = {
  'All-in-one': '#37889b',
  '補底班': '#f59e0b',
  '常規班': '#64748b',
  '精讀班': '#8b5cf6',
  'By topic': '#0ea5e9',
  'Give away': '#10b981',
  Unclassified: '#cbd5e1',
};

// Default enrolment delivery / attendance modes (now editable in Settings;
// this is just the fallback).
export const DELIVERY_MODES = ['Zoom', 'Tuen Mun', 'Mong Kok', 'Video'];

export const ENROLMENT_STATUSES = ['active', 'completed', 'expired', 'pending'];

export const ENROLMENT_STATUS_COLORS = {
  active: '#37889b',
  completed: '#10b981',
  expired: '#f59e0b',
  pending: '#94a3b8',
};
