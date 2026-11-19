import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadServerEnv, PREVIEW_ROOT } from "./env.js";
import { blobTokenPresent, createBlobStore } from "./blobStore.js";
import { bumpWacCounterInDb, WAC_SEQ_DOC } from "./wacRegNo.js";
import { withContentionRetry, isContention, planShardReservation, shardOrder } from "./passIssuer.js";

export const K_Q = "aym:q:";
export const K_CLUSTERS = "aym:clusters";
export const K_CLUSTERS_META = "aym:clusters:meta";
export const K_CONFIG = "aym:config";
export const K_WAC_RESULTS = "aym:wac-results";
export const K_PODCASTS = "aym:podcasts";

export class ClustersVersionConflictError extends Error {
  constructor(currentVersion) {
    super("Clusters were updated by another staff member.");
    this.name = "ClustersVersionConflictError";
    this.currentVersion = currentVersion;
  }
}

export class WacVersionConflictError extends Error {
  constructor(currentVersion) {
    super("The WAC selection list was updated by another staff member.");
    this.name = "WacVersionConflictError";
    this.currentVersion = currentVersion;
  }
}

const COL_QUESTIONS = "questions";
const COL_META = "meta";
const COL_KV = "kv";
const DOC_CLUSTERS = "clusters";
const DOC_STATS = "stats";

const bundledStorePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../data/store.json");

function fileStorePath() {
  const override = String(process.env.AYM_STORE_FILE || "").trim();
  if (override && !process.env.VERCEL) {
    const p = path.resolve(override);
    if (!fs.existsSync(p)) fs.writeFileSync(p, "{}");
    return p;
  }
  if (!process.env.VERCEL) return bundledStorePath;
  // Never seed Vercel /tmp from the bundled demo file — that fake pair of
  // delegates is what staff were seeing while real registrations vanished.
  const tmp = "/tmp/aym-store.json";
  try {
    if (!fs.existsSync(tmp)) fs.writeFileSync(tmp, "{}");
  } catch (err) {
    console.error("[aym-store] could not prepare writable store:", err && err.message ? err.message : err);
    return bundledStorePath;
  }
  return tmp;
}

const CRED_CANDIDATES = [
  path.resolve(PREVIEW_ROOT, "serviceAccount.json"),
  path.resolve(PREVIEW_ROOT, "serviceAccountKey.json"),
  path.resolve(PREVIEW_ROOT, "firebase-adminsdk.json"),
];

function stripUndefined(value) {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(stripUndefined).filter(v => v !== undefined);
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (v === undefined) continue;
    const next = stripUndefined(v);
    if (next !== undefined) out[k] = next;
  }
  return out;
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function normalizePrivateKey(raw) {
  return String(raw || "").replace(/\\n/g, "\n").trim();
}

function credsFromServiceAccount(sa, source) {
  if (!sa || typeof sa !== "object") return null;
  const projectId = String(sa.project_id || "").trim();
  const clientEmail = String(sa.client_email || "").trim();
  const privateKey = normalizePrivateKey(sa.private_key);
  if (!projectId || !clientEmail || !privateKey) return null;
  return { projectId, clientEmail, privateKey, source };
}

function findDroppedServiceAccount() {
  for (const p of CRED_CANDIDATES) {
    const sa = readJsonFile(p);
    const creds = credsFromServiceAccount(sa, p);
    if (creds) return creds;
  }
  try {
    const names = fs.readdirSync(PREVIEW_ROOT);
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      if (!/firebase-adminsdk|service.?account/i.test(name)) continue;
      const p = path.resolve(PREVIEW_ROOT, name);
      const creds = credsFromServiceAccount(readJsonFile(p), p);
      if (creds) return creds;
    }
  } catch { /* ignore */ }
  return null;
}

