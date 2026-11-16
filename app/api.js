// make.fun's public API, read-only GET, open to any origin (CORS).
// The full API is described at https://make.fun/api/openapi.json.
//
// Why this layer exists: the API is slow (a board takes seconds to build and
// a big leaderboard is megabytes), so every answer is cached and revalidated:
// an in-memory copy for the session, a localStorage copy for the next visit,
// and the API's own ETag on every revalidation, so an unchanged answer costs
// a 304 with no body. A view never waits on a request another view already
// made: identical in-flight requests share one fetch.

const API = 'https://make.fun/api';
const MEM_TTL_MS = 120000; // in-memory answers stay fresh for 2 minutes
const STORE_TTL_MS = 3600000; // stored answers stay usable for 1 hour
const STORE_MAX_BYTES = 1048576; // never store an answer over 1 MiB (no 18 MB leaderboards)
const STORE_KEY = 'mf:cache:v1';

const memory = new Map(); // path -> { at, etag, body }
const inflight = new Map(); // path -> Promise<body>
let requestCount = 0;
let cacheHits = 0;

/** How many API requests this session made, and how many were served from cache. */
export function stats() {
  return { requests: requestCount, cached: cacheHits };
}

function readStore() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function writeStore(store) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    // Storage full or unavailable: the in-memory cache still works.
  }
}

function storeGet(path) {
  const entry = readStore()[path];
  if (!entry || typeof entry.body === 'undefined') return null;
  if (Date.now() - entry.at > STORE_TTL_MS) return null;
  return entry;
}

function storePut(path, entry) {
  if (JSON.stringify(entry.body ?? '').length > STORE_MAX_BYTES) return;
  const store = readStore();
  store[path] = entry;
  // Evict the oldest entries while the store is over ~2 MB.
  let size = JSON.stringify(store).length;
  const keys = Object.keys(store).sort((a, b) => store[a].at - store[b].at);
  while (size > 2097152 && keys.length > 1) {
    delete store[keys.shift()];
    size = JSON.stringify(store).length;
  }
  writeStore(store);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchOnce(path, etag) {
  requestCount += 1;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(API + path, {
      signal: controller.signal,
      headers: etag ? { 'If-None-Match': etag } : {},
    });
    if (res.status === 304) return { status: 304 };
    if (res.status === 503) {
      const retryAfter = Number(res.headers.get('Retry-After') ?? 5);
      const err = new Error('The board is being built, retrying…');
      err.retryAfter = Number.isFinite(retryAfter) ? retryAfter * 1000 : 5000;
      err.status = 503;
      throw err;
    }
    if (!res.ok) {
      const err = new Error(`make.fun answered ${res.status}`);
      err.status = res.status;
      throw err;
    }
    const body = await res.json();
    return { status: 200, etag: res.headers.get('ETag'), body };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * GET one API path, cached. Returns the parsed body.
 * A fresh cached answer returns at once; a stale one returns at once too and
 * is revalidated in the background, which fires `mf:fresh` with the path
 * when a newer body arrives, so the view showing it can re-render.
 */
export function get(path) {
  const now = Date.now();
  const mem = memory.get(path);
  if (mem && now - mem.at < MEM_TTL_MS) {
    cacheHits += 1;
    return Promise.resolve(mem.body);
  }
  if (inflight.has(path)) return inflight.get(path);
  const stored = storeGet(path);
  const promise = (async () => {
    try {
      const res = await fetchOnce(path, mem?.etag ?? stored?.etag);
      if (res.status === 304) {
        const body = mem?.body ?? stored?.body;
        const entry = { at: Date.now(), etag: mem?.etag ?? stored?.etag, body };
        memory.set(path, entry);
        storePut(path, entry);
        cacheHits += 1;
        return body;
      }
      const entry = { at: Date.now(), etag: res.etag, body: res.body };
      memory.set(path, entry);
      storePut(path, entry);
      return res.body;
    } catch (err) {
      // One retry for a board that is still building, then fall back to cache.
      if (err.status === 503 && (mem || stored)) {
        try {
          await sleep(err.retryAfter ?? 5000);
          const res = await fetchOnce(path, mem?.etag ?? stored?.etag);
          if (res.status === 304) return mem?.body ?? stored?.body;
          const entry = { at: Date.now(), etag: res.etag, body: res.body };
          memory.set(path, entry);
          storePut(path, entry);
          return res.body;
        } catch {
          // Fall through to the cached answer below.
        }
      }
      const fallback = mem?.body ?? stored?.body;
      if (fallback !== undefined) {
        cacheHits += 1;
        return fallback;
      }
      throw err;
    } finally {
      inflight.delete(path);
    }
  })();
  inflight.set(path, promise);
  // A stale cached answer is better than a spinner: return it now and refresh behind it.
  if (mem || stored) {
    promise.then((fresh) => {
      const cached = mem?.body ?? stored?.body;
      if (JSON.stringify(fresh) !== JSON.stringify(cached)) {
        document.dispatchEvent(new CustomEvent('mf:fresh', { detail: { path } }));
      }
    });
    cacheHits += 1;
    return Promise.resolve(mem?.body ?? stored?.body);
  }
  return promise;
}

/** Revalidate one path in the background; resolves true when a newer body arrived. */
export async function refresh(path) {
  const mem = memory.get(path);
  const stored = storeGet(path);
  try {
    const res = await fetchOnce(path, mem?.etag ?? stored?.etag);
    if (res.status === 304) return false;
    const entry = { at: Date.now(), etag: res.etag, body: res.body };
    memory.set(path, entry);
    storePut(path, entry);
    document.dispatchEvent(new CustomEvent('mf:fresh', { detail: { path } }));
    return true;
  } catch {
    return false;
  }
}

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
