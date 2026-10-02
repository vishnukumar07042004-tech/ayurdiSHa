import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadServerEnv, PREVIEW_ROOT } from "./env.js";
import { blobTokenPresent, createBlobStore } from "./blobStore.js";
import { bumpWacCounterInDb, WAC_SEQ_DOC } from "./wacRegNo.js";

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

function emptyStatsDelta() {
  return { total: 0, last14Days: 0, byTheme: {}, byStage: {}, byState: {} };
}

function statsDeltaForQuestion(q, sign = 1) {
  if (!q) return emptyStatsDelta();
  const theme = q.theme || "Unknown";
  const stage = q.stage || "Unknown";
  const state = q.state || "Unknown";
  const in14 = (q.createdAt || 0) >= statsCutoff14() ? sign : 0;
  return {
    total: sign,
    last14Days: in14,
    byTheme: { [theme]: sign },
    byStage: { [stage]: sign },
    byState: { [state]: sign },
  };
}

function mergeStatsDeltas(a, b) {
  const out = emptyStatsDelta();
  out.total = (a.total || 0) + (b.total || 0);
  out.last14Days = (a.last14Days || 0) + (b.last14Days || 0);
  for (const bucket of ["byTheme", "byStage", "byState"]) {
    const merged = { ...(a[bucket] || {}) };
    for (const [k, v] of Object.entries(b[bucket] || {})) {
      merged[k] = (merged[k] || 0) + v;
    }
    out[bucket] = merged;
  }
  return out;
}

function applyCounterMap(target, delta, clampZero = true) {
  for (const [k, v] of Object.entries(delta || {})) {
    const next = (target[k] || 0) + v;
    target[k] = clampZero ? Math.max(0, next) : next;
  }
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
      const db = fileLoad();
      const out = await writer(db) || db;
      fileSave(out);
      return out;
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

  let statsRefreshTimer = null;
  async function refreshStats() {
    const stats = statsFromQuestions(await listQuestions());
    await db.collection(COL_META).doc(DOC_STATS).set(stripUndefined(stats));
    return stats;
  }
  function scheduleRefreshStats() {
    if (statsRefreshTimer) clearTimeout(statsRefreshTimer);
    statsRefreshTimer = setTimeout(() => {
      statsRefreshTimer = null;
      refreshStats().catch(err => {
        console.error("[aym-store] refreshStats failed:", err && err.message ? err.message : err);
      });
    }, 2000);
  }

  async function bumpStats(delta) {
    if (!delta || (!delta.total && !delta.last14Days
      && !Object.keys(delta.byTheme || {}).length
      && !Object.keys(delta.byStage || {}).length
      && !Object.keys(delta.byState || {}).length)) return;
    const ref = db.collection(COL_META).doc(DOC_STATS);
    try {
      const applied = await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        if (!snap.exists || typeof snap.data()?.total !== "number") return false;
        const stats = { ...snap.data() };
        stats.total = Math.max(0, (stats.total || 0) + (delta.total || 0));
        stats.last14Days = Math.max(0, (stats.last14Days || 0) + (delta.last14Days || 0));
        stats.byTheme = { ...(stats.byTheme || {}) };
        stats.byStage = { ...(stats.byStage || {}) };
        stats.byState = { ...(stats.byState || {}) };
        applyCounterMap(stats.byTheme, delta.byTheme);
        applyCounterMap(stats.byStage, delta.byStage);
        applyCounterMap(stats.byState, delta.byState);
        stats.updatedAt = Date.now();
        tx.set(ref, stripUndefined(stats));
        return true;
      });
      if (!applied) scheduleRefreshStats();
    } catch (err) {
      console.error("[aym-store] bumpStats failed:", err && err.message ? err.message : err);
      scheduleRefreshStats();
    }
  }

  async function bumpStatsForQuestionChange(prev, next) {
    let delta = emptyStatsDelta();
    if (prev) delta = mergeStatsDeltas(delta, statsDeltaForQuestion(prev, -1));
    if (next) delta = mergeStatsDeltas(delta, statsDeltaForQuestion(next, 1));
    await bumpStats(delta);
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
        const ref = db.collection(COL_QUESTIONS).doc(id);
        const prevSnap = await ref.get();
        const prev = prevSnap.exists ? fromQuestionDoc(prevSnap.data()) : null;
        await ref.set(rec);
        await bumpStatsForQuestionChange(prev, rec);
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
      await db.collection(COL_KV).doc(encodeKvId(key)).set({
        value: stripUndefined(val),
        updatedAt: Date.now(),
      });
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
    async del(key) {
      if (String(key).startsWith(K_Q)) {
        const id = String(key).slice(K_Q.length);
        const ref = db.collection(COL_QUESTIONS).doc(id);
        const prevSnap = await ref.get();
        const prev = prevSnap.exists ? fromQuestionDoc(prevSnap.data()) : null;
        await ref.delete();
        if (prev) await bumpStatsForQuestionChange(prev, null);
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
      if (snap.exists) return snap.data();
      return refreshStats();
    },
    async listQuestions() {
      return listQuestions();
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
