// The bounty board: every bounty, open and resolved, with its live pot,
// entry fee, time left and entries. Filter, search and sort, all client-side.

import { esc, money, timeLeft, date, plural, num } from './format.js';

/** Whether a bounty still takes entries: its deadline, not its status alone. */
export function isOpen(b, now = Date.now()) {
  return b.acceptingSubmissions !== false && new Date(b.deadline).getTime() > now;
}

/** 'open' | 'soon' (under 24h left) | 'ended'. */
export function phaseOf(b, now = Date.now()) {
  const left = new Date(b.deadline).getTime() - now;
  if (left <= 0) return 'ended';
  if (left < 86400000) return 'soon';
  return 'open';
}

/** The reward as it stands now: the prize plus any entry fees paid into it. */
export function pot(b) {
  return money(b.potUsd ?? b.rewardAmount);
}

// Sort orders. "closing" puts open bounties first, closing soonest, then the
// ended ones, most recently closed first.
const COMPARE = {
  closing: (a, b) => {
    const now = Date.now();
    const aLive = new Date(a.deadline).getTime() > now;
    const bLive = new Date(b.deadline).getTime() > now;
    if (aLive !== bLive) return aLive ? -1 : 1;
    const gap = new Date(a.deadline) - new Date(b.deadline);
    return aLive ? gap : -gap;
  },
  pot: (a, b) => Number(b.potUsd ?? b.rewardAmount) - Number(a.potUsd ?? a.rewardAmount),
  entries: (a, b) => (b.submissionCount ?? 0) - (a.submissionCount ?? 0),
  newest: (a, b) => new Date(b.publishedAt ?? 0) - new Date(a.publishedAt ?? 0),
};

function matches(b, state, now) {
  if (state.filter === 'open' && !isOpen(b, now)) return false;
  if (state.filter === 'soon' && phaseOf(b, now) !== 'soon') return false;
  if (state.filter === 'ended' && phaseOf(b, now) !== 'ended') return false;
  if (state.category !== 'all' && b.category !== state.category) return false;
  const q = state.q.trim().toLowerCase();
  if (q && !`${b.title} ${b.slug} ${b.category ?? ''}`.toLowerCase().includes(q)) return false;
  return true;
}

function badgeFor(phase) {
  if (phase === 'open') return '<span class="badge open">Open</span>';
  if (phase === 'soon') return '<span class="badge soon">Closing soon</span>';
  return '<span class="badge ended">Ended</span>';
}

function card(b, now) {
  const fee = b.entryFeeUsd ? `<span class="fee">${money(b.entryFeeUsd)} entry fee</span>` : '';
  return `<article class="card">
    <h2><a href="#/bounty/${encodeURIComponent(b.slug)}">${esc(b.title)}</a></h2>
    <p class="meta"><span class="cat">${esc(b.category ?? 'Bounty')}</span> ${badgeFor(phaseOf(b, now))}</p>
    <p class="summary">${esc(b.summary ?? '')}</p>
    <dl class="facts">
      <div><dt>Live pot</dt><dd class="pot">${pot(b)}</dd></div>
      <div><dt>Time left</dt><dd><time data-deadline="${esc(b.deadline)}">${timeLeft(b.deadline, now)}</time></dd></div>
      <div><dt>Entries</dt><dd>${plural(b.submissionCount ?? 0, 'entry', 'entries')}</dd></div>
    </dl>
    <p class="foot">${fee}<span class="deadline">Closes ${date(b.deadline)}</span></p>
  </article>`;
}

/**
 * Render the board into `root`. `state` keeps the search, filters and sort
 * across re-renders; `onState` is called when the visitor changes them.
 */
export function boardView(root, data, state, onState) {
  const now = Date.now();
  const items = [...(data.items ?? [])].sort(COMPARE[state.sort] ?? COMPARE.closing);
  const categories = [...new Set(items.map((b) => b.category).filter(Boolean))].sort();
  const shown = items.filter((b) => matches(b, state, now));
  const openCount = items.filter((b) => isOpen(b, now)).length;
  const site = data.stats;
  const strip = site
    ? `<p class="strip">${num(site.entries?.total ?? 0)} entries · ${num(site.lines?.total ?? 0)} lines of code · ${num(site.tokens?.total ?? 0)} tokens burned, all time</p>`
    : '';
  const picked = (value, current) => (value === current ? 'selected' : '');

  root.innerHTML = `
    <h1 tabindex="-1">Bounties</h1>
    <p class="lede">${openCount} open now · ${items.length} bounties in all · pots grow as entry fees are paid in.</p>
    ${strip}
    <form class="toolbar" role="search" id="board-tools">
      <label class="search"><span class="vh">Search bounties</span>
        <input type="search" name="q" placeholder="Search title, slug or category…" value="${esc(state.q)}" autocomplete="off">
      </label>
      <label>Show
        <select name="filter">
          <option value="all" ${picked('all', state.filter)}>All bounties</option>
          <option value="open" ${picked('open', state.filter)}>Open now</option>
          <option value="soon" ${picked('soon', state.filter)}>Closing soon</option>
          <option value="ended" ${picked('ended', state.filter)}>Ended</option>
        </select>
      </label>
      <label>Category
        <select name="category">
          <option value="all">All categories</option>
          ${categories.map((c) => `<option value="${esc(c)}" ${picked(c, state.category)}>${esc(c)}</option>`).join('')}
        </select>
      </label>
      <label>Sort
        <select name="sort">
          <option value="closing" ${picked('closing', state.sort)}>Closing soonest</option>
          <option value="pot" ${picked('pot', state.sort)}>Biggest pot</option>
          <option value="entries" ${picked('entries', state.sort)}>Most entries</option>
          <option value="newest" ${picked('newest', state.sort)}>Newest</option>
        </select>
      </label>
    </form>
    <p class="count" aria-live="polite">${shown.length === items.length ? `${items.length} bounties` : `Showing ${shown.length} of ${items.length} bounties`}</p>
    <div class="grid">${shown.map((b) => card(b, now)).join('') || '<p>No bounties match. Clear the search or filters.</p>'}</div>`;

  const form = root.querySelector('#board-tools');
  form.addEventListener('input', () => {
    onState({ q: form.q.value, filter: form.filter.value, category: form.category.value, sort: form.sort.value });
  });
  form.addEventListener('submit', (e) => e.preventDefault());
}