export function resolveFirebaseCreds() {
  const env = loadServerEnv();

  const fromFields = {
    projectId: String(env.FIREBASE_PROJECT_ID || env.GCLOUD_PROJECT || env.GOOGLE_CLOUD_PROJECT || "").trim(),
    clientEmail: String(env.FIREBASE_CLIENT_EMAIL || "").trim(),
    privateKey: normalizePrivateKey(env.FIREBASE_PRIVATE_KEY),
    source: "env",
  };
  if (fromFields.projectId && fromFields.clientEmail && fromFields.privateKey) return fromFields;

  const inline = String(env.FIREBASE_SERVICE_ACCOUNT_JSON || "").trim();
  if (inline) {
    try {
      const creds = credsFromServiceAccount(JSON.parse(inline), "FIREBASE_SERVICE_ACCOUNT_JSON");
      if (creds) return creds;
    } catch { /* ignore */ }
  }

  const credPath = String(env.GOOGLE_APPLICATION_CREDENTIALS || env.FIREBASE_SERVICE_ACCOUNT || "").trim();
  if (credPath) {
    const resolved = path.isAbsolute(credPath) ? credPath : path.resolve(PREVIEW_ROOT, credPath);
    const creds = credsFromServiceAccount(readJsonFile(resolved), resolved);
    if (creds) return creds;
  }

  return findDroppedServiceAccount();
}

const STATS_DAY_MS = 24 * 60 * 60 * 1000;

function statsCutoff14(now = Date.now()) {
  return now - 14 * STATS_DAY_MS;
}

function statsFromQuestions(questions) {
  const now = Date.now();
  const cutoff14 = statsCutoff14(now);
  const byTheme = {};
  const byStage = {};
  const byState = {};
  let last14Days = 0;
  for (const s of questions) {
    const theme = s.theme || "Unknown";
    const stage = s.stage || "Unknown";
    const state = s.state || "Unknown";
    byTheme[theme] = (byTheme[theme] || 0) + 1;
    byStage[stage] = (byStage[stage] || 0) + 1;
    byState[state] = (byState[state] || 0) + 1;
    if ((s.createdAt || 0) >= cutoff14) last14Days += 1;
  }
  return {
    total: questions.length,
    last14Days,
    byTheme,
    byStage,
    byState,
    updatedAt: now,
  };
}

/** Staff stats are recomputed on read at most this often (no per-submit write to one hot doc). */
const STATS_TTL_MS = 5 * 60 * 1000;
/** Visit counters are spread over this many docs so a QR rush never queues on one document. */
export const VISIT_SHARDS = 10;

/** Sum the legacy `visit-sources` doc and its shards into one `{ totals, days, updatedAt }`. */
export function mergeVisitDocs(docs) {
  const totals = {};
  const days = {};
  let updatedAt = 0;
  for (const d of docs || []) {
    if (!d) continue;
    for (const [src, n] of Object.entries(d.totals || {})) totals[src] = (totals[src] || 0) + (Number(n) || 0);
    for (const [day, bySrc] of Object.entries(d.days || {})) {
      const out = days[day] || (days[day] = {});
      for (const [src, n] of Object.entries(bySrc || {})) out[src] = (out[src] || 0) + (Number(n) || 0);
    }
    updatedAt = Math.max(updatedAt, Number(d.updatedAt) || 0);
  }
  return docs && docs.length ? { totals, days, updatedAt } : null;
}

function fileLoad() {
  try { return JSON.parse(fs.readFileSync(fileStorePath(), "utf8")); }
  catch { return {}; }
}

function fileSave(db) {
  const dest = fileStorePath();
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify(db, null, 2));
}

function questionsFromDb(db) {
  return Object.keys(db)
    .filter(k => k.startsWith(K_Q))
    .map(k => db[k])
    .filter(s => s && s.id);
}

function clustersMetaFromDb(db) {
  const val = db[K_CLUSTERS];
  const meta = db[K_CLUSTERS_META] || {};
  return {
    value: Array.isArray(val) ? val : [],
    version: meta.version || 1,
    updatedAt: meta.updatedAt || 0,
  };
}

function saveClustersInDb(db, clusters, expectedVersion) {
  const current = clustersMetaFromDb(db);
  if (expectedVersion != null && expectedVersion !== current.version) {
    throw new ClustersVersionConflictError(current.version);
  }
  const nextVersion = current.version + 1;
  const now = Date.now();
  db[K_CLUSTERS] = Array.isArray(clusters) ? clusters : [];
  db[K_CLUSTERS_META] = { version: nextVersion, updatedAt: now };
  return { clusters: db[K_CLUSTERS], version: nextVersion, updatedAt: now };
}

