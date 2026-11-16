// One bounty's page: summary, live pot, rewards table, dates, rules and
// recent entries. The rewards table uses rewardsNow when the API sends it
// (base prize plus the entry-fee share, the live pot split by place) and
// falls back to the plain rewards map.

import { esc, money, timeLeft, date, plural, ago } from './format.js';
import { pot, phaseOf } from './views-board.js';

/** A tiny markdown renderer: headings, bold, code, links, lists, paragraphs. */
export function md(src) {
  const lines = String(src ?? '').split('\n');
  let html = '';
  let list = null;
  const inline = (s) =>
    esc(s)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" rel="noopener">$1</a>');
  const closeList = () => {
    if (list) {
      html += `</${list}>`;
      list = null;
    }
  };
  for (const line of lines) {
    const h = line.match(/^(#{1,3})\s+(.*)/);
    if (h) {
      closeList();
      html += `<h${h[1].length + 1}>${inline(h[2])}</h${h[1].length + 1}>`;
      continue;
    }
    const li = line.match(/^\s*[-*]\s+(.*)/);
    if (li) {
      if (list !== 'ul') {
        closeList();
        html += '<ul>';
        list = 'ul';
      }
      html += `<li>${inline(li[1])}</li>`;
      continue;
    }
    const ol = line.match(/^\s*\d+[.)]\s+(.*)/);
    if (ol) {
      if (list !== 'ol') {
        closeList();
        html += '<ol>';
        list = 'ol';
      }
      html += `<li>${inline(ol[1])}</li>`;
      continue;
    }
    if (!line.trim()) {
      closeList();
      continue;
    }
    closeList();
    html += `<p>${inline(line)}</p>`;
  }
  closeList();
  return html;
}

function rewardsTable(b) {
  const now = b.rewardsNow;
  if (Array.isArray(now) && now.length) {
    const rows = now
      .map(
        (r) => `<tr>
          <td>${r.place}${Number(r.place) <= 3 ? ' 🏅' : ''}</td>
          <td>${money(r.baseUsd)}</td>
          <td>${money(r.feeShareUsd)}</td>
          <td><strong>${money(r.amountUsd)}</strong></td>
        </tr>`,
      )
      .join('');
    return `<table class="rewards">
      <caption>Rewards as they stand now — base prize plus the entry-fee share</caption>
      <thead><tr><th scope="col">Place</th><th scope="col">Prize</th><th scope="col">Fee share</th><th scope="col">Total</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }
  const map = b.rewards ?? {};
  const places = Object.keys(map)
    .map(Number)
    .sort((a, z) => a - z);
  if (!places.length) return '<p>No rewards table published yet.</p>';
  const rows = places
    .map(
      (p) => `<tr><td>${p}${p <= 3 ? ' 🏅' : ''}</td><td><strong>${money(map[p])}</strong></td></tr>`,
    )
    .join('');
  return `<table class="rewards">
    <caption>Rewards</caption>
    <thead><tr><th scope="col">Place</th><th scope="col">Prize</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function recentEntries(b) {
  const list = b.submissions ?? [];
  if (!list.length) return '';
  const rows = list
    .slice(0, 8)
    .map(
      (s) => `<li>
        <a href="#/u/${encodeURIComponent(s.hunter)}">${esc(s.hunter)}</a>
        <span class="entry-title">${esc(s.title ?? 'Untitled entry')}</span>
        <span class="entry-status">${esc(s.status ?? '')}</span>
        <time datetime="${esc(s.createdAt)}">${ago(s.createdAt)}</time>
      </li>`,
    )
    .join('');
  return `<section aria-labelledby="recent-h"><h2 id="recent-h">Recent entries</h2>
    <ul class="entries">${rows}</ul>
    <p><a href="#/bounty/${encodeURIComponent(b.slug)}/leaderboard">See the full leaderboard →</a></p></section>`;
}

/** Render one bounty into `root`. */
export function bountyView(root, b) {
  const now = Date.now();
  const phase = phaseOf(b, now);
  const badge =
    phase === 'open'
      ? '<span class="badge open">Open</span>'
      : phase === 'soon'
        ? '<span class="badge soon">Closing soon</span>'
        : '<span class="badge ended">Ended</span>';
  const sponsor = b.sponsor
    ? `<p class="sponsor">Sponsored by ${esc(b.sponsor.name)}${b.sponsor.isVerified ? ' ✓' : ''}</p>`
    : '';

  root.innerHTML = `
    <p class="crumbs"><a href="#/">All bounties</a> · <a href="#/bounty/${encodeURIComponent(b.slug)}/leaderboard">Leaderboard</a></p>
    <h1 tabindex="-1">${esc(b.title)}</h1>
    ${sponsor}
    <p class="lede">${esc(b.summary ?? '')}</p>
    <p class="meta"><span class="cat">${esc(b.category ?? 'Bounty')}</span> ${badge}
      <span>${plural(b.submissionCount ?? 0, 'entry', 'entries')}</span>
      ${b.commentCount ? `<span>${plural(b.commentCount, 'comment', 'comments')}</span>` : ''}</p>
    <dl class="facts hero">
      <div><dt>Live pot</dt><dd class="pot big">${pot(b)}</dd></div>
      <div><dt>Entry fee</dt><dd>${b.entryFeeUsd ? money(b.entryFeeUsd) : 'Free'}</dd></div>
      <div><dt>Time left</dt><dd><time data-deadline="${esc(b.deadline)}">${timeLeft(b.deadline, now)}</time></dd></div>
      <div><dt>Deadline</dt><dd>${date(b.deadline)}</dd></div>
      ${b.entryFeesUsd ? `<div><dt>Fees paid in</dt><dd>${money(b.entryFeesUsd)} from ${plural(b.entryFeePayers ?? 0, 'payer', 'payers')}</dd></div>` : ''}
    </dl>
    <section aria-labelledby="rewards-h"><h2 id="rewards-h">Rewards</h2>${rewardsTable(b)}</section>
    <section aria-labelledby="about-h"><h2 id="about-h">About this bounty</h2><div class="prose">${md(b.description ?? '')}</div></section>
    ${b.rules ? `<section aria-labelledby="rules-h"><h2 id="rules-h">Rules</h2><div class="prose">${md(b.rules)}</div></section>` : ''}
    ${recentEntries(b)}
    <p class="actions">
      <a class="btn" href="#/bounty/${encodeURIComponent(b.slug)}/leaderboard">Leaderboard</a>
      <a class="btn ghost" href="https://make.fun/bounty/${encodeURIComponent(b.slug)}" rel="noopener">Open on make.fun ↗</a>
    </p>`;
}
