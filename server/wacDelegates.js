/**
 * WAC delegate data for "Sign in with WAC ID".
 *
 * Storage: on Firestore a dedicated `wac_delegates` collection (doc id = WAC ID key, `emailLower`
 * field as the email index), written in batches of ≤ 500 — kept out of the `kv` collection so a
 * 10 000-row list never enters KV snapshots. On file / Blob / memory stores (local, tests) the same
 * records live under `aym:wacdel:<key>` with an `aym:wacdel-email:<email>` index.
 *
 * Verification goes through an adapter `{ mode, available(), lookup(wacId, email) }`:
 *   listAdapter — the staff-imported list (WAC_VERIFY_MODE=list, default)
 *   apiAdapter  — WAC's own API (WAC_VERIFY_MODE=api + WAC_VERIFY_URL + WAC_VERIFY_KEY)
 * lookup() resolves `{ ok: true, record }` or `{ ok: false, reason }`; the reason is internal only.
 *
 * Nothing here logs names, emails, phones or IDs.
 */
import crypto from "node:crypto";
import { loadServerEnv } from "./env.js";
import { updateKey, bestEffort } from "./passIssuer.js";
import {
  wacIdKey, normalizeWacId, normEmail, validEmail, cleanDelegateRow, validateDelegateRows, maskEmail,
} from "../shared/wacId.js";

export const COL_WAC = "wac_delegates";
export const K_WACDEL = "aym:wacdel:";
export const K_WACDEL_EMAIL = "aym:wacdel-email:";
export const K_WACDEL_META = "aym:wacdel-meta";
/** WAC ID → the one AYURDISHA user it belongs to (create-if-absent). */
export const K_WACLINK = "aym:waclink:";
/** Staff alert: a link was refused or needs a person to resolve it. */
export const K_WACALERT = "aym:wacalert:";
export const FIRESTORE_BATCH = 500;
export const IMPORT_MAX_ROWS = 2000;
const API_TIMEOUT_MS = 5000;

export function wacEnv(env = loadServerEnv()) {
  return {
    mode: String(env.WAC_VERIFY_MODE || "list").trim().toLowerCase() === "api" ? "api" : "list",
    url: String(env.WAC_VERIFY_URL || "").trim(),
    key: String(env.WAC_VERIFY_KEY || "").trim(),
    pattern: String(env.WAC_ID_PATTERN || "").trim(),
    off: /^(off|0|false|no)$/i.test(String(env.WAC_SIGNIN || "").trim()),
  };
}

function stored(r, { importedAt, batchId }) {
  return {
    wacId: r.wacId, key: wacIdKey(r.wacId), name: r.name, email: r.email, emailLower: r.emailLower,
    phone: r.phone, institution: r.institution, category: r.category, country: r.country,
    state: r.state, attendance: r.attendance, importedAt, batchId,
  };
}

/* ------------------------------------------------------------------ */
/* Firestore repository                                                */
/* ------------------------------------------------------------------ */

export function firestoreRepo(db) {
  const col = db.collection(COL_WAC);
  const ref = key => col.doc(encodeURIComponent(key));
  return {
    kind: "firestore",
    async get(key) {
      if (!key) return null;
      const snap = await ref(key).get();
      return snap.exists ? snap.data() : null;
    },
    async findByEmail(emailLower) {
      const snap = await col.where("emailLower", "==", normEmail(emailLower)).limit(20).get();
      return snap.docs.map(d => d.data());
    },
    async upsertMany(rows, meta) {
      let created = 0;
      let updated = 0;
      for (let i = 0; i < rows.length; i += FIRESTORE_BATCH) {
        const chunk = rows.slice(i, i + FIRESTORE_BATCH);
        const refs = chunk.map(r => ref(wacIdKey(r.wacId)));
        const snaps = await db.getAll(...refs);
        const batch = db.batch();
        chunk.forEach((r, j) => {
          const doc = stored(r, meta);
          // merge keeps linked / linkedUserId / linkedAt on rows someone already signed in with.
          if (snaps[j] && snaps[j].exists) updated += 1;
          else { doc.linked = false; created += 1; }
          batch.set(refs[j], doc, { merge: true });
        });
        await batch.commit();
      }
      return { created, updated };
    },
    async markLinked(key, userId, at = Date.now()) {
      await ref(key).set({ linked: true, linkedUserId: userId, linkedAt: at }, { merge: true });
    },
    async stats() {
      const [all, linked] = await Promise.all([col.count().get(), col.where("linked", "==", true).count().get()]);
      return { total: all.data().count, linked: linked.data().count };
    },
    async clearUnlinked() {
      let removed = 0;
      for (let guard = 0; guard < 400; guard++) {
        const snap = await col.where("linked", "==", false).limit(FIRESTORE_BATCH).get();
        if (snap.empty || !snap.docs.length) break;
        const batch = db.batch();
        snap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
        removed += snap.docs.length;
      }
      return { removed };
    },
  };
}