export function createFileStore() {
  // Every write is load → change → save with no await in between, so it is atomic within this
  // process; async transact writers are serialised so nothing can interleave with them.
  let lock = Promise.resolve();
  return {
    name: "file",
    async get(key) {
      const db = fileLoad();
      return key in db ? db[key] : null;
    },
    async exists(key) {
      const db = fileLoad();
      return key in db;
    },
    async set(key, val) {
      const db = fileLoad();
      db[key] = val;
      fileSave(db);
    },
    async merge(entries) {
      const db = fileLoad();
      for (const [k, v] of Object.entries(entries || {})) db[k] = v;
      fileSave(db);
    },
    async transact(writer) {
      const run = async () => {
        const db = fileLoad();
        let out = writer(db);
        if (out && typeof out.then === "function") out = await out;
        out = out || db;
        fileSave(out);
        return out;
      };
      const p = lock.then(run, run);
      lock = p.catch(() => {});
      return p;
    },
    async update(key, fn) {
      await lock;
      const db = fileLoad();
      const cur = key in db ? db[key] : null;
      const next = fn(cur == null ? null : JSON.parse(JSON.stringify(cur)));
      if (next === undefined) return cur;
      db[key] = next;
      fileSave(db);
      return next;
    },
    async create(key, val) {
      await lock;
      const db = fileLoad();
      if (db[key] != null) return false;
      db[key] = val;
      fileSave(db);
      return true;
    },
    async incrementCounter(name = WAC_SEQ_DOC) {
      let next = 0;
      await this.transact(db => {
        next = bumpWacCounterInDb(db, name);
        return db;
      });
      return next;
    },
    async del(key) {
      const db = fileLoad();
      delete db[key];
      fileSave(db);
    },
    async list(prefix = "") {
      const db = fileLoad();
      return Object.keys(db).filter(k => k.startsWith(prefix || ""));
    },
    async lookup(needle) {
      const db = fileLoad();
      return questionsFromDb(db).filter(s =>
        String(s.ticket || "").toLowerCase() === needle ||
        String(s.email || "").toLowerCase() === needle
      );
    },
    async stats() {
      const db = fileLoad();
      return statsFromQuestions(questionsFromDb(db));
    },
    async listQuestions() {
      return questionsFromDb(fileLoad());
    },
    async pageQuestions({ after = "", limit = 250, sinceCreated = 0 } = {}) {
      const all = questionsFromDb(fileLoad());
      if (sinceCreated > 0) {
        const items = all.filter(s => (s.createdAt || 0) >= sinceCreated)
          .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)).slice(0, limit);
        return { items, scanned: items.length, done: items.length < limit };
      }
      const sorted = all.sort((a, b) => (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0));
      const rest = after ? sorted.filter(s => String(s.id) > String(after)) : sorted;
      const items = rest.slice(0, limit);
      return { items, scanned: items.length, done: rest.length <= limit };
    },
    async countQuestions() {
      return questionsFromDb(fileLoad()).length;
    },
    async pageKv(prefix, { after = "", limit = 250 } = {}) {
      const db = fileLoad();
      const keys = Object.keys(db).filter(k => k.startsWith(prefix) && (!after || k > after)).sort();
      return { items: keys.slice(0, limit).map(key => ({ key, value: db[key] })), done: keys.length <= limit };
    },
    async countKv(prefix) {
      return Object.keys(fileLoad()).filter(k => k.startsWith(prefix)).length;
    },
    async getPrefix(prefix) {
      const db = fileLoad();
      const out = {};
      for (const k of Object.keys(db)) if (k.startsWith(prefix)) out[k] = db[k];
      return out;
    },
    async snapshot() {
      return fileLoad();
    },
    async getClustersMeta() {
      return clustersMetaFromDb(fileLoad());
    },
    async saveClusters(clusters, expectedVersion) {
      const db = fileLoad();
      const result = saveClustersInDb(db, clusters, expectedVersion);
      fileSave(db);
      return result;
    },
  };
}

function encodeKvId(key) {
  return encodeURIComponent(String(key));
}

const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * Short-lived KV records carry a top-level `expireAt` (Firestore Timestamp) so a Firestore TTL
 * policy on `kv.expireAt` can back up the daily retention sweep. Each TTL is at or above the longest
 * retention an admin may set for that kind (server/staffAuth.js RETENTION_LIMITS) or its use window.
 */
export const KV_TTL_MS = Object.freeze({
  "aym:otp:": 7 * DAY_MS,
  "aym:wacrate:": 7 * DAY_MS,
  "aym:sess:": 365 * DAY_MS,
  "aym:wacalert:": 400 * DAY_MS,
  "aym:mail:": 30 * DAY_MS,
});

