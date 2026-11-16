// The read layer for make.fun's public API (read-only GETs, open CORS).
// Full API description: https://make.fun/api/openapi.json
//
// The API is slow — a board takes seconds to build and a big leaderboard is
// megabytes — so this layer caches aggressively and revalidates cheaply:
//
//   * an in-memory copy, fresh for 2 minutes;
//   * a localStorage copy, usable for 1 hour (never over 1 MiB per answer,
//     ~2 MiB for the whole store, oldest answers evicted first);
//   * the API's own ETag on every revalidation, so an unchanged answer is
//     a 304 with no body;
//   * one shared fetch for identical in-flight requests, so two views never
//     wait on the same request twice.
//
// A stale answer is better than a spinner: when a cached copy exists but is
// past its fresh window, `get` returns it at once and revalidates behind it.
// When a newer body arrives, the layer fires `mf:fresh` with the path, and
// the router re-renders the view showing it.

const API = 'https://make.fun/api';
const FRESH_MS = 120_000; // in-memory answers stay fresh for 2 minutes
const STORED_MS = 3_600_000; // stored answers stay usable for 1 hour
const STORE_KEY = 'mf:cache:v1';
const MAX_STORED_ANSWER = 1_048_576; // never store an answer over 1 MiB
const MAX_STORE = 2_097_152; // keep the whole store near 2 MiB

// path -> { at, etag, body }
const live = new Map();
// path -> Promise<body>
const pending = new Map();

let made = 0; // fetches actually sent
let served = 0; // answers served from a cache instead of the network

/** Requests sent and answers served from cache, for the footer. */
export function stats() {
  return { requests: made, cached: served };
}

// --- localStorage -----------------------------------------------------------

function loadStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveStore(store) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    // Storage full or unavailable: the in-memory cache still works.
  }
}

function storedEntry(path) {
  const entry = loadStore()[path];
  if (!entry || entry.body === undefined) return null;
  if (Date.now() - entry.at > STORED_MS) return null;
  return entry;
}

function storeEntry(path, entry) {
  if (JSON.stringify(entry.body ?? '').length > MAX_STORED_ANSWER) return;
  const store = loadStore();
  store[path] = entry;
  const byAge = Object.keys(store).sort((a, b) => store[a].at - store[b].at);
  while (JSON.stringify(store).length > MAX_STORE && byAge.length > 1) {
    delete store[byAge.shift()];
  }
  saveStore(store);
}

// --- fetching ---------------------------------------------------------------

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function failure(message, status, retryAfterMs) {
  const err = new Error(message);
  err.status = status;
  if (retryAfterMs !== undefined) err.retryAfter = retryAfterMs;
  return err;
}

/**
 * One HTTP round trip. Returns { status: 304 } for a not-modified answer,
 * or { status: 200, etag, body } for a fresh one. A 503 becomes a thrown
 * error carrying the Retry-After delay, so the caller can retry once.
 */
async function roundTrip(path, etag) {
  made += 1;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 20_000);
  try {
    const res = await fetch(API + path, {
      signal: abort.signal,
      headers: etag ? { 'If-None-Match': etag } : {},
    });
    if (res.status === 304) return { status: 304 };
    if (res.status === 503) {
      const seconds = Number(res.headers.get('Retry-After') ?? 5);
      throw failure(
        'The board is being built, retrying…',
        503,
        Number.isFinite(seconds) ? seconds * 1000 : 5000,
      );
    }
    if (!res.ok) throw failure(`make.fun answered ${res.status}`, res.status);
    return { status: 200, etag: res.headers.get('ETag'), body: await res.json() };
  } finally {
    clearTimeout(timer);
  }
}

function remember(path, entry) {
  live.set(path, entry);
  storeEntry(path, entry);
}

function announce(path) {
  document.dispatchEvent(new CustomEvent('mf:fresh', { detail: { path } }));
}

/** GET one API path, cached. Resolves with the parsed body. */
export function get(path) {
  const now = Date.now();
  const mem = live.get(path);
  if (mem && now - mem.at < FRESH_MS) {
    served += 1;
    return Promise.resolve(mem.body);
  }
  if (pending.has(path)) return pending.get(path);
  const stored = storedEntry(path);

  const job = (async () => {
    try {
      const res = await roundTrip(path, mem?.etag ?? stored?.etag);
      if (res.status === 304) {
        const body = mem?.body ?? stored?.body;
        remember(path, { at: Date.now(), etag: mem?.etag ?? stored?.etag, body });
        served += 1;
        return body;
      }
      const entry = { at: Date.now(), etag: res.etag, body: res.body };
      remember(path, entry);
      return res.body;
    } catch (err) {
      // A board still building gets one retry, then the cached answer.
      if (err.status === 503 && (mem || stored)) {
        try {
          await wait(err.retryAfter ?? 5000);
          const res = await roundTrip(path, mem?.etag ?? stored?.etag);
          if (res.status === 304) return mem?.body ?? stored?.body;
          const entry = { at: Date.now(), etag: res.etag, body: res.body };
          remember(path, entry);
          return res.body;
        } catch {
          // Fall through to the cached answer below.
        }
      }
      const fallback = mem?.body ?? stored?.body;
      if (fallback !== undefined) {
        served += 1;
        return fallback;
      }
      throw err;
    } finally {
      pending.delete(path);
    }
  })();
  pending.set(path, job);

  // Stale copy in hand: hand it over now, refresh behind it, and tell the
  // router if something newer shows up.
  if (mem || stored) {
    job.then((fresh) => {
      const old = mem?.body ?? stored?.body;
      if (JSON.stringify(fresh) !== JSON.stringify(old)) announce(path);
    });
    served += 1;
    return Promise.resolve(mem?.body ?? stored?.body);
  }
  return job;
}

/**
 * Revalidate one path in the background. Resolves true when a newer body
 * arrived (and the view showing it was told), false otherwise.
 */
export async function refresh(path) {
  const mem = live.get(path);
  const stored = storedEntry(path);
  try {
    const res = await roundTrip(path, mem?.etag ?? stored?.etag);
    if (res.status === 304) return false;
    remember(path, { at: Date.now(), etag: res.etag, body: res.body });
    announce(path);
    return true;
  } catch {
    return false;
  }
}

// --- endpoints --------------------------------------------------------------

/** The open bounties, with times. */
export const getBounties = () => get('/competitions?status=open&activity=times');

/** Every bounty, open and resolved. */
export const getAllBounties = () => get('/competitions?activity=times');

/** One bounty, by its slug. */
export const getBounty = (slug) => get(`/competitions/${encodeURIComponent(slug)}`);

/** A bounty's leaderboard (the canonical one, paginated on the client). */
export const getLeaderboard = (slug) => get(`/competitions/${encodeURIComponent(slug)}/leaderboard`);

/** An account's public profile, by handle. */
export const getProfile = (handle) => get(`/profiles/${encodeURIComponent(handle)}`);

/** The site's totals: entries, lines of code, tokens. */
export const getStats = () => get('/activity/stats');
