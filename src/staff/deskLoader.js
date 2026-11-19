/**
 * Staff desk loading in pages (server: server/staffData.js). `call(op, payload)` is the app's `api`
 * (throws Error with .status / .network / .timeout). Each page is retried with backoff on a dropped
 * connection or a busy server, so one hiccup never empties the desk. An older server without the
 * paged ops falls back to the one-shot `staffSnapshot`.
 */
export const DESK_PAGE_SIZE = 50;
const MAX_PAGES = 1000;
/** Incremental refresh looks this far before the newest question it already has (clock skew); the count check catches the rest. */
const SINCE_SLACK_MS = 2 * 60 * 1000;

const wait = ms => new Promise(r => setTimeout(r, ms));

export function isRetryableError(e) {
  return Boolean(e && (e.network || e.timeout || [408, 429, 500, 502, 503, 504].includes(e.status)));
}

export function isUnknownOp(e) {
  return Boolean(e && e.status === 400 && /unknown op/i.test(String(e.message || "")));
}

export async function callRetry(call, op, payload = {}, { attempts = 4, baseMs = 700, onRetry, sleep = wait } = {}) {
  for (let i = 0; ; i++) {
    try {
      return await call(op, payload);
    } catch (e) {
      if (!isRetryableError(e) || i >= attempts - 1) throw e;
      if (onRetry) onRetry(i + 1, e);
      await sleep(Math.round(baseMs * 2 ** i * (0.75 + Math.random() * 0.5)));
    }
  }
}

const byCreated = (a, b) => (a.createdAt || 0) - (b.createdAt || 0);

function dedupeById(list) {
  const m = new Map();
  for (const q of list) if (q && q.id) m.set(String(q.id), q);
  return [...m.values()];
}

export async function loadQuestionsPaged(call, { pageSize = DESK_PAGE_SIZE, total = 0, onProgress, retry } = {}) {
  const items = [];
  const hidden = [];
  let cursor = "";
  let scanned = 0;
  for (let n = 0; n < MAX_PAGES; n++) {
    const page = await callRetry(call, "staffQuestionsPage", { cursor, limit: pageSize }, retry);
    items.push(...(page.items || []));
    hidden.push(...(page.hidden || []));
    scanned += Number(page.scanned) || 0;
    if (onProgress) onProgress(scanned, total);
    if (page.done || !page.nextCursor) break;
    if (page.nextCursor === cursor) throw new Error("The desk stopped loading part-way. Press Retry.");
    cursor = page.nextCursor;
  }
  return { items, hidden, scanned };
}

function deskFrom({ questions, hidden = [], clusters, clustersVersion, counts = null, users = null, paged }) {
  const list = dedupeById(questions).sort(byCreated);
  const seenIds = new Set([...list.map(q => String(q.id)), ...hidden.map(String)]);
  const maxCreated = list.reduce((m, q) => Math.max(m, Number(q.createdAt) || 0), 0);
  return {
    questions: list,
    clusters: Array.isArray(clusters) ? clusters : [],
    clustersVersion: clustersVersion ?? 1,
    counts, users, paged, seenIds, maxCreated,
  };
}

/** Counts → groups + every question page. Throws after retries; the caller keeps what it had. */
export async function loadStaffDesk(call, { pageSize = DESK_PAGE_SIZE, onProgress, retry } = {}) {
  let counts;
  try {
    counts = await callRetry(call, "staffCounts", {}, retry);
  } catch (e) {
    if (!isUnknownOp(e)) throw e;
    const snap = await callRetry(call, "staffSnapshot", {}, retry);
    return deskFrom({
      questions: snap.questions || [], clusters: snap.clusters, clustersVersion: snap.clustersVersion,
      users: Array.isArray(snap.users) ? snap.users : [], counts: { backend: snap.backend }, paged: false,
    });
  }
  if (onProgress) onProgress(0, counts.questions || 0);
  const [cl, q] = await Promise.all([
    callRetry(call, "staffClusters", {}, retry),
    loadQuestionsPaged(call, { pageSize, total: counts.questions || 0, onProgress, retry }),
  ]);
  return deskFrom({ questions: q.items, hidden: q.hidden, clusters: cl.clusters, clustersVersion: cl.clustersVersion, counts, paged: true });
}

/**
 * New questions since the last load, merged by id. Returns null when a full reload is needed
 * (older server, too many changes, or the server count disagrees — e.g. a deletion).
 */
export async function refreshDeskIncremental(call, desk, { retry } = {}) {
  if (!desk || !desk.paged) return null;
  const since = Math.max(1, (desk.maxCreated || 0) - SINCE_SLACK_MS);
  const [counts, page] = await Promise.all([
    callRetry(call, "staffCounts", {}, retry),
    callRetry(call, "staffQuestionsPage", { sinceCreated: since }, retry),
  ]);
  if (page.truncated) return null;
  const byId = new Map(desk.questions.map(q => [String(q.id), q]));
  for (const q of page.items || []) byId.set(String(q.id), q);
  const next = deskFrom({
    questions: [...byId.values()],
    hidden: [...desk.seenIds].filter(id => !byId.has(id)).concat(page.hidden || []),
    clusters: desk.clusters, clustersVersion: desk.clustersVersion, counts, paged: true,
  });
  if (Number(counts.questions) !== next.seenIds.size) return null;
  return next;
}

/** Every delegate card, newest first, one per email. */
export async function loadDelegatesPaged(call, { pageSize = DESK_PAGE_SIZE, onProgress, retry } = {}) {
  const byEmail = new Map();
  let cursor = "";
  for (let n = 0; n < MAX_PAGES; n++) {
    let page;
    try {
      page = await callRetry(call, "staffDelegatesPage", { cursor, limit: pageSize }, retry);
    } catch (e) {
      if (!isUnknownOp(e) || n > 0) throw e;
      const snap = await callRetry(call, "staffSnapshot", {}, retry);
      return Array.isArray(snap.users) ? snap.users : [];
    }
    for (const u of page.items || []) {
      const k = String(u.email || "").trim().toLowerCase();
      if (k && !byEmail.has(k)) byEmail.set(k, u);
    }
    if (onProgress) onProgress(byEmail.size);
    if (page.done || !page.nextCursor) break;
    if (page.nextCursor === cursor) throw new Error("The delegate list stopped loading part-way. Press Refresh.");
    cursor = page.nextCursor;
  }
  return [...byEmail.values()].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}