export function kvTtlMs(key) {
  const k = String(key);
  for (const [prefix, ms] of Object.entries(KV_TTL_MS)) if (k.startsWith(prefix)) return ms;
  return 0;
}

function kvDoc(key, value, now = Date.now()) {
  const doc = { value, updatedAt: now };
  const ttl = kvTtlMs(key);
  if (ttl) doc.expireAt = new Date(now + ttl);
  return doc;
}

function decodeKvId(id) {
  try { return decodeURIComponent(String(id)); }
  catch { return String(id); }
}

function toQuestionDoc(val) {
  const rec = stripUndefined({ ...val }) || {};
  rec.text = rec.question || rec.text || "";
  rec.emailLower = String(rec.email || "").trim().toLowerCase();
  rec.ticketLower = String(rec.ticket || "").trim().toLowerCase();
  rec.createdAt = typeof rec.createdAt === "number" ? rec.createdAt : Date.now();
  return rec;
}

function fromQuestionDoc(data) {
  if (!data) return null;
  const { emailLower, ticketLower, ...rest } = data;
  return rest;
}

export async function createFirestoreStore(creds) {
  const { initializeApp, getApps, cert } = await import("firebase-admin/app");
  const { getFirestore, FieldPath } = await import("firebase-admin/firestore");

  const appName = "aym-preview";
  const existing = getApps().find(a => a.name === appName);
  const app = existing || initializeApp({
    credential: cert({
      projectId: creds.projectId,
      clientEmail: creds.clientEmail,
      privateKey: creds.privateKey,
    }),
    projectId: creds.projectId,
  }, appName);

  const db = getFirestore(app);

  async function listQuestions() {
    const snap = await db.collection(COL_QUESTIONS).get();
    return snap.docs.map(d => fromQuestionDoc(d.data())).filter(s => s && s.id);
  }

  // Staff-only aggregate. It used to be bumped in a transaction on every question write, which
  // made meta/stats a single-document hotspot during submit bursts; now it is recomputed on read.
  async function refreshStats() {
    const stats = statsFromQuestions(await listQuestions());
    try { await db.collection(COL_META).doc(DOC_STATS).set(stripUndefined(stats)); }
    catch (err) { console.error("[aym-store] stats cache write failed:", err && err.message ? err.message : err); }
    return stats;
  }

  function kvPrefixQuery(prefix) {
    const lo = encodeKvId(prefix);
    return db.collection(COL_KV)
      .where(FieldPath.documentId(), ">=", lo)
      .where(FieldPath.documentId(), "<", lo + "\uf8ff");
  }

  // Reading every doc is the only way to spot demo / duplicate records, so it
  // runs on a slow cadence; the per-minute numbers come from count() aggregations.
  const PUBLIC_SCAN_TTL_MS = 30 * 60 * 1000;
  let publicScan = null;
  async function publicCountsScan(userPrefix, isDemo) {
    if (publicScan && Date.now() - publicScan.at < PUBLIC_SCAN_TTL_MS) return publicScan;
    const [users, questions] = await Promise.all([
      kvPrefixQuery(userPrefix).select("value.email", "value.name").get(),
      db.collection(COL_QUESTIONS).select("id", "ticket", "email", "name").get(),
    ]);
    const genuineEmails = new Set();
    users.docs.forEach(d => {
      const v = d.get("value") || {};
      if (!v.email || !v.name || isDemo(v)) return;
      genuineEmails.add(String(v.email).trim().toLowerCase());
    });
    const demoKeys = new Set();
    const ticketToId = new Map();
    let demoQuestions = 0;
    questions.docs.forEach(d => {
      const q = d.data() || {};
      const id = String(q.id || d.id);
      if (q.ticket) ticketToId.set(String(q.ticket).trim(), id);
      if (isDemo(q)) {
        demoQuestions += 1;
        demoKeys.add(id);
      }
    });
    publicScan = {
      at: Date.now(),
      userOffset: Math.max(0, users.size - genuineEmails.size),
      questionOffset: demoQuestions,
      demoKeys,
      ticketToId,
    };
    return publicScan;
  }

  async function publicCounts({ userPrefix, isDemo = () => false } = {}) {
    const [scan, userCount, questionCount, individual, clusters] = await Promise.all([
      publicCountsScan(userPrefix, isDemo),
      kvPrefixQuery(userPrefix).count().get(),
      db.collection(COL_QUESTIONS).count().get(),
      db.collection(COL_QUESTIONS).where("individualAt", ">", 0).select("id").get(),
      readClustersDoc(),
    ]);
    const registeredStudents = Math.max(0, userCount.data().count - scan.userOffset);
    const questionsAsked = Math.max(0, questionCount.data().count - scan.questionOffset);
    const answered = new Set();
    individual.docs.forEach(d => {
      const id = String(d.get("id") || d.id);
      if (!scan.demoKeys.has(id)) answered.add(id);
    });
    clusters.value.forEach(c => {
      if (!c || !String(c.answer || c.mergedAnswer || c.mentorAnswer || "").trim()) return;
      (c.memberIds || []).forEach(m => {
        const raw = String(m || "").trim();
        const id = scan.ticketToId.get(raw) || raw;
        if (id && !scan.demoKeys.has(id)) answered.add(id);
      });
    });
    return {
      registeredStudents,
      questionsAsked,
      questionsAnswered: Math.min(answered.size, questionsAsked),
    };
  }

  async function readClustersDoc() {
    const snap = await db.collection(COL_META).doc(DOC_CLUSTERS).get();
    if (!snap.exists) return { value: [], version: 1, updatedAt: 0 };
    const data = snap.data() || {};
    return {
      value: Array.isArray(data.value) ? data.value : [],
      version: data.version || 1,
      updatedAt: data.updatedAt || 0,
    };
  }

  return {
    name: "firestore",
    projectId: creds.projectId,
    async get(key) {
      if (String(key).startsWith(K_Q)) {
        const id = String(key).slice(K_Q.length);
        const snap = await db.collection(COL_QUESTIONS).doc(id).get();
        return snap.exists ? fromQuestionDoc(snap.data()) : null;
      }
      if (key === K_CLUSTERS) {
        return (await readClustersDoc()).value;
      }
      const snap = await db.collection(COL_KV).doc(encodeKvId(key)).get();
      return snap.exists ? (snap.data()?.value ?? null) : null;
    },
    async exists(key) {
      if (String(key).startsWith(K_Q)) {
        const id = String(key).slice(K_Q.length);
        const snap = await db.collection(COL_QUESTIONS).doc(id).get();
        return snap.exists;
      }
      if (key === K_CLUSTERS) {
        const snap = await db.collection(COL_META).doc(DOC_CLUSTERS).get();
        return snap.exists;
      }
      const snap = await db.collection(COL_KV).doc(encodeKvId(key)).get();
      return snap.exists;
    },
    async set(key, val) {
      if (String(key).startsWith(K_Q)) {
        const rec = toQuestionDoc(val);
        const id = String(rec.id || String(key).slice(K_Q.length));
        rec.id = id;
        await db.collection(COL_QUESTIONS).doc(id).set(rec);
        return;
      }
      if (key === K_CLUSTERS) {
        const current = await readClustersDoc();
        const nextVersion = current.version + 1;
        await db.collection(COL_META).doc(DOC_CLUSTERS).set({
          value: Array.isArray(val) ? val : [],
          version: nextVersion,
          updatedAt: Date.now(),
        });
        return;
      }
      await db.collection(COL_KV).doc(encodeKvId(key)).set(kvDoc(key, stripUndefined(val)));
    },
    async merge(entries) {
      await Promise.all(Object.entries(entries || {}).map(([k, v]) => this.set(k, v)));
    },
    async getMany(keys) {
      const list = [...new Set((keys || []).filter(Boolean))];
      const vals = await Promise.all(list.map(k => this.get(k)));
      const out = {};
      list.forEach((k, i) => { if (vals[i] != null) out[k] = vals[i]; });
      return out;
    },
    async writeDiff(prev, out) {
      const keys = new Set([...Object.keys(prev), ...Object.keys(out)]);
      const ops = [];
      for (const k of keys) {
        if (k === "__rev") continue;
        const next = out[k];
        const old = prev[k];
        if (next === undefined) {
          if (old !== undefined) ops.push(this.del(k));
        } else if (JSON.stringify(next) !== JSON.stringify(old)) {
          ops.push(this.set(k, next));
        }
      }
      await Promise.all(ops);
    },
    async transact(writer) {
      const snap = await this.snapshot();
      let prev;
      try { prev = JSON.parse(JSON.stringify(snap)); }
      catch { prev = { ...snap }; }
      const out = await writer(snap) || snap;
      await this.writeDiff(prev, out);
      return out;
    },
    /** Like transact, but only loads `keys` (plus whatever `expand` adds) instead of every document. */
    async transactKeys(keys, writer, expand) {
      const db = await this.getMany(keys);
      if (typeof expand === "function") {
        const more = (expand(db) || []).filter(k => k && !(k in db));
        if (more.length) Object.assign(db, await this.getMany(more));
      }
      const prev = JSON.parse(JSON.stringify(db));
      const out = await writer(db) || db;
      await this.writeDiff(prev, out);
      return out;
    },
    /** Atomic read-modify-write of one KV document (per-user / per-email docs, never a shared one). */
    async update(key, fn) {
      if (String(key).startsWith(K_Q) || key === K_CLUSTERS) throw new Error("update() is for KV keys only");
      const ref = db.collection(COL_KV).doc(encodeKvId(key));
      return withContentionRetry(() => db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        const cur = snap.exists ? (snap.data()?.value ?? null) : null;
        const next = fn(cur == null ? null : JSON.parse(JSON.stringify(cur)));
        if (next === undefined) return cur;
        const clean = stripUndefined(next);
        tx.set(ref, kvDoc(key, clean));
        return clean;
      }));
    },
    /** Create-if-absent; false when the document already exists (the uniqueness guarantee). */
    async create(key, val) {
      const ref = db.collection(COL_KV).doc(encodeKvId(key));
      try {
        await withContentionRetry(() => ref.create(kvDoc(key, stripUndefined(val))));
        return true;
      } catch (err) {
        if (err && (err.code === 6 || err.code === "already-exists" || /ALREADY_EXISTS/i.test(String(err.message || "")))) return false;
        throw err;
      }
    },
    /**
     * Reserve a block of pass numbers from a random shard of `meta/<name>~s<k>`. The first
     * reservation on a shard fixes `base` from the legacy `meta/<name>` counter (stored there as
     * `blockBase`, so every shard agrees). See server/passIssuer.js.
     */
    async reserveBlock(name, size, { shards = 8, initialBase } = {}) {
      const legacyRef = db.collection(COL_META).doc(String(name || WAC_SEQ_DOC));
      const shardRef = k => db.collection(COL_META).doc(`${name}~s${k}`);
      // Peek at two shards outside the transaction (cheap reads) and use the less-used one.
      const peek = new Map();
      const probe = shardOrder(shards, () => null);
      try {
        const snaps = await db.getAll(shardRef(probe[0]), shardRef(probe[1]));
        snaps.forEach((s, i) => peek.set(probe[i], s.exists ? Number(s.data().blocks) || 0 : 0));
      } catch { /* order stays random */ }
      const order = peek.size === 2
        ? (peek.get(probe[1]) < peek.get(probe[0]) ? [probe[1], probe[0]] : [probe[0], probe[1]]).concat(probe.slice(2))
        : probe;
      let lastErr;
      for (const shard of order) {
        const ref = shardRef(shard);
        try {
          return await withContentionRetry(() => db.runTransaction(async tx => {
            const snap = await tx.get(ref);
            const shardDoc = snap.exists ? snap.data() || {} : null;
            const args = { name, shard, shards, size, shardDoc, initialBase };
            let plan = planShardReservation(args);
            if (plan.needsLegacy) {
              const legacy = await tx.get(legacyRef);
              plan = planShardReservation({ ...args, legacyDoc: legacy.exists ? legacy.data() || {} : null });
            }
            if (plan.legacyWrite) tx.set(legacyRef, plan.legacyWrite, { merge: true });
            tx.set(ref, plan.shardWrite, { merge: true });
            return plan.range;
          }, { maxAttempts: 3 }), { attempts: 4 });
        } catch (err) {
          lastErr = err;
          if (!isContention(err)) throw err;
        }
      }
      throw lastErr;
    },
    async incrementCounter(name = WAC_SEQ_DOC) {
      const ref = db.collection(COL_META).doc(String(name || WAC_SEQ_DOC));
      return db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        const last = snap.exists ? Number(snap.data()?.last || 0) : 0;
        const next = (Number.isFinite(last) ? last : 0) + 1;
        tx.set(ref, { last: next, updatedAt: Date.now() }, { merge: true });
        return next;
      });
    },
    /** Blind increments on one of VISIT_SHARDS docs — no read, no transaction, no single hot doc. */
    async incrementVisitSource(src, day) {
      const { FieldValue } = await import("firebase-admin/firestore");
      const shard = crypto.randomInt(0, VISIT_SHARDS);
      await db.collection(COL_META).doc(`visit-sources~s${shard}`).set({
        totals: { [src]: FieldValue.increment(1) },
        days: { [day]: { [src]: FieldValue.increment(1) } },
        updatedAt: Date.now(),
      }, { merge: true });
    },
    async getVisitSources() {
      const ids = ["visit-sources", ...Array.from({ length: VISIT_SHARDS }, (_, k) => `visit-sources~s${k}`)];
      const snaps = await db.getAll(...ids.map(id => db.collection(COL_META).doc(id)));
      return mergeVisitDocs(snaps.filter(s => s.exists).map(s => s.data()));
    },
    async del(key) {
      if (String(key).startsWith(K_Q)) {
        const id = String(key).slice(K_Q.length);
        await db.collection(COL_QUESTIONS).doc(id).delete();
        return;
      }
      if (key === K_CLUSTERS) {
        await db.collection(COL_META).doc(DOC_CLUSTERS).delete();
        return;
      }
      await db.collection(COL_KV).doc(encodeKvId(key)).delete();
    },
    async list(prefix = "") {
      const keys = [];
      const p = prefix || "";
      const wantQuestions = !p || K_Q.startsWith(p) || p.startsWith(K_Q);
      const wantClusters = !p || K_CLUSTERS.startsWith(p);
      const [qs, cl, kv] = await Promise.all([
        wantQuestions ? db.collection(COL_QUESTIONS).select().get() : null,
        wantClusters ? db.collection(COL_META).doc(DOC_CLUSTERS).get() : null,
        (p ? kvPrefixQuery(p) : db.collection(COL_KV)).select().get(),
      ]);
      if (qs) qs.docs.forEach(d => {
        const k = K_Q + d.id;
        if (k.startsWith(p)) keys.push(k);
      });
      if (cl && cl.exists) keys.push(K_CLUSTERS);
      kv.docs.forEach(d => {
        const k = decodeKvId(d.id);
        if (k.startsWith(p)) keys.push(k);
      });
      return keys;
    },
    async lookup(needle) {
      const col = db.collection(COL_QUESTIONS);
      const [byTicket, byEmail] = await Promise.all([
        col.where("ticketLower", "==", needle).get(),
        col.where("emailLower", "==", needle).get(),
      ]);
      const map = new Map();
      for (const snap of [byTicket, byEmail]) {
        snap.docs.forEach(d => {
          const rec = fromQuestionDoc(d.data());
          if (rec && rec.id) map.set(rec.id, rec);
        });
      }
      return [...map.values()];
    },
    async stats() {
      const snap = await db.collection(COL_META).doc(DOC_STATS).get();
      const cached = snap.exists ? snap.data() : null;
      if (cached && typeof cached.total === "number" && Date.now() - (cached.updatedAt || 0) < STATS_TTL_MS) return cached;
      return refreshStats();
    },
    async listQuestions() {
      return listQuestions();
    },
    /**
     * One page of questions in document-id order (`after` = last id of the previous page), or the
     * questions created at / after `sinceCreated` (newest edits are caught by the counts check).
     */
    async pageQuestions({ after = "", limit = 250, sinceCreated = 0 } = {}) {
      let q = db.collection(COL_QUESTIONS);
      if (sinceCreated > 0) q = q.where("createdAt", ">=", sinceCreated).orderBy("createdAt");
      else {
        q = q.orderBy(FieldPath.documentId());
        if (after) q = q.startAfter(String(after));
      }
      const snap = await q.limit(limit).get();
      return {
        items: snap.docs.map(d => fromQuestionDoc(d.data())).filter(s => s && s.id),
        scanned: snap.size,
        done: snap.size < limit,
      };
    },
    async countQuestions() {
      return (await db.collection(COL_QUESTIONS).count().get()).data().count;
    },
    /** One page of KV docs under `prefix` in key order; `fields` projects `value.<field>` only. */
    async pageKv(prefix, { after = "", limit = 250, fields = null } = {}) {
      let q = kvPrefixQuery(prefix).orderBy(FieldPath.documentId());
      if (after) q = q.startAfter(encodeKvId(after));
      if (Array.isArray(fields) && fields.length) q = q.select(...fields.map(f => `value.${f}`));
      const snap = await q.limit(limit).get();
      return {
        items: snap.docs.map(d => ({ key: decodeKvId(d.id), value: d.get("value") ?? null })),
        done: snap.size < limit,
      };
    },
    async countKv(prefix) {
      return (await kvPrefixQuery(prefix).count().get()).data().count;
    },
    /** Every KV doc under `prefix` in one query (instead of a list + one get per key). */
    async getPrefix(prefix) {
      const snap = await kvPrefixQuery(prefix).get();
      const out = {};
      snap.docs.forEach(d => { out[decodeKvId(d.id)] = d.data()?.value ?? null; });
      return out;
    },
    publicCounts,
    async saveVersionedKv(key, writer, expectedVersion) {
      const ref = db.collection(COL_KV).doc(encodeKvId(key));
      return db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        const prev = snap.exists ? (snap.data()?.value ?? {}) : {};
        const currentVersion = prev.version || 1;
        if (expectedVersion != null && expectedVersion !== currentVersion) {
          throw new WacVersionConflictError(currentVersion);
        }
        const next = writer(prev) || prev;
        next.version = currentVersion + 1;
        tx.set(ref, { value: stripUndefined(next), updatedAt: Date.now() });
        return next;
      });
    },
    async snapshot() {
      const out = {};
      const [qs, clusters, kv] = await Promise.all([
        db.collection(COL_QUESTIONS).get(),
        db.collection(COL_META).doc(DOC_CLUSTERS).get(),
        db.collection(COL_KV).get(),
      ]);
      qs.docs.forEach(d => { out[K_Q + d.id] = fromQuestionDoc(d.data()); });
      if (clusters.exists) {
        const value = clusters.data()?.value;
        out[K_CLUSTERS] = Array.isArray(value) ? value : [];
      }
      kv.docs.forEach(d => { out[decodeKvId(d.id)] = d.data()?.value ?? null; });
      return out;
    },
    async getClustersMeta() {
      return readClustersDoc();
    },
    async saveClusters(clusters, expectedVersion) {
      const ref = db.collection(COL_META).doc(DOC_CLUSTERS);
      return db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        let currentVersion = 1;
        if (snap.exists) {
          const data = snap.data() || {};
          currentVersion = data.version || 1;
          if (expectedVersion != null && expectedVersion !== currentVersion) {
            throw new ClustersVersionConflictError(currentVersion);
          }
        } else if (expectedVersion != null && expectedVersion > 1) {
          throw new ClustersVersionConflictError(1);
        }
        const nextVersion = currentVersion + 1;
        const now = Date.now();
        tx.set(ref, {
          value: Array.isArray(clusters) ? clusters : [],
          version: nextVersion,
          updatedAt: now,
        });
        return { clusters: Array.isArray(clusters) ? clusters : [], version: nextVersion, updatedAt: now };
      });
    },
  };
}

