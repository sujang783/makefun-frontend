// A bounty's leaderboard: the canonical /leaderboard answer, rendered as a
// paginated table. The answer can be megabytes (one board here holds 6,700
// entries), so only one page of rows is ever in the DOM; the rest stays in
// memory, searched and sorted client-side.

import { esc, pct, bytes, num, plural, ago, avatarUrl } from './format.js';

const PAGE_SIZE = 25;

/** How one column's value reads, by column key. */
function display(entry, key) {
  const v = entry.values?.[key];
  if (key === 'judge' || key === 'judge_low' || key === 'judge_high') return pct(v);
  if (key === 'bytes') return bytes(v);
  if (key === 'valid') return v ? '✓' : '—';
  return v ?? '—';
}

function avatarFor(e) {
  if (!e.image) return '<span class="avatar none" aria-hidden="true">?</span>';
  return `<img class="avatar" src="${esc(avatarUrl(e.image))}" alt="" width="28" height="28" loading="lazy" crossorigin="anonymous">`;
}

function row(e, columns) {
  const prize = e.prize_rank ? `<span class="prize" title="Prize place">#${e.prize_rank}</span>` : '';
  const status = e.status && e.status !== 'finished' ? `<span class="entry-status">${esc(e.status)}</span>` : '';
  const cells = columns.map((c) => `<td data-col="${esc(c.key)}">${esc(display(e, c.key))}</td>`).join('');
  return `<tr>
    <td class="rank">${num(e.rank)}${prize}</td>
    <td class="entry">
      <a class="entry-link" href="#/u/${encodeURIComponent(e.handle)}">${avatarFor(e)}<span class="handle">${esc(e.handle)}</span></a>
      <span class="entry-title">${esc(e.title ?? '')}</span>
      ${status}
    </td>
    ${cells}
    <td class="when"><time datetime="${esc(e.received_at)}">${ago(e.received_at)}</time></td>
  </tr>`;
}

function sortValue(e, key) {
  return e.values?.[key] ?? e[key] ?? 0;
}

/**
 * Render the leaderboard into `root`. `state` keeps page, query and sort;
 * `onState` is called when the visitor changes them.
 */
export function leaderboardView(root, data, slug, state, onState) {
  const entries = data.entries ?? [];
  const columns = (data.columns ?? []).filter((c) => !c.hidden);
  const q = state.q.trim().toLowerCase();
  let shown = q
    ? entries.filter((e) => `${e.handle} ${e.title ?? ''}`.toLowerCase().includes(q))
    : entries;
  if (state.sortKey) {
    const dir = state.sortDir === 'asc' ? 1 : -1;
    const key = state.sortKey;
    shown = [...shown].sort((a, b) => (Number(sortValue(a, key)) - Number(sortValue(b, key))) * dir);
  }
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const page = Math.min(state.page, pages);
  const slice = shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const phase = data.phase ?? {};

  const head = columns
    .map((c) => {
      const active = state.sortKey === c.key;
      const arrow = active ? (state.sortDir === 'asc' ? ' ↑' : ' ↓') : '';
      const order = active ? (state.sortDir === 'asc' ? 'ascending' : 'descending') : 'none';
      return `<th scope="col"><button type="button" data-sort="${esc(c.key)}" aria-sort="${order}">${esc(c.title)}${arrow}</button></th>`;
    })
    .join('');
  const from = slice.length ? (page - 1) * PAGE_SIZE + 1 : 0;
  const to = (page - 1) * PAGE_SIZE + slice.length;

  root.innerHTML = `
    <p class="crumbs"><a href="#/">All bounties</a> · <a href="#/bounty/${encodeURIComponent(slug)}">${esc(data.competition?.title ?? slug)}</a></p>
    <h1 tabindex="-1">${esc(data.competition?.title ?? slug)} — leaderboard</h1>
    <p class="lede">${esc(phase.title ?? '')} · ${plural(entries.length, 'entry', 'entries')} ranked by ${esc(data.rank_key_title ?? data.rank_key ?? 'score')}${data.metrics_withheld ? ' · metrics shown as recorded' : ''}</p>
    <form class="toolbar" role="search" id="lb-tools">
      <label class="search"><span class="vh">Search the leaderboard</span>
        <input type="search" name="q" placeholder="Search handle or title…" value="${esc(state.q)}" autocomplete="off">
      </label>
      <span class="count" aria-live="polite">Showing ${from}–${to} of ${num(shown.length)}</span>
    </form>
    <div class="table-wrap">
    <table class="lb">
      <thead><tr><th scope="col">#</th><th scope="col">Entry</th>${head}<th scope="col">Received</th></tr></thead>
      <tbody>${slice.map((e) => row(e, columns)).join('') || `<tr><td colspan="${columns.length + 3}">No entries match.</td></tr>`}</tbody>
    </table>
    </div>
    <nav class="pager" aria-label="Leaderboard pages">
      <button type="button" data-page="prev" ${page <= 1 ? 'disabled' : ''}>← Prev</button>
      <span>Page ${page} of ${pages}</span>
      <button type="button" data-page="next" ${page >= pages ? 'disabled' : ''}>Next →</button>
    </nav>
    <p class="note">The full board is fetched once and cached — this page renders ${PAGE_SIZE} rows at a time, so a 6,700-entry board stays fast. Entry pictures come from make.fun; a missing one shows “?”.</p>`;

  const form = root.querySelector('#lb-tools');
  form.addEventListener('input', () => onState({ ...state, q: form.q.value, page: 1 }));
  form.addEventListener('submit', (e) => e.preventDefault());
  root.querySelectorAll('[data-sort]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.sort;
      const dir = state.sortKey === key && state.sortDir === 'desc' ? 'asc' : 'desc';
      onState({ ...state, sortKey: key, sortDir: dir });
    });
  });
  root.querySelectorAll('[data-page]').forEach((btn) => {
    btn.addEventListener('click', () => {
      onState({ ...state, page: btn.dataset.page === 'next' ? page + 1 : page - 1 });
    });
  });
}
