// An account's public profile: picture, links, record, entries and payouts.
// Avatars come from make.fun's own answers, so each <img> carries
// crossorigin="anonymous" (their Cross-Origin-Resource-Policy is same-origin).

import { esc, money, num, plural, day, shortAddr, avatarUrl } from './format.js';

const PAGE_SIZE = 20;

function link(href, label) {
  return `<a href="${esc(href)}" rel="noopener">${esc(label)}</a>`;
}

/** Render a profile into `root`. `state` keeps the solutions page. */
export function profileView(root, p, state, onState) {
  const r = p.record ?? {};
  const sols = p.solutions ?? [];
  const payouts = p.payouts ?? [];
  const pages = Math.max(1, Math.ceil(sols.length / PAGE_SIZE));
  const page = Math.min(state.page, pages);
  const slice = sols.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pic = p.image ?? p.avatar?.url ?? null;

  const links = [];
  if (p.github_login) links.push(link(`https://github.com/${encodeURIComponent(p.github_login)}`, `GitHub @${p.github_login}`));
  if (p.x) links.push(link(`https://x.com/${encodeURIComponent(p.x)}`, `X @${p.x}`));
  if (p.discord) links.push(`<span>Discord ${esc(p.discord)}</span>`);
  if (p.wallet?.address) {
    links.push(link(p.wallet.explorer_url ?? `https://solscan.io/account/${p.wallet.address}`, `Wallet ${shortAddr(p.wallet.address)}`));
  }

  root.innerHTML = `
    <p class="crumbs"><a href="#/">All bounties</a></p>
    <div class="profile-head">
      ${pic ? `<img class="pfp" src="${esc(avatarUrl(pic))}" alt="" width="96" height="96" crossorigin="anonymous">` : '<span class="pfp none" aria-hidden="true">?</span>'}
      <div>
        <h1 tabindex="-1">@${esc(p.handle)}</h1>
        ${p.display_name ? `<p class="display-name">${esc(p.display_name)}</p>` : ''}
        ${p.bio ? `<p class="bio">${esc(p.bio)}</p>` : ''}
        <p class="meta">Joined ${day(p.joined_at)}${p.house ? ' · make.fun team' : ''}</p>
        ${links.length ? `<p class="links">${links.join(' · ')}</p>` : ''}
      </div>
    </div>
    <dl class="facts record">
      <div><dt>Entered</dt><dd>${num(r.competitions_entered ?? 0)}</dd></div>
      <div><dt>Won</dt><dd>${num(r.competitions_won ?? 0)}</dd></div>
      <div><dt>Placed</dt><dd>${num(r.competitions_placed ?? 0)}</dd></div>
      <div><dt>Podiums</dt><dd>${num(r.podium_finishes ?? 0)}</dd></div>
      <div><dt>Best place</dt><dd>${r.best_placement ? `#${r.best_placement}` : '—'}</dd></div>
      <div><dt>Prizes</dt><dd>${money(r.prize_usd ?? 0)}</dd></div>
    </dl>
    <section aria-labelledby="sols-h">
      <h2 id="sols-h">Entries <span class="count">${plural(sols.length, 'entry', 'entries')}</span></h2>
      ${sols.length ? `<ul class="entries">
        ${slice
          .map(
            (s) => `<li>
              <a href="#/bounty/${encodeURIComponent(s.competition?.slug ?? '')}">${esc(s.title ?? 'Untitled entry')}</a>
              <span class="entry-title">${esc(s.competition?.title ?? '')}</span>
              <time datetime="${esc(s.created_at ?? '')}">${day(s.created_at ?? '')}</time>
            </li>`,
          )
          .join('')}
      </ul>
      <nav class="pager" aria-label="Entries pages">
        <button type="button" data-page="prev" ${page <= 1 ? 'disabled' : ''}>← Prev</button>
        <span>Page ${page} of ${pages}</span>
        <button type="button" data-page="next" ${page >= pages ? 'disabled' : ''}>Next →</button>
      </nav>` : '<p>No entries yet.</p>'}
    </section>
    ${payouts.length ? `<section aria-labelledby="pay-h">
      <h2 id="pay-h">Payouts</h2>
      <ul class="entries">
        ${payouts
          .map(
            (x) => `<li>
              <span class="pot">${money(x.amount_usd)}</span>
              <span class="entry-title">Place ${x.place} · ${esc(x.competition?.title ?? '')}</span>
              ${x.explorer_url ? link(x.explorer_url, 'Solana ↗') : ''}
              <time datetime="${esc(x.paid_at)}">${day(x.paid_at)}</time>
            </li>`,
          )
          .join('')}
      </ul>
    </section>` : ''}`;

  root.querySelectorAll('[data-page]').forEach((btn) => {
    btn.addEventListener('click', () => {
      onState({ page: btn.dataset.page === 'next' ? page + 1 : page - 1 });
    });
  });
}