export async function createAymStore() {
  // Local QA: AYM_STORE=file keeps tests off the shared Firestore / Blob stores.
  if (!process.env.VERCEL && String(process.env.AYM_STORE || "").trim().toLowerCase() === "file") {
    console.log(`[aym-store] AYM_STORE=file — using ${fileStorePath()}`);
    return createFileStore();
  }
  const creds = resolveFirebaseCreds();
  if (creds) {
    try {
      const store = await createFirestoreStore(creds);
      console.log(`[aym-store] Firestore ready (project ${creds.projectId}, source ${creds.source})`);
      return store;
    } catch (err) {
      console.error("[aym-store] Firestore init failed; trying Blob / file:", err && err.message ? err.message : err);
    }
  }

  if (blobTokenPresent()) {
    try {
      const store = createBlobStore();
      console.log("[aym-store] Vercel Blob ready (shared live store for delegates + questions)");
      return store;
    } catch (err) {
      console.error("[aym-store] Blob init failed; using store.json:", err && err.message ? err.message : err);
    }
  }

  if (process.env.VERCEL) {
    console.warn("[aym-store] Vercel has no Blob token — records will not survive across instances. Link a Blob store.");
  } else {
    console.log("[aym-store] Using data/store.json (local file)");
  }
  return createFileStore();
}
