export const el = {
  authView : document.getElementById('authView'),
  appView  : document.getElementById('appView'),
  navLinks : document.getElementById('navLinks'),
  view     : document.getElementById('view'),
  btnMenu  : document.getElementById('btnMenu'),
  mobileNav: document.getElementById('mobileNav'),
};

export const fmtMoney = (n)=> n==null?'-':new Intl.NumberFormat('en-AU',{style:'currency',currency:'HKD'}).format(n);
export const escapeHtml = (s)=> s==null? '' : String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
export const cssId = (s)=> String(s).replace(/[^a-zA-Z0-9_-]/g, '_');

export function showAuth(){ el.authView.hidden=false; el.appView.hidden=true; el.navLinks.hidden=true; }
export function showApp(){ el.authView.hidden=true; el.appView.hidden=false; el.navLinks.hidden=false; }
