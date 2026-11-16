// Formatting helpers for the make.fun frontend. Every function here is
// pure: it takes an API value (or a plain number) and returns a string for
// the page. No network, no DOM, no state.

const DAY_MS = 86400000;
const HOUR_MS = 3600000;
const MINUTE_MS = 60000;

/** Parse an ISO date; null when it is not a date. */
function asDate(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

const fullDate = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
});
const dayOnly = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' });

/** Make a value safe to drop into HTML: escape the five special characters. */
export function esc(value) {
  const text = value === null || value === undefined ? '' : String(value);
  let out = '';
  for (const ch of text) {
    if (ch === '&') out += '&#38;';
    else if (ch === '<') out += '&#60;';
    else if (ch === '>') out += '&#62;';
    else if (ch === '"') out += '&#34;';
    else if (ch === "'") out += '&#39;';
    else out += ch;
  }
  return out;
}

const usdWhole = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const usdCents = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** A dollar amount as "$710" for whole dollars, "$0.50" otherwise. */
export function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return Number.isInteger(n) ? usdWhole.format(n) : usdCents.format(n);
}

/** A deadline as a short date and time in UTC, e.g. "Nov 17, 2026, 12:30 PM UTC". */
export function date(iso) {
  const d = asDate(iso);
  return d ? `${fullDate.format(d)} UTC` : '—';
}

/** A date as just the day, UTC. */
export function day(iso) {
  const d = asDate(iso);
  return d ? dayOnly.format(d) : '—';
}

/**
 * How long until a deadline: "2d 4h left", "3h 12m left", "35m 10s left",
 * "42s left", or "ended" once it has passed. `now` is injectable for tests.
 */
export function timeLeft(iso, now = Date.now()) {
  const target = asDate(iso);
  if (!target) return 'ended';
  const left = target.getTime() - now;
  if (left <= 0) return 'ended';
  const days = Math.floor(left / DAY_MS);
  const hours = Math.floor((left % DAY_MS) / HOUR_MS);
  const minutes = Math.floor((left % HOUR_MS) / MINUTE_MS);
  const seconds = Math.floor((left % MINUTE_MS) / 1000);
  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${minutes}m left`;
  if (minutes > 0) return `${minutes}m ${seconds}s left`;
  return `${seconds}s left`;
}

/** A win rate stored in millionths as a percent, "96.21%". */
export function pct(micro) {
  const n = Number(micro);
  return Number.isFinite(n) ? `${(n / 10000).toFixed(2)}%` : '—';
}

/** A byte count as "1.36 MB", "676 KB" or "912 B". */
export function bytes(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  if (v >= 1048576) return `${(v / 1048576).toFixed(2)} MB`;
  if (v >= 1024) return `${Math.round(v / 1024)} KB`;
  return `${v} B`;
}

/** A large count with thousands separators, "6,692". */
export function num(n) {
  const v = Number(n);
  return Number.isFinite(v) ? v.toLocaleString('en-US') : '—';
}

/** "1 entry" / "414 entries" — the count plus the right singular/plural word. */
export function plural(n, one, many) {
  return `${num(n)} ${Number(n) === 1 ? one : many}`;
}

/** How long ago an ISO time was: "just now", "3h ago", "2d ago". */
export function ago(iso, now = Date.now()) {
  const d = asDate(iso);
  if (!d) return '';
  const elapsed = now - d.getTime();
  if (!Number.isFinite(elapsed) || elapsed < 0) return '';
  const minutes = Math.floor(elapsed / MINUTE_MS);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return day(iso);
}

/** Shorten a wallet address to "F7YE…2ndTi" when it is long enough. */
export function shortAddr(addr) {
  const s = addr === null || addr === undefined ? '' : String(addr);
  if (s.length <= 12) return s;
  return `${s.slice(0, 4)}…${s.slice(-5)}`;
}

/**
 * An avatar path from the API as a full URL. Absolute URLs pass through
 * untouched; anything else is resolved against make.fun's origin (the API
 * sometimes sends a bare path).
 */
export function avatarUrl(path) {
  const p = path === null || path === undefined ? '' : String(path);
  if (p.startsWith('http://') || p.startsWith('https://')) return p;
  return `https://make.fun${p}`;
}