async function firestoreDbFor() {
  const { getApps } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const app = getApps().find(a => a.name === "aym-preview");
  return app ? getFirestore(app) : null;
}

/* ------------------------------------------------------------------ */
/* KV repository (file / Blob / memory stores)                         */
/* ------------------------------------------------------------------ */

async function getAllKeys(store, keys) {
  const out = {};
  for (let i = 0; i < keys.length; i += 25) {
    const slice = keys.slice(i, i + 25);
    const vals = await Promise.all(slice.map(k => store.get(k)));
    slice.forEach((k, j) => { if (vals[j] != null) out[k] = vals[j]; });
  }
  return out;
}

async function writePatch(store, patch, dels = []) {
  if (Object.keys(patch).length) {
    if (typeof store.merge === "function") await store.merge(patch);
    else for (const [k, v] of Object.entries(patch)) await store.set(k, v);
  }
  for (const k of dels) await store.del(k);
}

export function kvRepo(store) {
  return {
    kind: "kv",
    async get(key) {
      return key ? store.get(K_WACDEL + key) : null;
    },
    async findByEmail(emailLower) {
      const idx = await store.get(K_WACDEL_EMAIL + normEmail(emailLower));
      const keys = idx && Array.isArray(idx.keys) ? idx.keys : [];
      return Object.values(await getAllKeys(store, keys.map(k => K_WACDEL + k)));
    },
    async upsertMany(rows, meta) {
      let created = 0;
      let updated = 0;
      for (let i = 0; i < rows.length; i += FIRESTORE_BATCH) {
        const chunk = rows.slice(i, i + FIRESTORE_BATCH);
        const recKeys = chunk.map(r => K_WACDEL + wacIdKey(r.wacId));
        const prev = await getAllKeys(store, recKeys);
        const emailKeys = new Set();
        chunk.forEach((r, j) => {
          emailKeys.add(K_WACDEL_EMAIL + r.emailLower);
          const p = prev[recKeys[j]];
          if (p && p.emailLower) emailKeys.add(K_WACDEL_EMAIL + p.emailLower);
        });
        const idx = await getAllKeys(store, [...emailKeys]);
        const patch = {};
        const index = k => {
          if (!patch[k]) patch[k] = { keys: [...((idx[k] && idx[k].keys) || [])] };
          return patch[k];
        };
        chunk.forEach((r, j) => {
          const p = prev[recKeys[j]];
          const doc = stored(r, meta);
          const next = p
            ? { ...p, ...doc, linked: Boolean(p.linked) }
            : { ...doc, linked: false };
          if (p) updated += 1; else created += 1;
          patch[recKeys[j]] = next;
          if (p && p.emailLower && p.emailLower !== next.emailLower) {
            const old = index(K_WACDEL_EMAIL + p.emailLower);
            old.keys = old.keys.filter(k => k !== next.key);
          }
          const cur = index(K_WACDEL_EMAIL + next.emailLower);
          if (!cur.keys.includes(next.key)) cur.keys.push(next.key);
        });
        await writePatch(store, patch);
      }
      return { created, updated };
    },
    async markLinked(key, userId, at = Date.now()) {
      await updateKey(store, K_WACDEL + key, cur => (cur ? { ...cur, linked: true, linkedUserId: userId, linkedAt: at } : undefined));
    },
    async stats() {
      const keys = await store.list(K_WACDEL);
      const recs = Object.values(await getAllKeys(store, keys));
      return { total: recs.length, linked: recs.filter(r => r && r.linked).length };
    },
    async clearUnlinked() {
      const keys = await store.list(K_WACDEL);
      const recs = await getAllKeys(store, keys);
      const gone = Object.entries(recs).filter(([, r]) => !r || !r.linked);
      const emails = [...new Set(gone.map(([, r]) => r && r.emailLower).filter(Boolean))].map(e => K_WACDEL_EMAIL + e);
      const idx = await getAllKeys(store, emails);
      const goneKeys = new Set(gone.map(([, r]) => r && r.key));
      const patch = {};
      const dels = gone.map(([k]) => k);
      for (const [k, v] of Object.entries(idx)) {
        const left = (v.keys || []).filter(x => !goneKeys.has(x));
        if (left.length) patch[k] = { keys: left };
        else dels.push(k);
      }
      await writePatch(store, patch, dels);
      return { removed: gone.length };
    },
  };
}

