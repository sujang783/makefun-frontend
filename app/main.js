// The router: four hash routes, one view each, loaded only when visited.
//
//   #/                              the bounty board
//   #/bounty/<slug>                 one bounty
//   #/bounty/<slug>/leaderboard     that bounty's leaderboard
//   #/u/<handle>                    an account's public profile
//
// window.__shotReady is false while a route loads and true once its data is
// on screen, so a screenshot script knows when to capture. Views load with
// import() per route, so the first load stays small: only the router, the
// API layer and the formatting helpers load up front.

import {
  getAllBounties,
  getBounty,
  getLeaderboard,
  getProfile,
  getStats,
  refresh,
  stats as apiStats,
} from './api.js';
import { timeLeft } from './format.js';

const app = document.getElementById('app');
const savedState = new Map(); // route key -> the view's own state (search, page, ...)
let activeKey = '';
let activeApiPath = '';
let renderCount = 0;

function stateFor(key, initial) {
  if (!savedState.has(key)) savedState.set(key, { ...initial });
  return savedState.get(key);
}

function updateState(key, patch) {
  Object.assign(stateFor(key, {}), patch);
  render(true);
}

function renderLoading() {
  app.innerHTML = '<p class="loading" role="status">Loading…</p>';
}

function renderError(err, retry) {
  app.innerHTML = `<div class="error" role="alert">
    <h1 tabindex="-1">Something went wrong</h1>
    <p>${err && err.message ? err.message : 'make.fun did not answer.'}</p>
    <p><button type="button" id="retry">Try again</button></p>
  </div>`;
  document.getElementById('retry').addEventListener('click', retry);
  window.__shotReady = true;
}

/** After a view renders: set the title, focus its heading, refresh the footer. */
function done(title) {
  document.title = title;
  const h1 = app.querySelector('h1');
  if (h1) h1.focus({ preventScroll: true });
  window.scrollTo(0, 0);
  const foot = document.getElementById('api-stats');
  if (foot) {
    const s = apiStats();
    foot.textContent = `${s.requests} API request${s.requests === 1 ? '' : 's'} · ${s.cached} from cache`;
  }
  window.__shotReady = true;
}

/** Read the hash as a route: { name, key, slug?, handle? }. */
function parseHash() {
  const parts = (location.hash || '#/').replace(/^#\//, '').split('/').map(decodeURIComponent);
  if (parts[0] === 'bounty' && parts[1] && parts[2] === 'leaderboard') {
    return { name: 'leaderboard', slug: parts[1], key: `lb:${parts[1]}` };
  }
  if (parts[0] === 'bounty' && parts[1]) {
    return { name: 'bounty', slug: parts[1], key: `bounty:${parts[1]}` };
  }
  if (parts[0] === 'u' && parts[1]) {
    return { name: 'profile', handle: parts[1], key: `u:${parts[1]}` };
  }
  return { name: 'board', key: 'board' };
}

async function render(keepState = false) {
  const token = ++renderCount;
  const r = parseHash();
  const sameView = keepState && r.key === activeKey;
  activeKey = r.key;
  window.__shotReady = false;
  if (!sameView) renderLoading();
  try {
    if (r.name === 'board') {
      const [data, site] = await Promise.all([getAllBounties(), getStats().catch(() => null)]);
      if (token !== renderCount) return;
      data.stats = site;
      const { boardView } = await import('./views-board.js');
      if (token !== renderCount) return;
      const state = stateFor(r.key, { q: '', filter: 'all', category: 'all', sort: 'closing' });
      boardView(app, data, state, (patch) => updateState(r.key, patch));
      activeApiPath = '/competitions?activity=times';
      done('Bounties · make.fun');
    } else if (r.name === 'bounty') {
      const b = await getBounty(r.slug);
      if (token !== renderCount) return;
      const { bountyView } = await import('./views-bounty.js');
      if (token !== renderCount) return;
      bountyView(app, b);
      activeApiPath = `/competitions/${encodeURIComponent(r.slug)}`;
      done(`${b.title} · make.fun`);
    } else if (r.name === 'leaderboard') {
      const data = await getLeaderboard(r.slug);
      if (token !== renderCount) return;
      const { leaderboardView } = await import('./views-leaderboard.js');
      if (token !== renderCount) return;
      const state = stateFor(r.key, { q: '', page: 1, sortKey: '', sortDir: 'desc' });
      leaderboardView(app, data, r.slug, state, (patch) => updateState(r.key, patch));
      activeApiPath = `/competitions/${encodeURIComponent(r.slug)}/leaderboard`;
      done(`${data.competition?.title ?? r.slug} leaderboard · make.fun`);
    } else {
      const p = await getProfile(r.handle);
      if (token !== renderCount) return;
      const { profileView } = await import('./views-profile.js');
      if (token !== renderCount) return;
      const state = stateFor(r.key, { page: 1 });
      profileView(app, p, state, (patch) => updateState(r.key, patch));
      activeApiPath = `/profiles/${encodeURIComponent(r.handle)}`;
      done(`@${p.handle} · make.fun`);
    }
  } catch (err) {
    if (token !== renderCount) return;
    renderError(err, () => render(false));
  }
}

// One timer for every countdown on screen: it rewrites only the time-left
// text, never the page.
setInterval(() => {
  const now = Date.now();
  document.querySelectorAll('[data-deadline]').forEach((el) => {
    el.textContent = timeLeft(el.dataset.deadline, now);
  });
}, 1000);

// When a background refresh brings newer data, re-render the view showing it.
document.addEventListener('mf:fresh', (e) => {
  if (activeApiPath && e.detail.path === activeApiPath) render(true);
});

// Revalidate the current view's answer every minute, quietly.
setInterval(() => {
  if (activeApiPath) refresh(activeApiPath);
}, 60000);

window.addEventListener('hashchange', () => render(false));
render(false);
