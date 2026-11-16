// The bounty board: every bounty, open and resolved, with its live pot,
// entry fee, time left and entries. Filter, search and sort, all client-side.

import { esc, money, timeLeft, date, plural, num } from './format.js';

/** Whether a bounty still takes entries: its deadline, not its status alone. */
export function isOpen(b, now = Date.now()) {
  return b.acceptingSubmissions !== false && new Date(b.deadline).getTime() > now;
}

/** 'open' | 'soon' (<24h left) | 'ended'. */
export function phaseOf(b, now = Date.now()) {
  const ms = new Date(b.deadline).getTime() - now;
  if (ms <= 0) return 'ended';
  if (ms < 86400000) return 'soon';
  return 'open';
}

/** The reward as it stands now: the prize plus any entry fees paid into it. */
export function pot(b) {
  return money(b.potUsd ?? b.rewardAmount);
}

const SORTS = {
  // Open bounties first, closing soonest; ended ones after, most recent first.
  closing: (a, b) => {
    const now = Date.now();
    const aOpen = new Date(a.deadline).getTime() > now;
    const bOpen = new Date(b.deadline).getTime() > now;
    if (aOpen !== bOpen) return aOpen ? -1 : 1;
    const d = new Date(a.deadline) - new Date(b.deadline);
    return aOpen ? d : -d;
  },
  pot: (a, b) => Number(b.potUsd ?? b.rewardAmount) - Number(a.potUsd ?? a.rewardAmount),
  entries: (a, b) => (b.submissionCount ?? 0) - (a.submissionCount ?? 0),
  newest: (a, b) => new Date(b.publishedAt ?? 0) - new Date(a.publishedAt ?? 0),
};

function filterItems(items, state, now) {
  const q = state.q.trim().toLowerCase();
  return items.filter((b) => {
    if (state.filter === 'open' && !isOpen(b, now)) return false;
    if (state.filter === 'soon' && phaseOf(b, now) !== 'soon') return false;
    if (state.filter === 'ended' && phaseOf(b, now) !== 'ended') return false;
    if (q && !`${b.title} ${b.slug} ${b.category ?? ''}`.toLowerCase().includes(q)) return false;
    if (state.category !== 'all' && b.category !== state.category) return false;
    return true;
  });
}

function card(b, now) {
  const phase = phaseOf(b, now);
  const badge =
    phase === 'open'
      ? '<span class="badge open">Open</span>'
      : phase === 'soon'
        ? '<span class="badge soon">Closing soon</span>'
        : '<span class="badge ended">Ended</span>';
  const fee = b.entryFeeUsd ? `<span class="fee">${money(b.entryFeeUsd)} entry fee</span>` : '';
  return `<article class="card">
    <h2><a href="#/bounty/${encodeURIComponent(b.slug)}">${esc(b.title)}</a></h2>
    <p class="meta"><span class="cat">${esc(b.category ?? 'Bounty')}</span> ${badge}</p>
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
  const items = [...(data.items ?? [])].sort(SORTS[state.sort] ?? SORTS.closing);
  const categories = [...new Set(items.map((b) => b.category).filter(Boolean))].sort();
  const shown = filterItems(items, state, now);
  const openCount = items.filter((b) => isOpen(b, now)).length;
  const site = data.stats;
  const strip = site
    ? `<p class="strip">${num(site.entries?.total ?? 0)} entries · ${num(site.lines?.total ?? 0)} lines of code · ${num(site.tokens?.total ?? 0)} tokens burned, all time</p>`
    : '';

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
          <option value="all" ${state.filter === 'all' ? 'selected' : ''}>All bounties</option>
          <option value="open" ${state.filter === 'open' ? 'selected' : ''}>Open now</option>
          <option value="soon" ${state.filter === 'soon' ? 'selected' : ''}>Closing soon</option>
          <option value="ended" ${state.filter === 'ended' ? 'selected' : ''}>Ended</option>
        </select>
      </label>
      <label>Category
        <select name="category">
          <option value="all">All categories</option>
          ${categories.map((c) => `<option value="${esc(c)}" ${state.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
        </select>
      </label>
      <label>Sort
        <select name="sort">
          <option value="closing" ${state.sort === 'closing' ? 'selected' : ''}>Closing soonest</option>
          <option value="pot" ${state.sort === 'pot' ? 'selected' : ''}>Biggest pot</option>
          <option value="entries" ${state.sort === 'entries' ? 'selected' : ''}>Most entries</option>
          <option value="newest" ${state.sort === 'newest' ? 'selected' : ''}>Newest</option>
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