const repos = new WeakMap();

/** Firestore collection when the store is Firestore, else KV keys on the same store. */
export async function delegateRepo(store) {
  if (store && store.wacRepo) return store.wacRepo;
  if (repos.has(store)) return repos.get(store);
  let repo = null;
  if (store && store.name === "firestore") {
    const db = await firestoreDbFor().catch(() => null);
    if (db) repo = firestoreRepo(db);
  }
  if (!repo) repo = kvRepo(store);
  repos.set(store, repo);
  return repo;
}

/* ------------------------------------------------------------------ */
/* Adapters                                                            */
/* ------------------------------------------------------------------ */

function sameEmail(a, b) {
  const x = crypto.createHash("sha256").update(normEmail(a)).digest();
  const y = crypto.createHash("sha256").update(normEmail(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

function asRecord(r) {
  const clean = cleanDelegateRow(r);
  return {
    ...clean,
    key: wacIdKey(clean.wacId),
    linked: Boolean(r && r.linked),
    ...(r && r.linkedUserId ? { linkedUserId: r.linkedUserId } : {}),
  };
}

export function listAdapter(store) {
  return {
    mode: "list",
    async available() {
      const meta = await store.get(K_WACDEL_META);
      return Boolean(meta && Number(meta.total) > 0);
    },
    async lookup(wacId, email) {
      const key = wacIdKey(wacId);
      if (!key) return { ok: false, reason: "invalid" };
      const repo = await delegateRepo(store);
      const rec = await repo.get(key);
      if (!rec) return { ok: false, reason: "not_found" };
      if (!sameEmail(rec.emailLower || rec.email, email)) return { ok: false, reason: "email_mismatch" };
      return { ok: true, record: asRecord(rec) };
    },
  };
}

/**
 * WAC's verification API (future). POST {wacId, email} with `Authorization: Bearer <key>` →
 * `{ valid, name, email, phone, institution, category, country, state, attendance }`.
 */
export function apiAdapter({ url, key, fetchImpl, timeoutMs = API_TIMEOUT_MS } = {}) {
  const doFetch = fetchImpl || ((...a) => fetch(...a));
  return {
    mode: "api",
    async available() { return Boolean(url && key); },
    async lookup(wacId, email) {
      if (!url || !key) return { ok: false, reason: "unavailable" };
      const id = normalizeWacId(wacId);
      const typed = normEmail(email);
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      let r;
      let data;
      try {
        r = await doFetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          body: JSON.stringify({ wacId: id, email: typed }),
          signal: ctrl.signal,
        });
        data = await r.json().catch(() => null);
      } catch {
        return { ok: false, reason: "unavailable" };
      } finally {
        clearTimeout(timer);
      }
      if (r.status === 404) return { ok: false, reason: "not_found" };
      if (!r.ok || !data || typeof data !== "object") return { ok: false, reason: "unavailable" };
      if (data.valid !== true) return { ok: false, reason: "not_found" };
      const recEmail = validEmail(normEmail(data.email)) ? data.email : typed;
      return { ok: true, record: asRecord({ ...data, wacId: data.wacId || id, email: recEmail }) };
    },
  };
}

let adapterOverride = null;
/** Tests: swap the adapter (`null` restores the env-selected one). */
export function setWacAdapterForTests(fn) { adapterOverride = fn; }

export function wacAdapter(store, env = wacEnv()) {
  if (adapterOverride) return adapterOverride(store, env);
  return env.mode === "api" ? apiAdapter({ url: env.url, key: env.key }) : listAdapter(store);
}

/* ------------------------------------------------------------------ */
/* Import / stats / clear                                              */
/* ------------------------------------------------------------------ */

async function writeMeta(store, patch) {
  return updateKey(store, K_WACDEL_META, cur => ({ ...(cur || {}), ...patch, updatedAt: Date.now() }));
}

/**
 * Upsert one chunk of an upload. Chunks of the same upload share `batchId`; the meta record sums
 * them into one "last import". Never touches AYURDISHA profiles or link records.
 */
export async function importDelegates(store, { rows, batchId, filename, pattern, now = Date.now() } = {}) {
  const list = Array.isArray(rows) ? rows.slice(0, IMPORT_MAX_ROWS) : [];
  const { valid, problems, duplicates } = validateDelegateRows(list, { pattern });
  const repo = await delegateRepo(store);
  const counts = valid.length ? await repo.upsertMany(valid, { importedAt: now, batchId }) : { created: 0, updated: 0 };
  const stats = await repo.stats();
  const meta = await updateKey(store, K_WACDEL_META, cur => {
    const prev = cur && cur.lastImport && cur.lastImport.batchId === batchId ? cur.lastImport : null;
    return {
      ...(cur || {}),
      total: stats.total,
      lastImport: {
        batchId,
        filename: String(filename || (prev && prev.filename) || "wac-delegates").slice(0, 180),
        at: now,
        startedAt: (prev && prev.startedAt) || now,
        rows: ((prev && prev.rows) || 0) + list.length,
        imported: ((prev && prev.imported) || 0) + valid.length,
        created: ((prev && prev.created) || 0) + counts.created,
        updated: ((prev && prev.updated) || 0) + counts.updated,
        skipped: ((prev && prev.skipped) || 0) + problems.length,
      },
      updatedAt: Date.now(),
    };
  });
  console.log(`[aym-wac] import chunk: ${list.length} rows, ${valid.length} imported (${counts.created} new, ${counts.updated} updated), ${problems.length} skipped`);
  return {
    received: list.length,
    truncated: Array.isArray(rows) && rows.length > IMPORT_MAX_ROWS,
    imported: valid.length,
    created: counts.created,
    updated: counts.updated,
    duplicates,
    problemCount: problems.length,
    problems: problems.slice(0, 50),
    total: stats.total,
    linked: stats.linked,
    lastImport: meta && meta.lastImport,
  };
}

export async function delegateStats(store) {
  const repo = await delegateRepo(store);
  const [stats, meta] = await Promise.all([repo.stats(), store.get(K_WACDEL_META)]);
  return { total: stats.total, linked: stats.linked, lastImport: (meta && meta.lastImport) || null, backend: repo.kind };
}

/** Removes only delegates nobody has signed in with. */
export async function clearUnlinkedDelegates(store) {
  const repo = await delegateRepo(store);
  const { removed } = await repo.clearUnlinked();
  const stats = await repo.stats();
  await writeMeta(store, { total: stats.total, clearedAt: Date.now() });
  console.log(`[aym-wac] cleared ${removed} unlinked delegates (${stats.total} left)`);
  return { removed, total: stats.total, linked: stats.linked };
}

/** Masked email and the WAC ID only; the log line carries the kind alone. */
export async function raiseWacAlert(store, { kind, wacId, emailLower, now = Date.now() }) {
  console.warn(`[aym-wac] blocked: ${kind}`);
  await bestEffort(() => store.set(`${K_WACALERT}${now.toString(36)}-${crypto.randomBytes(3).toString("hex")}`, {
    at: now, kind, wacId: normalizeWacId(wacId), maskedEmail: maskEmail(emailLower),
  }), { ms: 1500, label: "wac alert" });
}

export async function markDelegateLinked(store, key, userId) {
  const repo = await delegateRepo(store);
  if (await repo.get(key)) await repo.markLinked(key, userId);
}

export async function findDelegates(store, query) {
  const q = String(query || "").trim();
  if (!q) return [];
  const repo = await delegateRepo(store);
  if (q.includes("@")) return (await repo.findByEmail(q)).map(asRecord);
  const rec = await repo.get(wacIdKey(q));
  return rec ? [asRecord(rec)] : [];
}
