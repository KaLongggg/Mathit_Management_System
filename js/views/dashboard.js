import { el, showApp } from '../ui.js';

export function renderDashboard(){
  showApp();
  el.view.innerHTML = `
    <section class="grid gap-6 md:grid-cols-3">
      <div class="card p-6">
        <h2 class="font-semibold mb-2">New Enrolments (This Week)</h2>
        <div class="skeleton w-1/2 mb-2"></div>
        <p class="text-sm text-zinc-500">Chart placeholder</p>
      </div>
      <div class="card p-6">
        <h2 class="font-semibold mb-2">New Students</h2>
        <div class="skeleton w-2/3 mb-2"></div>
        <p class="text-sm text-zinc-500">Chart placeholder</p>
      </div>
      <div class="card p-6">
        <h2 class="font-semibold mb-2">Revenue (MTD)</h2>
        <div class="skeleton w-1/3 mb-2"></div>
        <p class="text-sm text-zinc-500">Chart placeholder</p>
      </div>
    </section>`;
}
